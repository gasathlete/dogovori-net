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
 *  - order snapshot също е FAIL-CLOSED (идемпотентен upsert по
 *    `stripe_session_id`) — ЗЗП доказателството не бива да се губи.
 *  - САМО receipt email е ИЗРИЧНО non-fatal.
 */

/**
 * Локален тип (умишлено не се импортира от `stripe.ts`), за да остане този
 * модул независим от Stripe SDK graph-а и напълно тестваем.
 */
export type StripeEnv = "sandbox" | "live";

import {
  ENTRY_PACK_AMOUNT_CENTS,
  ENTRY_PACK_LOOKUP_KEY,
  isAllowedCheckoutLookupKey,
  planOneOffCredit,
} from "../_shared/oneoff-credit.ts";
import { extractEventUserId, isStaffUser } from "../_shared/sandbox-guard.ts";
import {
  PRODUCT_PURCHASES,
  assertSessionAmount,
  readProductSessionMetadata,
  verifyProductLineItems,
} from "../_shared/product-purchase.ts";
import { PRODUCT_MAX_SOURCE_CHARS } from "../_shared/product-source.ts";
import { mustAffectRows, mustSucceed } from "../_shared/db-guard.ts";
import { recordStaticPaid, reverseStaticPaid, type StaticDeps } from "../_shared/static-catalog.ts";
import { syncSubscriptionEvent, reverseTopup } from "../_shared/subscription-event.ts";
import { reconcileInvoice, reconcileRefundedInvoice } from "../_shared/invoice-reconciliation.ts";

const staticDeps = (d: WebhookDeps, env: StripeEnv): StaticDeps => ({ db: d.db, stripe: () => d.createStripe(env), env: () => undefined });

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

/** Share signed-event provider lookups between the two delivery ledgers. */
function reversalLookupDeps(d: WebhookDeps, env: StripeEnv): WebhookDeps {
  let stripe: Any;
  const client = () => stripe ??= d.createStripe(env);
  const sessions = new Map<string, Promise<Any>>();
  const charges = new Map<string, Promise<Any>>();
  return {
    ...d,
    createStripe: () => ({
      checkout: { sessions: { list: (params: Any) => {
        const key = JSON.stringify(params);
        if (!sessions.has(key)) sessions.set(key, Promise.resolve(client().checkout.sessions.list(params)));
        return sessions.get(key);
      } } },
      charges: { retrieve: (id: string) => {
        if (!charges.has(id)) charges.set(id, Promise.resolve(client().charges.retrieve(id)));
        return charges.get(id);
      } },
    }),
  };
}

