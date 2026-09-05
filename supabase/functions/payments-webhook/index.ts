import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient, verifyWebhook } from "../_shared/stripe.ts";
import { sendAppEmail } from "../_shared/transactional-email-templates/send-and-log.ts";
import { ENTRY_PACK_AMOUNT_CENTS, planOneOffCredit } from "../_shared/oneoff-credit.ts";

let _supabase: ReturnType<typeof createClient> | null = null;
function getSupabase() {
  if (!_supabase) {
    _supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
  }
  return _supabase;
}

function tierFromPriceId(priceId: string | null | undefined): { plan: "pro" | "free"; opsCap: number | null } {
  if (!priceId) return { plan: "pro", opsCap: null };
  if (priceId.startsWith("entrepreneur")) return { plan: "pro", opsCap: 100 };
  if (priceId.startsWith("professional")) return { plan: "pro", opsCap: 50 };
  if (priceId.startsWith("pro_")) return { plan: "pro", opsCap: 100 }; // legacy grandfathered
  return { plan: "pro", opsCap: null };
}

async function setPaidPlan(userId: string, until: string | null, priceId: string | null) {
  const { opsCap } = tierFromPriceId(priceId);
  await getSupabase()
    .from("download_quota")
    .update({ plan: "pro", pro_until: until, plan_ops_cap: opsCap })
    .eq("user_id", userId);
}

async function setFreePlan(userId: string) {
  await getSupabase()
    .from("download_quota")
    .update({ plan: "free", pro_until: null, plan_ops_cap: null })
    .eq("user_id", userId);
}

async function syncTeamSubscription(subscription: any, env: StripeEnv) {
  const teamId = subscription.metadata?.teamId;
  if (!teamId) return;
  const item = subscription.items?.data?.[0];
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;
  const seatCount = item?.quantity ?? subscription.quantity ?? 3;
  const isActive = ["active", "trialing"].includes(subscription.status);
  await getSupabase()
    .from("teams")
    .update({
      stripe_subscription_id: subscription.id,
      stripe_customer_id: subscription.customer,
      seat_count: seatCount,
      status: isActive ? "active" : (subscription.status === "canceled" ? "canceled" : "past_due"),
      current_period_start: periodStart ? new Date(periodStart * 1000).toISOString() : null,
      current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
      environment: env,
      updated_at: new Date().toISOString(),
    })
    .eq("id", teamId);
}

async function handleSubscriptionCreated(subscription: any, env: StripeEnv) {
  // Team subscriptions: sync the teams table instead of download_quota.
  if (subscription.metadata?.kind === "team" || subscription.metadata?.teamId) {
    return syncTeamSubscription(subscription, env);
  }
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.error("No userId in subscription metadata");
    return;
  }
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id || item?.price?.id;
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  await getSupabase().from("subscriptions").upsert(
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
  );

  if (["active", "trialing"].includes(subscription.status)) {
    await setPaidPlan(userId, periodEnd ? new Date(periodEnd * 1000).toISOString() : null, priceId);
  }
}

async function handleSubscriptionUpdated(subscription: any, env: StripeEnv) {
  if (subscription.metadata?.kind === "team" || subscription.metadata?.teamId) {
    return syncTeamSubscription(subscription, env);
  }
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.lookup_key || item?.price?.metadata?.lovable_external_id || item?.price?.id;
  const productId = item?.price?.product;
  const periodStart = item?.current_period_start ?? subscription.current_period_start;
  const periodEnd = item?.current_period_end ?? subscription.current_period_end;

  await getSupabase()
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
    .eq("environment", env);

  const userId = subscription.metadata?.userId;
  if (userId) {
    if (["active", "trialing"].includes(subscription.status)) {
      await setPaidPlan(userId, periodEnd ? new Date(periodEnd * 1000).toISOString() : null, priceId);
    } else if (subscription.status === "canceled" && (!periodEnd || periodEnd * 1000 < Date.now())) {
      await setFreePlan(userId);
    }
  }
}

