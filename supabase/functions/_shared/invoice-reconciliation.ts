import type { WebhookDeps, StripeEnv } from "../payments-webhook/handlers.ts";
import { syncSubscriptionEvent } from "./subscription-event.ts";

type ObjectRecord = Record<string, any>;
type ProviderPage = { data: ObjectRecord[]; has_more: boolean };
const id = (value: any): string | undefined => typeof value === "string" ? value : value?.id;

/** Hydrate provider facts, including split invoice payments; never infer a full invoice refund from one charge. */
export async function reconcileInvoice(d: WebhookDeps, invoiceId: string, env: StripeEnv, event: { id?: string; created?: number }) {
  const stripe = d.createStripe(env);
  const invoice = await stripe.invoices.retrieve(invoiceId);
  if (invoice.livemode !== (env === "live")) throw new Error("invoice_environment_mismatch");
  const subscriptionId = id(invoice.subscription ?? invoice.parent?.subscription_details?.subscription);
  if (!subscriptionId) return;
  const subscription = await stripe.subscriptions.retrieve(subscriptionId);
  if (subscription.livemode !== (env === "live") || id(subscription.customer) !== id(invoice.customer)) throw new Error("invoice_subscription_binding_mismatch");
  if (!subscription.metadata?.userId) throw new Error("invoice_owner_missing");
  // Payments and lines are paginated. An incomplete provider response never becomes a permission fact.
  let cursor: string | undefined;
  let paid = 0, refunded = 0;
  do {
    const page: ProviderPage = await stripe.invoicePayments.list({ invoice: invoiceId, limit: 100, ...(cursor ? { starting_after: cursor } : {}) });
    for (const payment of page.data) {
      if (id(payment.invoice) !== invoiceId || payment.livemode !== (env === "live")) throw new Error("invoice_payment_binding_mismatch");
      if (payment.status !== "paid") continue;
      if (payment.payment?.type !== "payment_intent") throw new Error("invoice_payment_type_unverified");
      const pi = await stripe.paymentIntents.retrieve(id(payment.payment.payment_intent));
      if (pi.livemode !== (env === "live") || id(pi.customer) !== id(invoice.customer)) throw new Error("invoice_intent_binding_mismatch");
      const chargeId = id(pi.latest_charge);
      if (!chargeId) throw new Error("invoice_charge_missing");
      const charge = await stripe.charges.retrieve(chargeId);
      if (charge.livemode !== (env === "live") || id(charge.payment_intent) !== pi.id || id(charge.customer) !== id(invoice.customer) || charge.currency !== invoice.currency) throw new Error("invoice_charge_binding_mismatch");
      paid += payment.amount_paid;
      // Allocate no more than this invoice received from the charge.
      // A split/shared intent partial refund cannot prove which invoice amount was returned.
      refunded += charge.amount_refunded >= charge.amount ? payment.amount_paid : 0;
    }
    const next = page.data.at(-1)?.id;
    if (page.has_more && (!next || next === cursor)) throw new Error("invoice_payment_pagination_invalid");
    cursor = page.has_more ? next : undefined;
  } while (cursor);
  if (invoice.status !== "paid" || invoice.amount_paid <= 0) return;
  if (paid !== invoice.amount_paid) throw new Error("invoice_paid_amount_unverified");
  const lines: ObjectRecord[] = [];
  cursor = undefined;
  do {
    const page: ProviderPage = await stripe.invoices.listLineItems(invoiceId, { limit: 100, ...(cursor ? { starting_after: cursor } : {}) });
    for (const line of page.data) {
      const lineSub = id(line.subscription ?? line.parent?.subscription_item_details?.subscription);
      if (lineSub === subscriptionId && line.amount > 0 && !line.proration && !line.parent?.subscription_item_details?.proration) lines.push(line);
    }
    const next = page.data.at(-1)?.id;
    if (page.has_more && (!next || next === cursor)) throw new Error("invoice_line_pagination_invalid");
    cursor = page.has_more ? next : undefined;
  } while (cursor);
  if (!lines.length || lines.some(line => !line.period?.start || line.period.end <= line.period.start)) throw new Error("invoice_period_unverified");
  const start = Math.min(...lines.map(line => line.period.start));
  const end = Math.max(...lines.map(line => line.period.end));
  const proof = {
    invoice_id: invoiceId, stripe_subscription_id: subscriptionId,
    user_id: subscription.metadata.userId, team_id: subscription.metadata.teamId ?? null,
    stripe_customer_id: id(invoice.customer), amount_paid: paid, amount_refunded: refunded,
    currency: invoice.currency, period_start: new Date(start * 1000).toISOString(), period_end: new Date(end * 1000).toISOString(),
  };
  const { data, error } = await d.db.rpc("reconcile_subscription_invoice", { p_invoice: proof, p_environment: env, p_event_id: event.id });
  if (error || data?.ok !== true) throw new Error("invoice_reconciliation_failed");
  await syncSubscriptionEvent(d, subscription, env, event);
}

export async function reconcileRefundedInvoice(d: WebhookDeps, charge: ObjectRecord, env: StripeEnv, event: { id?: string; created?: number }) {
  const invoiceId = id(charge.invoice);
  if (invoiceId) return reconcileInvoice(d, invoiceId, env, event);
  const pi = id(charge.payment_intent);
  if (!pi) return;
  const stripe = d.createStripe(env);
  const invoices = new Set<string>();
  let cursor: string | undefined;
  do {
    const page: ProviderPage = await stripe.invoicePayments.list({ payment: { type: "payment_intent", payment_intent: pi }, limit: 100, ...(cursor ? { starting_after: cursor } : {}) });
    for (const payment of page.data) {
      if (id(payment.payment?.payment_intent) !== pi || payment.livemode !== (env === "live")) throw new Error("refund_invoice_binding_mismatch");
      const invoice = id(payment.invoice);
      if (invoice) invoices.add(invoice);
    }
    const next = page.data.at(-1)?.id;
    if (page.has_more && (!next || next === cursor)) throw new Error("refund_invoice_pagination_invalid");
    cursor = page.has_more ? next : undefined;
  } while (cursor);
  for (const invoice of invoices) await reconcileInvoice(d, invoice, env, event);
}