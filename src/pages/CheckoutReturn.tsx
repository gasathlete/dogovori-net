import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";
import { AlertTriangle, CheckCircle2, Info, Loader2 } from "@/icons";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { trackCheckoutCompleted } from "@/lib/docFunnel";
import { describeCheckoutReturn, type PurchaseKind } from "@/lib/checkoutAnalytics";
import { sanitizeReturnPath } from "@/lib/safeRoute";
import { fetchEntitlementBySession } from "@/lib/productEntitlements";
import { PRODUCT_RESULT_PATH, isOneTimeProductId } from "@/lib/products";
import { clearCheckoutIntent } from "@/lib/checkoutIntent";

/**
 * Връщането от Stripe само по себе си НЕ е доказателство за плащане. Затова
 * потвърждаваме операционно: плащането е записано в `order_snapshots` за точно
 * този потребител и точно тази сесия, а даденото право е реално начислено.
 * При изтичане на изчакването НЕ се излъчва завършване.
 */
/**
 * Брой проверки на потвърждението след връщане от Stripe. В тестова среда е
 * кратко, за да не се чака реално време; в приложението прозорецът е ~90 с.
 */
export const CONFIRM_ATTEMPTS = import.meta.env.MODE === "test" ? 3 : 24;

/**
 * Нарастващи интервали: бързо в началото, после по-спокойно. Общо покритие
 * около 90 секунди — достатъчно и за по-бавно пристигащ webhook.
 */
export function confirmDelayMs(attempt: number): number {
  if (attempt <= 4) return 1500;
  if (attempt <= 10) return 3000;
  return 5000;
}