async function handleSubscriptionDeleted(subscription: any, env: StripeEnv) {
  if (subscription.metadata?.kind === "team" || subscription.metadata?.teamId) {
    const teamId = subscription.metadata?.teamId;
    if (teamId) {
      await getSupabase().from("teams").update({ status: "canceled" }).eq("id", teamId);
    }
    return;
  }
  await getSupabase()
    .from("subscriptions")
    .update({ status: "canceled", updated_at: new Date().toISOString() })
    .eq("stripe_subscription_id", subscription.id)
    .eq("environment", env);

  const userId = subscription.metadata?.userId;
  if (userId) await setFreePlan(userId);
}

async function handleCheckoutCompleted(session: any, env: StripeEnv) {
  const userId = session.metadata?.userId;

  // 0) Strict document unlock — вече е бъндъл: отключва документа за 24h И
  //    кредитира входния пакет операции (обработено в блок 1 по-долу).
  if (
    session.mode === "payment" &&
    userId &&
    session.metadata?.type === "strict_doc_unlock" &&
    session.metadata?.doc_key
  ) {
    // FAIL-CLOSED: платена сесия, чието отключване не е записано, трябва да
    // върне грешка нагоре → webhook отговаря non-2xx и Stripe повтаря.
    // Upsert-ът е по (user_id, doc_key), затова retry-ът е безопасен.
    const amountTotal = session.amount_total;
    const paid = typeof amountTotal === "number"
      ? amountTotal / 100
      : ENTRY_PACK_AMOUNT_CENTS / 100;
    const { error: unlockErr } = await getSupabase()
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
      );
    if (unlockErr) {
      console.error("strict_doc_unlocks upsert failed:", unlockErr.message);
      throw new Error(`strict_doc_unlocks upsert failed: ${unlockErr.message}`);
    }
  }


  // 0b) Персонално брандиране — еднократно отключване.
  if (session.mode === "payment" && userId && session.metadata?.type === "branding_unlock") {
    try {
      const amountTotal = session.amount_total;
      await getSupabase()
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
        );
    } catch (e) {
      console.error("branding_unlocks upsert failed:", e);
    }
  }

  // 1) Еднократни покупки → операции. Едно агрегирано, идемпотентно по
  //    stripe_session_id кредитиране (topup_purchases има UNIQUE(session_id)),
  //    затова повторна доставка на събитието не начислява втори път.
  //
  //    FAIL-CLOSED: всяка грешка (listLineItems, RPC transport или DB error в
  //    отговора) се хвърля нагоре — Stripe получава non-2xx и повтаря.
  //    `credited: false` при дублирана доставка е нормален идемпотентен успех.
  if (session.mode === "payment" && userId) {
    const stripe = createStripeClient(env);
    const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10, expand: ["data.price"] });
    const credit = planOneOffCredit(items.data as any);
    if (credit) {
      const { data: creditResult, error: creditErr } = await getSupabase().rpc("credit_topup_ops", {
        p_user_id: userId,
        p_price_id: credit.priceId,
        p_ops: credit.ops,
        p_amount: credit.amountEur,
        p_session_id: session.id,
        p_environment: env,
      });
      if (creditErr) {
        console.error("credit_topup_ops failed:", creditErr.message);
        throw new Error(`credit_topup_ops failed: ${creditErr.message}`);
      }
      const ok = (creditResult as { ok?: boolean } | null)?.ok;
      if (ok === false) {
        throw new Error("credit_topup_ops returned ok=false");
      }
    }
  }


  // 1b) Order snapshot — ЗЗП чл. 47/49: фиксираме приетите версии на правните
  // документи и активната цена в момента на покупката (consumer protection
  // evidence). Не съдържа payment card data.
  if (userId && session.id) {
    try {
      const amountTotal = session.amount_total;
      const currency = (session.currency || "eur").toUpperCase();
      const lookup =
        session.metadata?.priceId ||
        session.metadata?.lookup_key ||
        null;
      const planName = session.mode === "subscription"
        ? (lookup || "subscription")
        : (lookup || "one_off");
      const billingPeriod = session.mode === "subscription"
        ? (session.metadata?.billing_period || null)
        : null;
      await getSupabase().from("order_snapshots").insert({
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
      });
    } catch (e) {
      console.error("order_snapshots insert failed (non-fatal):", e);
    }
  }


  // 2) Receipt email — for any successful checkout (subscription or one-off)
  try {
    const email = session.customer_email || session.customer_details?.email;
    if (email && session.id) {
      const amountTotal = session.amount_total;
      const currency = (session.currency || "eur").toUpperCase();
      const formatted = typeof amountTotal === "number"
        ? `${(amountTotal / 100).toFixed(2)} ${currency}`
        : undefined;
      const productName = session.mode === "subscription" ? "Pro абонамент" : "Договор / бланка";

      // Try to look up profile name if we know the user
      let name: string | undefined;
      if (userId) {
        const { data: p } = await getSupabase().from("profiles").select("display_name").eq("id", userId).maybeSingle();
        name = (p as any)?.display_name ?? undefined;
      }

      await sendAppEmail(getSupabase(), "payment-receipt", email, {
        idempotencyKey: `receipt-${session.id}`,
        templateData: { name, productName, amount: formatted },
      });
    }
  } catch (e) {
    console.error("receipt email send failed:", e);
  }
}

