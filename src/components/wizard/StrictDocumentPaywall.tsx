import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Check, Loader2, RefreshCw, Sparkles, Crown, Users, ShieldCheck } from "@/icons";
import { supabase } from "@/integrations/supabase/client";
import { getStripeEnvironment } from "@/lib/stripe";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe } from "@/lib/stripe";
import { toast } from "sonner";
import { trackEvent } from "@/lib/analytics";
import { trackCheckoutFailed, trackCheckoutStarted } from "@/lib/metrics";
import { buildCheckoutReturnUrl, categorizeCheckoutError } from "@/lib/checkoutAnalytics";
import { sanitizeReturnPath } from "@/lib/safeRoute";

import { RoiSavingsBanner } from "@/components/funnel/RoiSavingsBanner";
import {
  ENTRY_PACK_CONFIG,
  PRICING_PLANS,
  fmtEur,
  monthlyLabel,
  opsLabel,
  teamMinYearlyTotal,
  yearlyLabel,
} from "@/lib/pricing";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  docKey: string;
  sectorId?: string;
  docName?: string;
  wizardHref: string;
}

export function StrictDocumentPaywall({
  open,
  onOpenChange,
  docKey,
  sectorId,
  docName,
  wizardHref,
}: Props) {
  const navigate = useNavigate();
  const [starting, setStarting] = useState(false);
  const [clientSecret, setClientSecret] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  const startUnlock = async () => {
    setStarting(true);
    setFailed(false);
    // Клик ≠ стартиран checkout. Тук отчитаме само намерението.
    trackEvent("strict_unlock_cta_clicked", { doc_key: docKey, sector_id: sectorId });
    try {
      // Preserve wizard route so CheckoutReturn navigates back after payment.
      try {
        sessionStorage.setItem("wizard:resume", wizardHref);
      } catch {}
      const returnUrl = buildCheckoutReturnUrl({
        origin: window.location.origin,
        priceId: "strict_doc_unlock",
        source: "strict_paywall",
        redirect: sanitizeReturnPath(wizardHref) ?? undefined,
        // Съвместимост с исторически връщания, които разчитат на `type`.
        legacyType: "strict_unlock",
      });
      const { data, error } = await supabase.functions.invoke("create-strict-unlock-checkout", {
        body: {
          doc_key: docKey,
          sector_id: sectorId,
          doc_name: docName,
          return_url: returnUrl,
          environment: getStripeEnvironment(),
        },
      });
      if (error || !data?.clientSecret) throw new Error(error?.message || "Не успяхме да отворим плащане");
      setClientSecret(data.clientSecret);
      // checkout_started = реално създадена Stripe сесия (канонично събитие).
      trackCheckoutStarted("strict_unlock", "one_time", "strict_paywall");

    } catch (e: any) {
      trackCheckoutFailed("strict_unlock", "one_time", categorizeCheckoutError(e), "strict_paywall");
      setFailed(true);
      toast.error("Плащането не беше отворено", {
        description: "Плащане не е извършено. Прогресът ви е запазен — опитайте отново.",
      });
    } finally {
      setStarting(false);
    }
  };

  const goPlans = () => {
    onOpenChange(false);
    navigate(`/plans?redirect=${encodeURIComponent(wizardHref)}`);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setClientSecret(null); setFailed(false); } onOpenChange(v); }}>
      <DialogContent className="max-w-2xl">
        {clientSecret ? (
          <div>
            <DialogHeader className="mb-3">
              <DialogTitle>
                Отключи този Стриктен документ + {ENTRY_PACK_CONFIG.ops} операции — {fmtEur(ENTRY_PACK_CONFIG.eur)}
              </DialogTitle>
              <DialogDescription>
                Плащането е сигурно. След успех се връщате към документа за сваляне.
              </DialogDescription>
            </DialogHeader>
            <div id="strict-checkout" className="min-h-[500px]">
              <EmbeddedCheckoutProvider
                stripe={getStripe()}
                options={{ fetchClientSecret: async () => clientSecret }}
              >
                <EmbeddedCheckout />
              </EmbeddedCheckoutProvider>
            </div>
          </div>
        ) : (
          <>
            <DialogHeader>
              <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-medium text-gold w-fit mb-2">
                <ShieldCheck className="h-3.5 w-3.5" />
                Стриктен документ
              </div>
              <DialogTitle className="text-2xl">Вие създадохте Стриктен документ</DialogTitle>
              <DialogDescription className="text-base pt-2">
                Dogovori.net поддържа стриктните документи за платени потребители.
                За да го изтеглите, преминете към {PRICING_PLANS.professional.name}/{PRICING_PLANS.entrepreneur.name} или
                закупете еднократно отключване.
              </DialogDescription>
            </DialogHeader>

            <RoiSavingsBanner className="mt-3" />


            <div className="grid gap-3 sm:grid-cols-2 mt-4">
              <div className="rounded-xl border border-border p-4 flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  <Crown className="h-4 w-4 text-gold" />
                  <div className="font-semibold">{PRICING_PLANS.entrepreneur.name}</div>
                </div>
                <div className="text-2xl font-bold mb-1">{monthlyLabel("entrepreneur")}</div>
                <ul className="text-xs text-muted-foreground space-y-1 mb-3 flex-1">
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600 dark:text-gold mt-0.5" />{opsLabel("entrepreneur")}/месец</li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600 dark:text-gold mt-0.5" />Всички Стриктни документи</li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600 dark:text-gold mt-0.5" />AI асистент & анализ</li>
                </ul>
                <Button variant="default" size="sm" className="w-full" onClick={goPlans}>
                  Виж планове
                </Button>
              </div>

              <div className="rounded-xl border border-border p-4 flex flex-col">
                <div className="flex items-center gap-2 mb-1">
                  <Users className="h-4 w-4 text-gold" />
                  <div className="font-semibold">{PRICING_PLANS.team.name}</div>
                </div>
                <div className="text-2xl font-bold mb-1">от {fmtEur(teamMinYearlyTotal())}<span className="text-sm font-normal text-muted-foreground">/год</span></div>
                <ul className="text-xs text-muted-foreground space-y-1 mb-3 flex-1">
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600 dark:text-gold mt-0.5" />{yearlyLabel("team")}, от {PRICING_PLANS.team.seatMin} места</li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600 dark:text-gold mt-0.5" />{opsLabel("team")}/месец</li>
                  <li className="flex items-start gap-1.5"><Check className="h-3.5 w-3.5 text-emerald-600 dark:text-gold mt-0.5" />Споделени папки & подпис</li>
                </ul>
                <Button variant="outline" size="sm" className="w-full" onClick={goPlans}>
                  Виж планове
                </Button>
              </div>
            </div>

            <div className="mt-4 rounded-xl border-2 border-gold/50 bg-gold/5 p-4">
              <div className="flex items-center justify-between gap-3 mb-2">
                <div className="flex items-center gap-2">
                  <Sparkles className="h-4 w-4 text-gold" />
                  <div className="font-semibold">
                    Отключи този Стриктен документ + {ENTRY_PACK_CONFIG.ops} допълнителни операции
                  </div>
                </div>
                <div className="text-xl font-bold text-gold">{fmtEur(ENTRY_PACK_CONFIG.eur)}</div>
              </div>
              <p className="text-xs text-muted-foreground mb-3">
                Еднократно плащане без абонамент. Документът се отключва за 24 часа с
                неограничени сваляния в PDF и DOCX, без да се използват операции.{" "}
                {ENTRY_PACK_CONFIG.ops} операции
                остават в профила ви и не изтичат. Пакетът не отключва функции от платените планове.
              </p>
              {failed && (
                <div
                  role="alert"
                  className="mb-3 flex items-start gap-2 rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-left"
                >
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                  <div>
                    <p className="text-xs font-semibold text-foreground">
                      Не успяхме да отворим плащането
                    </p>
                    <p className="mt-0.5 text-[11px] text-muted-foreground">
                      Плащане не е извършено и прогресът ви е запазен. Опитайте отново.
                    </p>
                  </div>
                </div>
              )}
              <Button
                onClick={startUnlock}
                disabled={starting}
                className="w-full gap-2 bg-gradient-to-r from-gold to-gold-dark hover:opacity-90"
              >
                {starting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : failed ? (
                  <RefreshCw className="h-4 w-4" />
                ) : (
                  <Sparkles className="h-4 w-4" />
                )}
                {failed ? "Опитай отново" : `Отключи за ${fmtEur(ENTRY_PACK_CONFIG.eur)}`}
              </Button>
            </div>

            <p className="text-[11px] text-muted-foreground text-center mt-3">
              Прогресът ви е запазен и ще ви върнем към документа след плащане.
            </p>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