export function tierFromPriceId(priceId: string | null | undefined): { plan: "pro" | "free"; opsCap: number | null } {
  if (!priceId) return { plan: "pro", opsCap: null };
  if (priceId.startsWith("entrepreneur")) return { plan: "pro", opsCap: 100 };
  if (priceId.startsWith("professional")) return { plan: "pro", opsCap: 50 };
  if (priceId.startsWith("pro_")) return { plan: "pro", opsCap: 50 }; // legacy Pro се третира като Професионалист
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
        cancel_at_period_end: Boolean(subscription.cancel_at_period_end || subscription.cancel_at),
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


/* ==================================================================== */
/*  Истина за плащането (Stage 2d0)                                      */
/* ==================================================================== */

/**
 * Единствената стойност на `session.payment_status`, която приемаме като
 * доказано плащане. `unpaid` (SEPA/забавени методи) и `no_payment_required`
 * (безплатен пробен период, 100% код, нулева сума) НЕ са доказано плащане.
 */
export const PAID_PAYMENT_STATUS = "paid" as const;

export function isProvenPaidSession(session: Any): boolean {
  return session?.payment_status === PAID_PAYMENT_STATUS;
}

/** Затворен списък на видовете покупка, записвани в `order_snapshots`. */
export const SNAPSHOT_PURCHASE_KINDS = [
  "team",
  "subscription",
  "strict_unlock",
  "branding",
  "entry_pack",
  "topup",
  "one_time",
  "product",
  "unknown",
] as const;
export type SnapshotPurchaseKind = (typeof SNAPSHOT_PURCHASE_KINDS)[number];

/** Еднократни ключове, които приемаме като „one_time“ (без entry pack/topup). */
const ONE_TIME_LEGACY_KEYS: readonly string[] = ["single_contract"];

/**
 * Чист класификатор: извежда вида покупка от РЕЖИМА на сесията и от
 * ограничени, познати стойности. Произволен `metadata.kind` НИКОГА не се
 * записва като вид — непознатото става `unknown`.
 */
export function classifySnapshotPurchaseKind(session: Any): SnapshotPurchaseKind {
  const meta = (session?.metadata ?? {}) as Record<string, unknown>;
  if (session?.mode === "subscription") {
    return meta.kind === "team" ? "team" : "subscription";
  }
  if (session?.mode !== "payment") return "unknown";
  // Еднократен продукт: видът се извежда от затворената продуктова
  // конфигурация, не от произволна стойност в metadata.
  if (meta.type === "product") {
    return typeof meta.productId === "string" &&
        Object.prototype.hasOwnProperty.call(PRODUCT_PURCHASES, meta.productId)
      ? "product"
      : "unknown";
  }
  if (meta.type === "strict_doc_unlock") return "strict_unlock";
  if (meta.type === "branding_unlock") return "branding";
  const rawKey = typeof meta.priceId === "string"
    ? meta.priceId
    : typeof meta.lookup_key === "string"
      ? meta.lookup_key
      : null;
  if (!rawKey || !isAllowedCheckoutLookupKey(rawKey)) return "unknown";
  if (rawKey === ENTRY_PACK_LOOKUP_KEY) return "entry_pack";
  if (rawKey.startsWith("topup_")) return "topup";
  if (ONE_TIME_LEGACY_KEYS.includes(rawKey)) return "one_time";
  if (rawKey === "branding_unlock_once") return "branding";
  return "unknown";
}

/**
 * Доказателството за плащане идва от ПОДПИСАНОТО Stripe събитие: точният му
 * идентификатор и точният му час. Никога `new Date()`.
 */
export interface StripeEventProof {
  readonly eventId: string;
  /** ISO час, изчислен от `event.created` (секунди). */
  readonly paidAt: string;
}

/** Превръща `event.created` (секунди) в точен ISO час. */
export function eventProofFrom(event: Any): StripeEventProof | null {
  const id = typeof event?.id === "string" ? event.id.trim() : "";
  const created = event?.created;
  if (!id || typeof created !== "number" || !Number.isFinite(created) || created <= 0) return null;
  return { eventId: id, paidAt: new Date(created * 1000).toISOString() };
}

export type ProductReversalAction =
  | "refund_full"
  | "dispute_created"
  | "dispute_won"
  | "dispute_lost";

interface ResolvedProductSession {
  sessionId: string;
  userId: string;
}

function stripeId(value: Any): string | null {
  if (typeof value === "string" && value.length > 0) return value;
  if (value && typeof value.id === "string" && value.id.length > 0) return value.id;
  return null;
}

/**
 * A Charge/Dispute is bound to a product only through its PaymentIntent and
 * the single Checkout Session Stripe returns for it. Zero or multiple
 * product sessions are ignored: no guessed entitlement is ever reversed.
 */
async function resolveProductSession(
  d: WebhookDeps,
  object: Any,
  env: StripeEnv,
): Promise<ResolvedProductSession | null> {
  const stripe = d.createStripe(env);
  let paymentIntentId = stripeId(object?.payment_intent);
  if (!paymentIntentId) {
    const chargeId = stripeId(object?.charge);
    if (!chargeId) return null;
    const charge = await stripe.charges.retrieve(chargeId);
    paymentIntentId = stripeId(charge?.payment_intent);
  }
  if (!paymentIntentId) return null;

  const listed = await stripe.checkout.sessions.list({ payment_intent: paymentIntentId, limit: 3 });
  const matches = (listed?.data ?? []).filter((session: Any) => {
    const meta = readProductSessionMetadata(session?.metadata as Any);
    return Boolean(
      meta &&
        session?.id &&
        session?.mode === "payment" &&
        meta.environment === env &&
        session.livemode === (env === "live") &&
        stripeId(session.payment_intent) === paymentIntentId,
    );
  });
  if (matches.length !== 1) {
    console.log("product reversal ignored — exact checkout session not proven");
    return null;
  }
  const meta = readProductSessionMetadata(matches[0].metadata as Any);
  if (!meta) return null;
  return { sessionId: matches[0].id as string, userId: meta.userId };
}

export async function handleProductReversal(
  d: WebhookDeps,
  object: Any,
  env: StripeEnv,
  action: ProductReversalAction,
  proof?: StripeEventProof | null,
): Promise<void> {
  if (!proof?.eventId || !proof?.paidAt || Number.isNaN(Date.parse(proof.paidAt))) {
    throw new Error("product reversal event proof missing");
  }
  const resolved = await resolveProductSession(d, object, env);
  if (!resolved) return;

  // Reversal is an existing financial obligation, not permission to buy.
  // The service-only RPC locks and checks the immutable paid snapshot/owner.
  // A later role removal or account disable must not preserve refunded access.

  const { data, error } = await d.db.rpc("record_product_payment_reversal", {
    p_session_id: resolved.sessionId,
    p_environment: env,
    p_event_id: proof.eventId,
    p_event_at: proof.paidAt,
    p_action: action,
  });
  if (error) throw new Error(`record_product_payment_reversal failed: ${error.message}`);
  if ((data as { ok?: unknown } | null)?.ok !== true) {
    throw new Error("record_product_payment_reversal did not return ok=true");
  }
}

export async function handleCheckoutCompleted(
  d: WebhookDeps,
  session: Any,
  env: StripeEnv,
  proof?: StripeEventProof | null,
) {
  // FAIL-CLOSED ПРЕДИ всичко: без доказано `payment_status === "paid"` не се
  // прави НИКАКЪВ entitlement запис, order snapshot, Stripe line-item
  // извикване или имейл. НЕ хвърляме — забавените методи може по-късно да
  // изпратят `checkout.session.async_payment_succeeded`.
  if (!isProvenPaidSession(session)) {
    console.log(
      "checkout session ignored — payment_status is not 'paid':",
      session?.payment_status ?? "missing",
    );
    return;
  }

  if (session.metadata?.type === "static_catalog") {
    await recordStaticPaid(staticDeps(d, env), session, env, proof);
    return; // Never grant legacy credits, subscriptions or send a duplicate receipt.
  }

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

  // 0c) Еднократен продукт, обвързан с документ. Дава ТОЧНО една продуктова
  //     привилегия и НИКОГА операции/кредити. Записът на правото и на
  //     доказателството за поръчката става в ЕДНА атомарна транзакция, така че
  //     не може да остане половин покупка. Повторната доставка е успех само при
  //     пълно съвпадение на всяко неизменно поле.
  const productMeta = readProductSessionMetadata(session.metadata as Any);
  if (productMeta) {
    if (session.mode !== "payment") throw new Error("product session mode mismatch");
    if (!userId) throw new Error("product session user missing");
    if (productMeta.userId !== userId) throw new Error("product session user mismatch");
    if (productMeta.environment !== env) {
      throw new Error("product session environment mismatch");
    }
    if (session.livemode !== undefined && session.livemode !== (env === "live")) {
      throw new Error("product session livemode mismatch");
    }
    // Без подписано събитие няма доказан момент на плащане → няма право.
    if (!proof?.eventId || !proof?.paidAt || Number.isNaN(Date.parse(proof.paidAt))) {
      throw new Error("product session event proof missing");
    }

    const { data: intake } = await d.db
      .from("product_checkout_intakes")
      .select(
        "id, user_id, product_id, status, source_hash, uploaded_contract_id, source_updated_at, environment, source_extraction_status, source_char_count, stripe_session_id, stripe_price_id, stripe_price_lookup_key, expected_amount_cents, currency, terms_accepted, ai_ack_accepted, immediate_performance_consent, withdrawal_loss_acknowledged, consent_recorded_at",
      )
      .eq("id", productMeta.intakeId)
      .maybeSingle();
    if (!intake) throw new Error("product intake not found");
    // Ранен отказ на половин състояние; RPC остава окончателната инстанция.
    if (intake.status !== "checkout_created" && intake.status !== "paid") {
      throw new Error("product intake state invalid");
    }

    const stripe = d.createStripe(env);
    const items = await stripe.checkout.sessions.listLineItems(session.id, {
      limit: 5,
      expand: ["data.price"],
    });
    const verified = verifyProductLineItems(
      items.data as Any,
      productMeta.productId,
      env,
      intake.stripe_price_id as string,
    );
    // Точната сума и валута на сесията трябва да съвпадат с продукта.
    assertSessionAmount(session.amount_total, session.currency, verified.productId);

    if (
      intake.user_id !== userId ||
      intake.product_id !== verified.productId ||
      intake.environment !== env ||
      intake.stripe_session_id !== session.id ||
      intake.stripe_price_lookup_key !== verified.lookupKey ||
      intake.expected_amount_cents !== verified.amountCents ||
      String(intake.currency ?? "eur").toLowerCase() !== verified.currency ||
      intake.uploaded_contract_id !== productMeta.sourceDocumentId ||
      !intake.source_updated_at ||
      intake.source_extraction_status !== "full" ||
      intake.terms_accepted !== true ||
      intake.ai_ack_accepted !== true ||
      intake.immediate_performance_consent !== true ||
      intake.withdrawal_loss_acknowledged !== true ||
      !intake.consent_recorded_at
    ) {
      throw new Error("product intake mismatch");
    }
    const intakeChars = intake.source_char_count as number | null;
    if (
      typeof intakeChars !== "number" || intakeChars <= 0 ||
      intakeChars > PRODUCT_MAX_SOURCE_CHARS
    ) {
      throw new Error("product intake source incomplete");
    }

    // Доказателството за съгласие и източник се гради от заявката, не от
    // променливи Stripe метаданни и не от часа на webhook-а.
    const { data: recorded, error: recordErr } = await d.db.rpc("record_product_purchase", {
      p_user_id: userId,
      p_product_id: verified.productId,
      p_session_id: session.id,
      p_price_id: verified.priceId,
      p_lookup_key: verified.lookupKey,
      p_environment: env,
      p_amount_cents: verified.amountCents,
      p_currency: verified.currency,
      p_intake_id: intake.id,
      p_paid_at: proof.paidAt,
      p_refinements_included: verified.refinementsIncluded,
      p_stripe_event_id: proof.eventId,
    });
    if (recordErr) throw new Error(`record_product_purchase failed: ${recordErr.message}`);
    if ((recorded as { ok?: unknown } | null)?.ok !== true) {
      throw new Error("record_product_purchase did not return ok=true");
    }
  }


  // 1) Еднократни покупки → операции. Продуктовите покупки НЕ минават оттук.
  if (session.mode === "payment" && userId && !productMeta) {
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
  //     Продуктовите покупки НЕ минават оттук: техният snapshot се записва
  //     атомарно заедно с правото, само от неизменната заявка.
  if (userId && session.id && !productMeta) {
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
          terms_accepted: session.metadata?.terms_accepted === "true",
          immediate_performance_consent:
            session.metadata?.immediate_performance_consent === "true",
          withdrawal_loss_acknowledged:
            session.metadata?.withdrawal_loss_acknowledged === "true",
          consent_recorded_at: new Date().toISOString(),
          product_id: null,
          stripe_session_id: session.id,
          stripe_subscription_id: session.subscription || null,
          // Истина за плащането: точното окръжение, доказаният статус и
          // затвореният вид покупка. Без нови идентификатори.
          environment: env,
          payment_status: PAID_PAYMENT_STATUS,
          purchase_kind: classifySnapshotPurchaseKind(session),
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
      const productName = productMeta
        ? PRODUCT_PURCHASES[productMeta.productId].name
        : session.mode === "subscription"
          ? "Pro абонамент"
          : "Договор / бланка";

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
  event: { type: string; id?: string; created?: number; livemode?: boolean; data: { object: Any } },
  env: StripeEnv,
): Promise<void> {
  if (event.livemode !== undefined && event.livemode !== (env === "live")) {
    throw new Error("webhook_environment_mismatch");
  }
  // Existing payment reversals resolve immutable provider and ledger bindings;
  // only new sandbox purchases require the owner's current staff permission.
  if (event.type === "charge.refunded") {
    const charge = event.data.object;
    if (event.id && event.created) await reconcileRefundedInvoice(d, charge, env, event);
    if (
      typeof charge?.amount === "number" && charge.amount > 0 &&
      typeof charge?.amount_refunded === "number" &&
      charge.amount_refunded >= charge.amount
    ) {
      const reversal = reversalLookupDeps(d, env);
      await reverseStaticPaid(staticDeps(reversal, env), charge, env, "refund_full", eventProofFrom(event));
      await handleProductReversal(reversal, charge, env, "refund_full", eventProofFrom(event));
      await reverseTopup(reversal, charge, env);
    } else {
      console.log("product reversal ignored — refund is not full");
    }
    return;
  }
  if (event.type === "charge.dispute.created") {
    const reversal = reversalLookupDeps(d, env);
    await reverseStaticPaid(staticDeps(reversal, env), event.data.object, env, "dispute_created", eventProofFrom(event));
    await handleProductReversal(reversal, event.data.object, env, "dispute_created", eventProofFrom(event));
    return;
  }
  if (event.type === "charge.dispute.closed") {
    const status = event.data.object?.status;
    if (status === "won" || status === "lost") {
      await handleProductReversal(
        d,
        event.data.object,
        env,
        status === "won" ? "dispute_won" : "dispute_lost",
        eventProofFrom(event),
      );
    } else {
      console.log("product reversal ignored — dispute is not final");
    }
    return;
  }

  if (env === "sandbox" && !(await sandboxEntitlementAllowed(d, event.type, event.data.object))) {
    return;
  }

  switch (event.type) {
    case "customer.subscription.created":
      if (event.id && event.created) {
        await syncSubscriptionEvent(d, event.data.object, env, event); break;
      }
      await handleSubscriptionCreated(d, event.data.object, env);
      break;
    case "customer.subscription.updated":
      if (event.id && event.created) {
        await syncSubscriptionEvent(d, event.data.object, env, event); break;
      }
      await handleSubscriptionUpdated(d, event.data.object, env);
      break;
    case "customer.subscription.deleted":
      if (event.id && event.created) {
        await syncSubscriptionEvent(d, { ...event.data.object, status: "canceled" }, env, event); break;
      }
      await handleSubscriptionDeleted(d, event.data.object, env);
      break;
    // Двата пътя до платена сесия минават през ЕДИН guarded handler:
    // директното плащане и уреденото по-късно забавено плащане.
    case "checkout.session.completed":
    case "checkout.session.async_payment_succeeded":
      await handleCheckoutCompleted(d, event.data.object, env, eventProofFrom(event));
      break;
    case "invoice.paid":
      await reconcileInvoice(d, event.data.object.id, env, event);
      break;
    case "invoice.payment_failed":
      if (event.id && event.created) {
        const invoice = event.data.object;
        const subId = invoice.subscription || invoice.parent?.subscription_details?.subscription;
        if (subId) {
          const current = await d.createStripe(env).subscriptions.retrieve(subId);
          if (current.metadata?.userId) {
            // Stripe's current snapshot, not a stale failure payload, owns status.
            await syncSubscriptionEvent(d, current, env, event); break;
          }
        }
      }
      await handleInvoicePaymentFailed(d, event.data.object, env);
      break;
    default:
      console.log("Unhandled event:", event.type);
  }
}