export default function CheckoutReturn() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const type = params.get("type") || "";
  const descriptor = useMemo(() => describeCheckoutReturn(params), [params]);
  const resumeFromSession = (() => {
    try { return sessionStorage.getItem("wizard:resume") || ""; } catch { return ""; }
  })();
  // `redirect` идва от URL на Stripe връщането — приема се само относителен път
  // в същия origin; иначе бутонът „Продължи“ не се показва.
  const redirectTo =
    sanitizeReturnPath(params.get("redirect")) ??
    (descriptor.kind === "strict_unlock" || type === "strict_unlock"
      ? sanitizeReturnPath(resumeFromSession) ?? ""
      : "");
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();


  const [readyAt, setReadyAt] = useState<"pending" | "ready" | "timeout">("pending");

  /**
   * Проверява едновременно потвърждението за плащане и съответстващото право.
   * Никога не приема заварен общ баланс — само ред, обвързан с тази сесия
   * (или активен абонамент при потвърдено плащане).
   */
  const confirmPaid = useCallback(
    async (uid: string, sid: string, kind: PurchaseKind): Promise<boolean> => {
      const { data: snapshot } = await supabase
        .from("order_snapshots")
        .select("id")
        .eq("user_id", uid)
        .eq("stripe_session_id", sid)
        .maybeSingle();
      const paid = !!snapshot;

      const oneOff = async (table: "topup_purchases" | "strict_doc_unlocks" | "branding_unlocks") => {
        const { data } = await supabase
          .from(table)
          .select("id")
          .eq("user_id", uid)
          .eq("stripe_session_id", sid)
          .maybeSingle();
        return !!data;
      };

      switch (kind) {
        case "product": {
          // Продуктова покупка: изискваме едновременно платен snapshot за тази
          // сесия със точния продукт И съответстващата привилегия. Само
          // snapshot не е достатъчен.
          const productParam = params.get("product");
          if (!isOneTimeProductId(productParam)) return false;
          const { data: productSnapshot } = await supabase
            .from("order_snapshots")
            .select("id, payment_status, purchase_kind, product_id")
            .eq("user_id", uid)
            .eq("stripe_session_id", sid)
            .maybeSingle();
          const snap = productSnapshot as
            | { payment_status?: string | null; purchase_kind?: string | null; product_id?: string | null }
            | null;
          if (
            !snap ||
            snap.payment_status !== "paid" ||
            snap.purchase_kind !== "product" ||
            snap.product_id !== productParam
          ) {
            return false;
          }
          const entitlement = await fetchEntitlementBySession(uid, sid);
          return !!entitlement && entitlement.product_id === productParam;
        }
        case "entry_pack":
        case "topup":
          // Записът се създава от същия fail-closed webhook и носи session id —
          // служи и като потвърждение, и като готовност (легаси съвместимост).
          return await oneOff("topup_purchases");
        case "strict_unlock":
          return await oneOff("strict_doc_unlocks");
        case "branding":
          return await oneOff("branding_unlocks");
        case "subscription": {
          if (!paid) return false;
          const { data: q } = await supabase
            .from("download_quota")
            .select("plan, pro_until")
            .eq("user_id", uid)
            .maybeSingle();
          return !!q && (q.plan === "pro" || (!!q.pro_until && new Date(q.pro_until) > new Date()));
        }
        case "team": {
          if (!paid) return false;
          const { data: membership } = await supabase
            .from("team_members")
            .select("team_id, teams!inner(status)")
            .eq("user_id", uid)
            .in("teams.status", ["active", "trialing"])
            .limit(1)
            .maybeSingle();
          return !!membership;
        }
        default:
          // Непознат вид покупка: не потвърждаваме нищо. Само snapshot не е
          // доказателство, че точно това право е дадено.
          return false;
      }

    },
    [params],
  );

  useEffect(() => {
    if (authLoading || !user || !sessionId) return;
    let cancelled = false;
    let attempts = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const tick = async () => {
      attempts++;
      let ok = false;
      try {
        ok = await confirmPaid(user.id, sessionId, descriptor.kind);
      } catch {
        ok = false;
      }
      if (cancelled) return;
      if (ok) setReadyAt("ready");
      // Търпелив прозорец: webhook-ът понякога идва след няколко секунди.
      // Стъпките растат (1,5 с → 5 с) и общо покриват около 90 секунди.
      else if (attempts >= CONFIRM_ATTEMPTS) setReadyAt("timeout");
      else timer = setTimeout(tick, confirmDelayMs(attempts));
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [authLoading, user, sessionId, descriptor.kind, confirmPaid]);

  // Единствено при потвърдено плащане: точно едно канонично завършване.
  const completedRef = useRef(false);
  useEffect(() => {
    if (readyAt !== "ready") return;
    if (!completedRef.current) {
      completedRef.current = true;
      // Плащането е доказано — запазеното намерение вече не е нужно.
      clearCheckoutIntent();
      trackCheckoutCompleted(sessionId, {
        kind: descriptor.kind,
        plan: descriptor.plan,
        billing: descriptor.billing,
        source: descriptor.source,
      });
    }
    // Продуктова покупка: след доказано плащане водим към състоянието на
    // самата поръчка, а не към общ екран.
    const target = descriptor.kind === "product"
      ? `${PRODUCT_RESULT_PATH}?session_id=${encodeURIComponent(sessionId ?? "")}`
      : redirectTo;
    if (target) {
      const t = setTimeout(() => navigate(target), 1500);
      return () => clearTimeout(t);
    }
  }, [readyAt, redirectTo, navigate, sessionId, descriptor]);

  /**
   * Визуалната истина следва състоянието: успех се показва САМО при
   * потвърдено плащане и начислено право.
   */
  const view: "missing" | "signed_out" | "pending" | "ready" | "timeout" = !sessionId
    ? "missing"
    : authLoading
    ? "pending"
    : !user
    ? "signed_out"
    : readyAt;

  const heading =
    view === "ready"
      ? "Благодарим Ви!"
      : view === "missing"
      ? "Няма информация за плащане"
      : view === "timeout"
      ? "Потвърждението отнема повече време"
      : view === "signed_out"
      ? "Влезте, за да потвърдим покупката"
      : "Проверяваме плащането…";

  const body =
    view === "ready"
      ? redirectTo
        ? "Готово! Връщаме Ви към договора, върху който работехте…"
        : "Готово! Покупката е активирана."
      : view === "missing"
      ? "Този адрес не съдържа данни за платежна сесия. Ако сте платили, проверете профила си или ни пишете."
      : view === "timeout"
      ? "Потвърждението отнема повече от обичайното. Нищо не се губи: покупката се появява в „Моите покупки“ веднага щом приключи. Можете спокойно да затворите тази страница."
      : view === "signed_out"
      ? "Влезте в профила си със същия имейл, за да проверим плащането и правата по него."
      : "Проверяваме плащането и активирането на покупката…";

  return (
    <div className="min-h-dvh">
      <Seo
        title="Покупката е завършена — Dogovori.net"
        description="Благодарим за плащането. Активираме Вашата покупка в Dogovori.net и Ви връщаме автоматично към документа, върху който работехте."
        canonical="/checkout/return"
        noindex
      />
      <Header />
      <main className="container max-w-md py-20 text-center">
        <div className="rounded-2xl border border-gold/30 bg-gradient-card p-10">
          {view === "ready" ? (
            <CheckCircle2 data-testid="checkout-ready-icon" className="mx-auto h-12 w-12 text-success" />
          ) : view === "timeout" ? (
            <AlertTriangle data-testid="checkout-warning-icon" className="mx-auto h-12 w-12 text-amber-600" />
          ) : view === "pending" ? (
            <Loader2 data-testid="checkout-pending-icon" className="mx-auto h-12 w-12 animate-spin text-muted-foreground" />
          ) : (
            <Info data-testid="checkout-neutral-icon" className="mx-auto h-12 w-12 text-muted-foreground" />
          )}

          <h1 className="mt-4 font-serif text-2xl font-bold">{heading}</h1>
          <h2 className="sr-only">Състояние на покупката в Dogovori.net</h2>
          <p className="mt-2 text-sm text-muted-foreground">{body}</p>

          <div className="mt-6 flex flex-col gap-2">
            {view === "ready" && redirectTo && (
              <Button asChild className="bg-gradient-gold text-navy hover:shadow-gold">
                <Link to={redirectTo}>Продължи с моя договор</Link>
              </Button>
            )}
            {view === "timeout" && (
              <Button asChild className="bg-gradient-gold text-navy hover:shadow-gold">
                <Link to="/produkti/moite-pokupki">Към моите покупки</Link>
              </Button>
            )}
            {view === "signed_out" ? (
              <Button asChild className="bg-gradient-gold text-navy hover:shadow-gold">
                <Link to="/auth">Вход в профила</Link>
              </Button>
            ) : (
              <Button
                asChild
                variant={view === "ready" && redirectTo ? "outline" : "default"}
                className={
                  view === "ready" && redirectTo
                    ? "border-gold/40"
                    : "bg-gradient-gold text-navy hover:shadow-gold"
                }
              >
                <Link to="/account">Към профила</Link>
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

