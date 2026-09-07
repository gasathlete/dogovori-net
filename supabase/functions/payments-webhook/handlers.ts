/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Stripe webhook handlers, извадени от `index.ts` като тестваем seam.
 *
 * Runtime семантиката е непроменена: `index.ts` продължава да прави
 * verifyWebhook + env parsing + HTTP отговорите, а тук стои чистата логика,
 * която приема DB клиент и Stripe factory през аргументи.
 *
 * Правило за грешки:
 *  - ПЛАТЕНИ entitlement / billing state writes са FAIL-CLOSED → хвърлят,
 *    webhook връща non-2xx и Stripe повтаря.
 *  - order snapshot и receipt email са ИЗРИЧНО non-fatal.
 */

/**
 * Локален тип (умишлено не се импортира от `stripe.ts`), за да остане този
 * модул независим от Stripe SDK graph-а и напълно тестваем.
 */
export type StripeEnv = "sandbox" | "live";

import { ENTRY_PACK_AMOUNT_CENTS, planOneOffCredit } from "../_shared/oneoff-credit.ts";
import { extractEventUserId, isStaffUser } from "../_shared/sandbox-guard.ts";
import { mustAffectRows, mustSucceed } from "../_shared/db-guard.ts";

// deno-lint-ignore no-explicit-any
type Any = any;

export interface WebhookDeps {
  /** Service-role Supabase клиент (или тестов двойник). */
  db: Any;
  /** Stripe клиент за окръжението. */
  createStripe: (env: StripeEnv) => Any;
  /** Транзакционен имейл. */
  sendEmail: (db: Any, template: string, to: string, opts: Any) => Promise<Any>;
}

export function tierFromPriceId(priceId: string | null | undefined): { plan: "pro" | "free"; opsCap: number | null } {
  if (!priceId) return { plan: "pro", opsCap: null };
  if (priceId.startsWith("entrepreneur")) return { plan: "pro", opsCap: 100 };
  if (priceId.startsWith("professional")) return { plan: "pro", opsCap: 50 };
  if (priceId.startsWith("pro_")) return { plan: "pro", opsCap: 100 }; // legacy grandfathered
  return { plan: "pro", opsCap: null };
}

async function setPaidPlan(d: WebhookDeps, userId: string, until: string | null, priceId: string | null) {
  const { opsCap } = tierFromPriceId(priceId);
  mustAffectRows(
    await d.db
      .from("download_quota")
      .update({ plan: "pro", pro_until: until, plan_ops_cap: opsCap })
      .eq("user_id", userId)
      .select("user_id"),
    "download_quota paid plan update",
  );
}

async function setFreePlan(d: WebhookDeps, userId: string) {
  mustAffectRows(
    await d.db
      .from("download_quota")
      .update({ plan: "free", pro_until: null, plan_ops_cap: null })
      .eq("user_id", userId)
      .select("user_id"),
    "download_quota free plan update",
  );
}

