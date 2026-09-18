import { useCallback, useEffect, useRef, useState } from "react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { AlertTriangle, RefreshCw, Lock, Check, Sparkles } from "@/icons";
import { Button } from "@/components/ui/button";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";
import { trackCheckoutAbandoned, trackCheckoutFailed, trackCheckoutStarted } from "@/lib/metrics";
import { categorizeCheckoutError, describePriceId } from "@/lib/checkoutAnalytics";
import { checkoutValueNote, saveCheckoutIntent } from "@/lib/checkoutIntent";

interface Props {
  /** When provided, used directly instead of calling create-checkout. */
  clientSecret?: string;
  priceId?: string;
  quantity?: number;
  customerEmail?: string;
  userId?: string;
  returnUrl?: string;
  /**
   * Откъде е отворен checkout-ът (account_subscription, branding, team…).
   * Влиза като `source` в каноничното събитие `checkout_started`.
   */
  analyticsSource?: string;
  /** Override, когато няма price id (напр. Екип: plan="team", billing="yearly"). */
  analyticsPlan?: string;
  analyticsBilling?: string;
}

export function StripeEmbeddedCheckout({
  clientSecret,
  priceId,
  quantity,
  customerEmail,
  userId,
  returnUrl,
  analyticsSource,
  analyticsPlan,
  analyticsBilling,
}: Props) {
  // checkout_started = реално създадена Stripe сесия. Един път на монтиране —
  // StrictMode/re-render не трябва да удвояват броя.
  const trackedRef = useRef(false);
  // Провалено създаване на сесия → показваме ясно състояние с „Опитай отново“,
  // вместо празен контейнер, в който Stripe никога не се зарежда.
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const derived = describePriceId(priceId);
  const plan = analyticsPlan ?? derived.plan;
  const billing = analyticsBilling ?? derived.billing;

  const markStarted = () => {
    if (trackedRef.current) return;
    trackedRef.current = true;
    trackCheckoutStarted(plan, billing, analyticsSource ?? "embedded");
    // Запазваме САМО избора (план, период). Така, ако прозорецът се затвори
    // без плащане, човекът може да продължи оттам, където е спрял.
    if (priceId) {
      saveCheckoutIntent({
        priceId,
        plan,
        billing,
        source: analyticsSource ?? "embedded",
      });
    }
  };

  // Затваряне без плащане: отчита се като изоставен checkout (продуктова
  // преграда, не техническа грешка). Излизането към Stripe/return страницата
  // не се брои за изоставяне.
  const leavingRef = useRef(false);
  useEffect(() => {
    const onHide = () => {
      leavingRef.current = true;
    };
    window.addEventListener("pagehide", onHide);
    return () => {
      window.removeEventListener("pagehide", onHide);
      if (trackedRef.current && !leavingRef.current) {
        trackCheckoutAbandoned(plan, "closed_without_payment");
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan]);

  const valueNote = checkoutValueNote(plan, billing);

  const fetchClientSecret = useCallback(async (): Promise<string> => {
    try {
      if (clientSecret) {
        markStarted();
        return clientSecret;
      }
      if (!priceId || !returnUrl) throw new Error("priceId/returnUrl required");
      const { data, error } = await supabase.functions.invoke("create-checkout", {
        body: { priceId, quantity, customerEmail, userId, returnUrl, environment: getStripeEnvironment() },
      });
      if (error || !data?.clientSecret) {
        throw new Error(error?.message || "Неуспешно създаване на checkout сесия");
      }
      markStarted();
      return data.clientSecret;
    } catch (e) {
      trackCheckoutFailed(plan, billing, categorizeCheckoutError(e), analyticsSource ?? "embedded");
      setFailed(true);
      throw e;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clientSecret, priceId, quantity, customerEmail, userId, returnUrl, attempt]);

  if (failed) {
    return (
      <div
        id="checkout-error"
        role="alert"
        className="flex flex-col items-center gap-3 rounded-xl border border-destructive/40 bg-destructive/5 p-6 text-center"
      >
        <AlertTriangle className="h-6 w-6 text-destructive" />
        <div>
          <p className="text-sm font-semibold text-foreground">
            Не успяхме да отворим плащането
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Плащане не е извършено. Проверете връзката си и опитайте отново.
          </p>
        </div>
        <Button
          type="button"
          variant="outline"
          className="gap-2"
          onClick={() => {
            trackedRef.current = false;
            setFailed(false);
            setAttempt((a) => a + 1);
          }}
        >
          <RefreshCw className="h-4 w-4" />
          Опитай отново
        </Button>
      </div>
    );
  }

  return (
    <div id="checkout">
      {valueNote && (
        <div
          data-testid="checkout-value-note"
          className="mb-3 flex items-start gap-3 rounded-lg border border-gold/30 bg-gold/5 p-3 text-xs leading-relaxed text-foreground"
        >
          <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
          <span>{valueNote}</span>
        </div>
      )}
      <div className="mb-4 grid gap-2 rounded-lg border border-border/60 bg-muted/30 p-3 text-xs text-muted-foreground sm:grid-cols-3">
        <span className="flex min-h-11 items-center gap-2"><Lock className="h-4 w-4 text-gold" />Сигурно плащане</span>
        <span className="flex min-h-11 items-center gap-2"><Check className="h-4 w-4 text-success" />ДДС включено</span>
        <span className="flex min-h-11 items-center gap-2"><RefreshCw className="h-4 w-4 text-gold" />Отказ по всяко време</span>
      </div>
      <EmbeddedCheckoutProvider
        // Ключът принуждава нов Provider при повторен опит — иначе Stripe
        // отказва да смени client secret след създаване.
        key={attempt}
        stripe={getStripe()}
        options={{ fetchClientSecret }}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
