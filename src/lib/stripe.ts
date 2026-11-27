import { loadStripe, Stripe } from "@stripe/stripe-js";

type StripeEnv = "sandbox" | "live";

const clientToken = import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string | undefined;
export function resolveStripeEnvironment(token: string | undefined): StripeEnv {
  if (token?.startsWith("pk_test_")) return "sandbox";
  if (token?.startsWith("pk_live_")) return "live";
  throw new Error("Плащанията не са настроени за тази версия. Опитайте по-късно.");
}

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripe(): Promise<Stripe | null> {
  if (!stripePromise) {
    resolveStripeEnvironment(clientToken);
    if (!clientToken) throw new Error("Плащанията не са настроени.");
    stripePromise = loadStripe(clientToken);
  }
  return stripePromise;
}

export function getStripeEnvironment(): StripeEnv {
  return resolveStripeEnvironment(clientToken);
}