async function handleInvoicePaymentFailed(invoice: any, env: StripeEnv) {
  try {
    const subscriptionId = invoice.subscription || invoice.parent?.subscription_details?.subscription;
    let userId: string | undefined;
    let teamId: string | undefined;

    if (subscriptionId) {
      const stripe = createStripeClient(env);
      const sub = await stripe.subscriptions.retrieve(subscriptionId);
      userId = (sub.metadata as any)?.userId;
      teamId = (sub.metadata as any)?.teamId;

      if (teamId) {
        await getSupabase().from("teams").update({ status: "past_due", updated_at: new Date().toISOString() }).eq("id", teamId);
      } else {
        await getSupabase()
          .from("subscriptions")
          .update({ status: "past_due", updated_at: new Date().toISOString() })
          .eq("stripe_subscription_id", subscriptionId)
          .eq("environment", env);
      }
    }

    const email = invoice.customer_email;
    if (email) {
      const amountDue = invoice.amount_due;
      const currency = (invoice.currency || "eur").toUpperCase();
      const amount = typeof amountDue === "number" ? `${(amountDue / 100).toFixed(2)} ${currency}` : undefined;
      const nextAttemptTs = invoice.next_payment_attempt;
      const nextAttempt = nextAttemptTs ? new Date(nextAttemptTs * 1000).toLocaleDateString("bg-BG") : undefined;

      let name: string | undefined;
      if (userId) {
        const { data: p } = await getSupabase().from("profiles").select("display_name").eq("id", userId).maybeSingle();
        name = (p as any)?.display_name ?? undefined;
      }

      await sendAppEmail(getSupabase(), "payment-failed", email, {
        idempotencyKey: `payfail-${invoice.id}-${invoice.attempt_count ?? 0}`,
        templateData: { name, amount, nextAttempt },
      });
    }
  } catch (e) {
    console.error("invoice.payment_failed handling error:", e);
  }
}

async function handleWebhook(req: Request, env: StripeEnv) {
  const event = await verifyWebhook(req, env);

  switch (event.type) {
    case "customer.subscription.created":
      await handleSubscriptionCreated(event.data.object, env);
      break;
    case "customer.subscription.updated":
      await handleSubscriptionUpdated(event.data.object, env);
      break;
    case "customer.subscription.deleted":
      await handleSubscriptionDeleted(event.data.object, env);
      break;
    case "checkout.session.completed":
      await handleCheckoutCompleted(event.data.object, env);
      break;
    case "invoice.payment_failed":
      await handleInvoicePaymentFailed(event.data.object, env);
      break;
    default:
      console.log("Unhandled event:", event.type);
  }
}

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const rawEnv = new URL(req.url).searchParams.get("env");
  if (rawEnv !== "sandbox" && rawEnv !== "live") {
    console.error("Webhook received with invalid env:", rawEnv);
    return new Response(JSON.stringify({ received: true, ignored: "invalid env" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }
  try {
    await handleWebhook(req, rawEnv);
    return new Response(JSON.stringify({ received: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("Webhook error:", e);
    return new Response("Webhook error", { status: 400 });
  }
});
