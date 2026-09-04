import { useRef } from "react";
import { EmbeddedCheckoutProvider, EmbeddedCheckout } from "@stripe/react-stripe-js";
import { getStripe, getStripeEnvironment } from "@/lib/stripe";
import { supabase } from "@/integrations/supabase/client";
import { trackCheckoutStarted } from "@/lib/metrics";
import { describePriceId } from "@/lib/checkoutAnalytics";

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
}

export function StripeEmbeddedCheckout({
  clientSecret,
  priceId,
  quantity,
  customerEmail,
  userId,
  returnUrl,
  analyticsSource,
}: Props) {
  // checkout_started = реално създадена Stripe сесия. Един път на монтиране —
  // StrictMode/re-render не трябва да удвояват броя.
  const trackedRef = useRef(false);
  const markStarted = () => {
    if (trackedRef.current) return;
    trackedRef.current = true;
    const { plan, billing } = describePriceId(priceId);
    trackCheckoutStarted(plan, billing, analyticsSource ?? "embedded");
  };

  const fetchClientSecret = async (): Promise<string> => {
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
  };

  return (
    <div id="checkout">
      <EmbeddedCheckoutProvider
        stripe={getStripe()}
        options={{ fetchClientSecret }}
      >
        <EmbeddedCheckout />
      </EmbeddedCheckoutProvider>
    </div>
  );
}
