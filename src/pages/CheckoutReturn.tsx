import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Seo } from "@/components/Seo";
import { CheckCircle2, Loader2 } from "@/icons";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { trackEvent } from "@/lib/analytics";

export default function CheckoutReturn() {
  const [params] = useSearchParams();
  const sessionId = params.get("session_id");
  const type = params.get("type") || "";
  const resumeFromSession = (() => {
    try { return sessionStorage.getItem("wizard:resume") || ""; } catch { return ""; }
  })();
  const redirectTo = params.get("redirect") || (type === "strict_unlock" ? resumeFromSession : "");
  const navigate = useNavigate();
  const { user } = useAuth();

  // Poll quota briefly so a bonus_contract from a one-time purchase has time to land
  // (webhook processes a few seconds after Stripe redirect).
  const [readyAt, setReadyAt] = useState<"pending" | "ready" | "timeout">("pending");

  useEffect(() => {
    if (!user || !sessionId) return;
    let cancelled = false;
    let attempts = 0;

    const tick = async () => {
      attempts++;
      if (type === "strict_unlock") {
        const { data: unlock } = await supabase
          .from("strict_doc_unlocks")
          .select("id")
          .eq("user_id", user.id)
          .eq("stripe_session_id", sessionId)
          .maybeSingle();
        if (cancelled) return;
        if (unlock) setReadyAt("ready");
        else if (attempts >= 12) setReadyAt("timeout");
        else setTimeout(tick, 1500);
        return;
      }
      // Bypass the React Query cache here — we're polling for a purchase to
      // land, so a fresh read on each tick is the whole point.
      const { data: q } = await supabase
        .from("download_quota")
        .select("plan, pro_until, bonus_contracts")
        .eq("user_id", user.id)
        .maybeSingle();
      const isPro = !!q && (q.plan === "pro" || (!!q.pro_until && new Date(q.pro_until) > new Date()));
      const hasBonus = ((q as any)?.bonus_contracts ?? 0) > 0;
      if (cancelled) return;
      if (isPro || hasBonus) {
        setReadyAt("ready");
      } else if (attempts >= 10) {
        setReadyAt("timeout");
      } else {
        setTimeout(tick, 1500);
      }
    };
    tick();
    return () => { cancelled = true; };
  }, [user, sessionId, type]);

  // Auto-redirect back to wizard once the purchase is reflected.
  useEffect(() => {
    if (readyAt === "ready") {
      trackEvent("purchase_complete", { sessionId: sessionId ?? undefined });
      if (redirectTo) {
        const t = setTimeout(() => navigate(redirectTo), 1500);
        return () => clearTimeout(t);
      }
    }
  }, [readyAt, redirectTo, navigate, sessionId]);

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
