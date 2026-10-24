import type { WebhookDeps, StripeEnv } from "../payments-webhook/handlers.ts";
import { ONE_OFF_OPS_PER_UNIT } from "./oneoff-credit.ts";

/** Signed event order is serialized by the service-only DB function. */
export async function syncSubscriptionEvent(d: WebhookDeps, subscription: Record<string, any>, env: StripeEnv, event: { id?: string; created?: number }) {
  const item = subscription.items?.data?.[0];
  const userId = subscription.metadata?.userId;
  if (!userId || !event.id || !event.created) throw new Error("subscription_proof_missing");
  const iso = (v: number | undefined) => v ? new Date(v*1000).toISOString() : null;
  const { data, error } = await d.db.rpc("sync_subscription_event", {
    p_subscription: {
      user_id: userId, stripe_subscription_id: subscription.id, stripe_customer_id: subscription.customer,
      product_id: typeof item?.price?.product === "string" ? item.price.product : item?.price?.product?.id,
      price_id: item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id || item?.price?.id,
      status: subscription.status,
      current_period_start: iso(item?.current_period_start ?? subscription.current_period_start),
      current_period_end: iso(item?.current_period_end ?? subscription.current_period_end),
      cancel_at_period_end: Boolean(subscription.cancel_at_period_end || subscription.cancel_at),
    }, p_environment: env, p_event_created: event.created, p_event_id: event.id,
  });
  if (error || data?.ok !== true) throw new Error("subscription_sync_failed");
}

export async function reverseTopup(d: WebhookDeps, charge: Record<string, any>, env: StripeEnv) {
  const pi = typeof charge.payment_intent === "string" ? charge.payment_intent : charge.payment_intent?.id;
  if (!pi) return;
  const { data: sessions } = await d.createStripe(env).checkout.sessions.list({ payment_intent: pi, limit: 3 });
  for (const session of sessions ?? []) {
    if (session.mode !== "payment" || session.payment_intent !== pi || session.livemode !== (env === "live")) continue;
    if (!ONE_OFF_OPS_PER_UNIT[session.metadata?.priceId]) continue;
    const { data, error } = await d.db.rpc("reverse_topup_payment", { p_session_id: session.id, p_payment_intent: pi, p_environment: env });
    if (error || data?.ok !== true) throw new Error("topup_reversal_failed");
  }
}