async function syncTeamSubscription(d: WebhookDeps, subscription: Any, env: StripeEnv) {
  const teamId = subscription.metadata?.teamId;
  if (!teamId) return;
  const item = subscription.items?.data?.[0];
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;
  const seatCount = item?.quantity ?? subscription.quantity ?? 3;
  const isActive = ["active", "trialing"].includes(subscription.status);
  mustAffectRows(
    await d.db
      .from("teams")
      .update({
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer,
        seat_count: seatCount,
        status: isActive ? "active" : (subscription.status === "canceled" ? "canceled" : "past_due"),
        current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", teamId)
      .eq("environment", env)
      .select("id"),
    "teams subscription state update",
  );
}

/**
 * Малък типиран helper: взима `user_id` от засегнатите редове на
 * `subscriptions` update, за да имаме безопасен fallback, когато Stripe
 * metadata не носи `userId` (напр. абонамент, създаден извън приложението).
 */
type SubscriptionOwnerRow = { user_id?: string | null };

function storedUserId(rows: SubscriptionOwnerRow[]): string | undefined {
  return rows[0]?.user_id ?? undefined;
}

export async function handleSubscriptionCreated(d: WebhookDeps, subscription: Any, env: StripeEnv) {
  if (subscription.metadata?.kind === "team" || subscription.metadata?.teamId) {
    return await syncTeamSubscription(d, subscription, env);
  }
  const userId = subscription.metadata?.userId;
  if (!userId) {
    // FAIL-CLOSED: индивидуален абонамент без собственик не може да бъде
    // записан коректно. Хвърляме bounded вътрешна грешка (без Stripe payload
    // в текста), за да върне webhook non-2xx и Stripe да повтори.
    throw new Error(`subscription.created missing metadata.userId for subscription ${subscription.id}`);
  }
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id || item?.price?.id;
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  mustSucceed(
    await d.db.from("subscriptions").upsert(
      {
        user_id: userId,
        stripe_subscription_id: subscription.id,
        stripe_customer_id: subscription.customer,
        product_id: productId,
        price_id: priceId,
        status: subscription.status,
        current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        environment: env,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "stripe_subscription_id" },
    ),
    "subscriptions upsert",
  );

  if (["active", "trialing"].includes(subscription.status)) {
    await setPaidPlan(d, userId, periodEnd ? new Date(periodEnd * 1000).toISOString() : null, priceId);
  }
}

export async function handleSubscriptionUpdated(d: WebhookDeps, subscription: Any, env: StripeEnv) {
  if (subscription.metadata?.kind === "team" || subscription.metadata?.teamId) {
    return await syncTeamSubscription(d, subscription, env);
  }
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id || item?.price?.id;
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  const rows = mustAffectRows<SubscriptionOwnerRow>(
    await d.db
      .from("subscriptions")
      .update({
        status: subscription.status,
        product_id: productId,
        price_id: priceId,
        current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
        current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
        cancel_at_period_end: subscription.cancel_at_period_end || false,
        updated_at: new Date().toISOString(),
      })
      .eq("stripe_subscription_id", subscription.id)
      .eq("environment", env)
      .select("user_id"),
    "subscriptions update",
  );

  const userId = subscription.metadata?.userId ?? storedUserId(rows);
  if (userId) {
    if (["active", "trialing"].includes(subscription.status)) {
      await setPaidPlan(d, userId, periodEnd ? new Date(periodEnd * 1000).toISOString() : null, priceId);
    } else if (subscription.status === "canceled" && (!periodEnd || periodEnd * 1000 < Date.now())) {
      await setFreePlan(d, userId);
    }
  }
}

export async function handleSubscriptionDeleted(d: WebhookDeps, subscription: Any, env: StripeEnv) {
  if (subscription.metadata?.kind === "team" || subscription.metadata?.teamId) {
    const teamId = subscription.metadata?.teamId;
    if (teamId) {
      mustAffectRows(
        await d.db
          .from("teams")
          .update({ status: "canceled" })
          .eq("id", teamId)
          .eq("environment", env)
          .select("id"),
        "teams cancel update",
      );
    }
    return;
  }
  const rows = mustAffectRows<SubscriptionOwnerRow>(
    await d.db
      .from("subscriptions")
      .update({ status: "canceled", updated_at: new Date().toISOString() })
      .eq("stripe_subscription_id", subscription.id)
      .eq("environment", env)
      .select("user_id"),
    "subscriptions cancel update",
  );

  const userId = subscription.metadata?.userId ?? storedUserId(rows);
  if (userId) await setFreePlan(d, userId);
}


export async function handleCheckoutCompleted(d: WebhookDeps, session: Any, env: StripeEnv) {
  const userId = session.metadata?.userId;

  // 0) Strict document unlock — бъндъл: отключва документа за 24h И кредитира
  //    входния пакет операции (блок 1 по-долу). FAIL-CLOSED.
  if (
    session.mode === "payment" &&
    userId &&
    session.metadata?.type === "strict_doc_unlock" &&
    session.metadata?.doc_key
  ) {
    const amountTotal = session.amount_total;
    const paid = typeof amountTotal === "number"
      ? amountTotal / 100
      : ENTRY_PACK_AMOUNT_CENTS / 100;
    mustSucceed(
      await d.db
        .from("strict_doc_unlocks")
        .upsert(
          {
            user_id: userId,
            doc_key: session.metadata.doc_key,
            sector_id: session.metadata.sector_id || null,
            doc_name: session.metadata.doc_name || null,
            paid_price_eur: paid,
            stripe_session_id: session.id,
            environment: env,
            expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          },
          { onConflict: "user_id,doc_key" },
        ),
      "strict_doc_unlocks upsert",
    );
  }

  // 0b) Персонално брандиране — платено entitlement, следователно FAIL-CLOSED.
  if (session.mode === "payment" && userId && session.metadata?.type === "branding_unlock") {
    const amountTotal = session.amount_total;
    mustSucceed(
      await d.db
        .from("branding_unlocks")
        .upsert(
          {
            user_id: userId,
            source: "purchase",
            stripe_session_id: session.id,
            environment: env,
            amount_eur: typeof amountTotal === "number" ? amountTotal / 100 : null,
          },
          { onConflict: "user_id" },
        ),
      "branding_unlocks upsert",
    );
  }

  // 1) Еднократни покупки → операции. Идемпотентно по stripe_session_id.
  if (session.mode === "payment" && userId) {
    const stripe = d.createStripe(env);
    const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10, expand: ["data.price"] });
    const credit = planOneOffCredit(items.data as Any);
    if (credit) {
      const { data: creditResult, error: creditErr } = await d.db.rpc("credit_topup_ops", {
        p_user_id: userId,
        p_price_id: credit.priceId,
        p_ops: credit.ops,
        p_amount: credit.amountEur,
        p_session_id: session.id,
        p_environment: env,
      });
      if (creditErr) {
        throw new Error(`credit_topup_ops failed: ${creditErr.message}`);
      }
      // FAIL-CLOSED: приемаме САМО ok === true. `credited: false` при дублирана
      // сесия е валиден идемпотентен успех, стига ok === true.
      if ((creditResult as { ok?: unknown } | null)?.ok !== true) {
        throw new Error("credit_topup_ops did not return ok=true");
      }
    }
  }

  // 1b) Order snapshot — ЗЗП чл. 47/49 evidence. FAIL-CLOSED и идемпотентно:
  //     повторна доставка на същата сесия обновява същия ред (UNIQUE на
  //     stripe_session_id), а DB грешка връща non-2xx, за да повтори Stripe.
  //     Entitlement-ите остават преди този запис.
  if (userId && session.id) {
    const amountTotal = session.amount_total;
    const currency = (session.currency || "eur").toUpperCase();
    const lookup = session.metadata?.priceId || session.metadata?.lookup_key || null;
    const planName = session.mode === "subscription"
      ? (lookup || "subscription")
      : (lookup || "one_off");
    const billingPeriod = session.mode === "subscription"
      ? (session.metadata?.billing_period || null)
      : null;
    mustSucceed(
      await d.db.from("order_snapshots").upsert(
        {
          user_id: userId,
          plan_name: planName,
          price_amount: typeof amountTotal === "number" ? amountTotal / 100 : 0,
          currency,
          vat_included: true,
          vat_rate: 20,
          billing_period: billingPeriod,
          terms_version: session.metadata?.terms_version || "2026-09-01",
          privacy_version: session.metadata?.privacy_version || "2026-09-01",
          withdrawal_version: session.metadata?.withdrawal_version || "2026-09-01",
          refund_version: session.metadata?.refund_version || "2026-09-01",
          dpa_version: session.metadata?.dpa_version || null,
          ai_ack_accepted: session.metadata?.ai_ack_accepted === "true",
          stripe_session_id: session.id,
          stripe_subscription_id: session.subscription || null,
        },
        { onConflict: "stripe_session_id" },
      ),
      "order_snapshots upsert",
    );
  }


  // 2) Receipt email — ИЗРИЧНО non-fatal.
  try {
    const email = session.customer_email || session.customer_details?.email;
    if (email && session.id) {
      const amountTotal = session.amount_total;
      const currency = (session.currency || "eur").toUpperCase();
      const formatted = typeof amountTotal === "number"
        ? `${(amountTotal / 100).toFixed(2)} ${currency}`
        : undefined;
      const productName = session.mode === "subscription" ? "Pro абонамент" : "Договор / бланка";

      let name: string | undefined;
      if (userId) {
        const { data: p } = await d.db.from("profiles").select("display_name").eq("id", userId).maybeSingle();
        name = (p as Any)?.display_name ?? undefined;
      }

      await d.sendEmail(d.db, "payment-receipt", email, {
        idempotencyKey: `receipt-${session.id}`,
        templateData: { name, productName, amount: formatted },
      });
    }
  } catch (e) {
    console.error("receipt email send failed:", e);
  }
}

