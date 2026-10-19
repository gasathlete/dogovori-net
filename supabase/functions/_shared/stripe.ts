import { boundedRequestText, verifyStripeProof, WEBHOOK_MAX_BYTES } from "./webhook-proof.ts";
import Stripe from "npm:stripe@22.0.2";

const getEnv = (key: string): string => {
  const value = Deno.env.get(key);
  if (!value) throw new Error(`${key} is not configured`);
  return value;
};

export type StripeEnv = "sandbox" | "live";

const GATEWAY_STRIPE_BASE = "https://connector-gateway.lovable.dev/stripe";

export function getConnectionApiKey(env: StripeEnv): string {
  return env === "sandbox"
    ? getEnv("STRIPE_SANDBOX_API_KEY")
    : getEnv("STRIPE_LIVE_API_KEY");
}

export function createStripeClient(env: StripeEnv): Stripe {
  const connectionApiKey = getConnectionApiKey(env);
  const lovableApiKey = getEnv("LOVABLE_API_KEY");

  // Пълният подпис на `fetch` (вкл. `Request` като вход) — без преобразуване на
  // типове и без скрити допускания за формата на входа.
  const gatewayFetch: typeof fetch = (input, init) => {
    const rewrite = (raw: string) => raw.replace("https://api.stripe.com", GATEWAY_STRIPE_BASE);
    const target = input instanceof Request ? rewrite(input.url) : rewrite(input.toString());
    const baseHeaders = input instanceof Request
      ? new Headers(input.headers)
      : new Headers();
    // Deno + npm declarations include a RequestInit variant without headers.
    const initHeaders = init && "headers" in init ? init.headers : undefined;
    for (const [key, value] of new Headers(initHeaders).entries()) {
      baseHeaders.set(key, value);
    }
    baseHeaders.set("X-Connection-Api-Key", connectionApiKey);
    baseHeaders.set("Lovable-API-Key", lovableApiKey);
    if (input instanceof Request) {
      return fetch(new Request(target, input), { ...init, headers: baseHeaders });
    }
    return fetch(target, { ...init, headers: baseHeaders });
  };

  return new Stripe(connectionApiKey, {
    apiVersion: "2026-03-25.dahlia",
    httpClient: Stripe.createFetchHttpClient(gatewayFetch),
  });
}

export async function verifyWebhook(
  req: Request,
  env: StripeEnv,
): Promise<{ type: string; data: { object: any } }> {
  const body = await boundedRequestText(req, WEBHOOK_MAX_BYTES);
  const secret = env === "sandbox"
    ? getEnv("PAYMENTS_SANDBOX_WEBHOOK_SECRET")
    : getEnv("PAYMENTS_LIVE_WEBHOOK_SECRET");
  return verifyStripeProof(req.headers.get("stripe-signature"), body, secret, env);
}
