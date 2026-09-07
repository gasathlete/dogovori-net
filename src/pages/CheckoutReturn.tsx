import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";
import { CheckCircle2, Loader2 } from "@/icons";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { trackCheckoutCompleted } from "@/lib/docFunnel";
import { describeCheckoutReturn, type PurchaseKind } from "@/lib/checkoutAnalytics";
import { sanitizeReturnPath } from "@/lib/safeRoute";

/**
 * Връщането от Stripe само по себе си НЕ е доказателство за плащане. Затова
 * потвърждаваме операционно: плащането е записано в `order_snapshots` за точно
 * този потребител и точно тази сесия, а даденото право е реално начислено.
 * При изтичане на изчакването НЕ се излъчва завършване.
 */
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
  const { user } = useAuth();

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
          // Непознат вид: приемаме само потвърдено плащане за тази сесия.
          return paid;
      }
    },
    [],
  );

  useEffect(() => {
    if (!user || !sessionId) return;
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
      else if (attempts >= 12) setReadyAt("timeout");
      else timer = setTimeout(tick, 1500);
    };
    tick();
    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [user, sessionId, descriptor.kind, confirmPaid]);

  // Единствено при потвърдено плащане: точно едно канонично завършване.
  const completedRef = useRef(false);
  useEffect(() => {
    if (readyAt !== "ready") return;
    if (!completedRef.current) {
      completedRef.current = true;
      trackCheckoutCompleted(sessionId, {
        kind: descriptor.kind,
        plan: descriptor.plan,
        billing: descriptor.billing,
        source: descriptor.source,
      });
    }
    if (redirectTo) {
      const t = setTimeout(() => navigate(redirectTo), 1500);
      return () => clearTimeout(t);
    }
  }, [readyAt, redirectTo, navigate, sessionId, descriptor]);

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
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600 dark:text-gold" />
          <h1 className="mt-4 font-serif text-2xl font-bold">Благодарим Ви!</h1>
          <h2 className="sr-only">Завършена покупка в Dogovori.net</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            {!sessionId
              ? "Няма информация за плащане."
              : readyAt === "pending"
              ? "Активираме Вашата покупка…"
              : readyAt === "ready"
              ? redirectTo
                ? "Готово! Връщаме Ви към договора, върху който работехте…"
                : "Готово! Покупката е активирана."
              : "Плащането е получено. Активирането може да отнеме до минута."}
          </p>

          {readyAt === "pending" && sessionId && (
            <Loader2 className="mx-auto mt-6 h-5 w-5 animate-spin text-gold" />
          )}

          <div className="mt-6 flex flex-col gap-2">
            {redirectTo && (
              <Button asChild className="bg-gradient-gold text-navy hover:shadow-gold">
                <Link to={redirectTo}>Продължи с моя договор</Link>
              </Button>
            )}
            <Button asChild variant={redirectTo ? "outline" : "default"} className={redirectTo ? "border-gold/40" : "bg-gradient-gold text-navy hover:shadow-gold"}>
              <Link to="/account">Към профила</Link>
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
