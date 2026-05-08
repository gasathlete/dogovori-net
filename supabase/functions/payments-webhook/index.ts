import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient, verifyWebhook } from "../_shared/stripe.ts";

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

async function setProPlan(userId: string, until: string | null) {
  await getSupabase()
    .from("download_quota")
    .update({ plan: "pro", pro_until: until })
    .eq("user_id", userId);
}

async function setFreePlan(userId: string) {
  await getSupabase()
    .from("download_quota")
    .update({ plan: "free", pro_until: null })
    .eq("user_id", userId);
}

async function handleSubscriptionCreated(subscription: any, env: StripeEnv) {
  const userId = subscription.metadata?.userId;
  if (!userId) {
    console.error("No userId in subscription metadata");
    return;
  }
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.metadata?.lovable_external_id || item?.price?.id;
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
    await setProPlan(userId, periodEnd ? new Date(periodEnd * 1000).toISOString() : null);
  }
}

async function handleSubscriptionUpdated(subscription: any, env: StripeEnv) {
  const item = subscription.items?.data?.[0];
  const priceId = item?.price?.metadata?.lovable_external_id || item?.price?.id;
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
      await setProPlan(userId, periodEnd ? new Date(periodEnd * 1000).toISOString() : null);
    } else if (subscription.status === "canceled" && (!periodEnd || periodEnd * 1000 < Date.now())) {
      await setFreePlan(userId);
    }
  }
}

async function handleSubscriptionDeleted(subscription: any, env: StripeEnv) {
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

  // 1) Bonus contracts (one-off purchases)
  if (session.mode === "payment" && userId) {
    try {
      const stripe = createStripeClient(env);
      const items = await stripe.checkout.sessions.listLineItems(session.id, { limit: 10, expand: ["data.price"] });
      let bonus = 0;
      for (const li of items.data) {
        const price: any = (li as any).price;
        const lookup = price?.lookup_key || price?.metadata?.lovable_external_id;
        if (lookup === "single_contract") bonus += li.quantity ?? 1;
      }
      if (bonus > 0) {
        const { data: q } = await getSupabase()
          .from("download_quota")
          .select("bonus_contracts")
          .eq("user_id", userId)
          .maybeSingle();
        const current = (q as any)?.bonus_contracts ?? 0;
        await getSupabase()
          .from("download_quota")
          .update({ bonus_contracts: current + bonus })
          .eq("user_id", userId);
      }
    } catch (e) {
      console.error("checkout.session.completed bonus handling failed:", e);
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

      await getSupabase().functions.invoke("send-transactional-email", {
        body: {
          templateName: "payment-receipt",
          recipientEmail: email,
          idempotencyKey: `receipt-${session.id}`,
          templateData: { name, productName, amount: formatted },
        },
      });
    }
  } catch (e) {
    console.error("receipt email send failed:", e);
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