export async function handleInvoicePaymentFailed(d: WebhookDeps, invoice: Any, env: StripeEnv) {
  const subscriptionId = invoice.subscription || invoice.parent?.subscription_details?.subscription;
  let userId: string | undefined;
  let teamId: string | undefined;

  // Критични state writes — хвърлят, за да повтори Stripe.
  if (subscriptionId) {
    const stripe = d.createStripe(env);
    const sub = await stripe.subscriptions.retrieve(subscriptionId);
    userId = (sub.metadata as Any)?.userId;
    teamId = (sub.metadata as Any)?.teamId;

    if (teamId) {
      mustAffectRows(
        await d.db
          .from("teams")
          .update({ status: "past_due", updated_at: new Date().toISOString() })
          .eq("id", teamId)
          .eq("environment", env)
          .select("id"),
        "teams past_due update",
      );
    } else {
      const rows = mustAffectRows<SubscriptionOwnerRow>(
        await d.db
          .from("subscriptions")
          .update({ status: "past_due", updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", subscriptionId)
          .eq("environment", env)
          .select("user_id"),
        "subscriptions past_due update",
      );
      userId = userId ?? storedUserId(rows);
    }

  }

  // Имейлът е ИЗРИЧНО non-fatal.
  try {
    const email = invoice.customer_email;
    if (email) {
      const amountDue = invoice.amount_due;
      const currency = (invoice.currency || "eur").toUpperCase();
      const amount = typeof amountDue === "number" ? `${(amountDue / 100).toFixed(2)} ${currency}` : undefined;
      const nextAttemptTs = invoice.next_payment_attempt;
      const nextAttempt = nextAttemptTs ? new Date(nextAttemptTs * 1000).toLocaleDateString("bg-BG") : undefined;

      let name: string | undefined;
      if (userId) {
        const { data: p } = await d.db.from("profiles").select("display_name").eq("id", userId).maybeSingle();
        name = (p as Any)?.display_name ?? undefined;
      }

      await d.sendEmail(d.db, "payment-failed", email, {
        idempotencyKey: `payfail-${invoice.id}-${invoice.attempt_count ?? 0}`,
        templateData: { name, amount, nextAttempt },
      });
    }
  } catch (e) {
    console.error("payment-failed email send failed (non-fatal):", e);
  }
}

/**
 * Defense in depth: sandbox (test) събития пишат в СЪЩИТЕ entitlement таблици
 * като live. Затова за env=sandbox допускаме writes само когато userId от
 * подписания Stripe object е staff. Всичко друго се acknowledge-ва като
 * ignored (HTTP 200) без НИКАКЪВ entitlement write, order snapshot или имейл.
 */
export async function sandboxEntitlementAllowed(
  d: WebhookDeps,
  eventType: string,
  object: unknown,
): Promise<boolean> {
  const userId = extractEventUserId(eventType, object);
  if (!userId) {
    console.log("sandbox event ignored — no userId in signed metadata:", eventType);
    return false;
  }
  const staff = await isStaffUser(d.db, userId);
  if (!staff) {
    console.log("sandbox event ignored — non-staff owner:", eventType);
    return false;
  }
  return true;
}

export async function dispatchEvent(
  d: WebhookDeps,
  event: { type: string; data: { object: Any } },
  env: StripeEnv,
): Promise<void> {
  if (env === "sandbox" && !(await sandboxEntitlementAllowed(d, event.type, event.data.object))) {
    return;
  }

  switch (event.type) {
    case "customer.subscription.created":
      await handleSubscriptionCreated(d, event.data.object, env);
      break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(d, event.data.object, env);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(d, event.data.object, env);
      break;
    case "checkout.session.completed":
      await handleCheckoutCompleted(d, event.data.object, env);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(d, event.data.object, env);
      break;
    default:
      console.log("Unhandled event:", event.type);
  }
}
