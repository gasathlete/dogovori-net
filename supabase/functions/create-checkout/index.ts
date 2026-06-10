import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { resolveOrCreateCustomer } from "../_shared/customer.ts";
import { buildCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    // --- Require an authenticated user. The caller's user id / email are
    // derived from the verified JWT — never trusted from the request body —
    // so callers cannot attribute a Stripe checkout to a different account.
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.slice("Bearer ".length);
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;
    const customerEmail = userData.user.email ?? undefined;

    const body = await req.json();
    const { priceId, returnUrl, environment } = body as {
      priceId: string;
      returnUrl: string;
      environment: StripeEnv;
    };

    if (!priceId || !/^[a-zA-Z0-9_-]+$/.test(priceId)) throw new Error("Invalid priceId");
    if (priceId === "team_monthly") throw new Error("Екип е само годишен абонамент. Използвай team_yearly.");
    if (!returnUrl || typeof returnUrl !== "string") throw new Error("returnUrl required");
    if (environment !== "sandbox" && environment !== "live") throw new Error("Invalid environment");

    const stripe = createStripeClient(environment);

    const prices = await stripe.prices.list({ lookup_keys: [priceId] });
    if (!prices.data.length) throw new Error("Price not found");
    const price = prices.data[0];
    const isRecurring = price.type === "recurring";

    // Resolve a stable Stripe customer per Lovable user — keeps Portal/refunds clean.
    const customerId = await resolveOrCreateCustomer(stripe, { userId, email: customerEmail });

    // ----- Loyalty discount -----
    // Mirror of src/lib/rewards.ts. Keep tiers in sync between client and server.
    const REWARD_TIERS = [
      { couponId: "loyalty_gold_5", name: "Златен предприемач", threshold: 1000, discountPercent: 5 },
      { couponId: "loyalty_platinum_10", name: "Платинен предприемач", threshold: 5000, discountPercent: 10 },
      { couponId: "loyalty_diamond_15", name: "Диамантен предприемач", threshold: 15000, discountPercent: 15 },
    ];

    let appliedCouponId: string | null = null;
    if (isRecurring) {
      const [{ count: opsCount }, { count: corrCount }, { data: quota }] = await Promise.all([
        supabase.from("quota_session_charges").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("corrections_batch_charges").select("id", { count: "exact", head: true }).eq("user_id", userId),
        supabase.from("download_quota").select("contracts_used,templates_used,analyses_used").eq("user_id", userId).maybeSingle(),
      ]);
      const fromCharges = (opsCount ?? 0) + (corrCount ?? 0);
      const fromQuota = (quota?.contracts_used ?? 0) + (quota?.templates_used ?? 0) + (quota?.analyses_used ?? 0);
      const totalOps = Math.max(fromCharges, fromQuota);

      const activeTier = [...REWARD_TIERS].reverse().find((t) => totalOps >= t.threshold);
      if (activeTier) {
        // Ensure the coupon exists (idempotent — retrieve, create if missing).
        try {
          await stripe.coupons.retrieve(activeTier.couponId);
        } catch {
          await stripe.coupons.create({
            id: activeTier.couponId,
            name: `${activeTier.name} — ${activeTier.discountPercent}%`,
            percent_off: activeTier.discountPercent,
            duration: "forever",
          });
        }
        appliedCouponId = activeTier.couponId;
      }
    }

    // ----- FIRST100 promo codes -----
    // Two coupons share the public code "FIRST100": 30% off monthly subs,
    // 40% off yearly subs (extra 10% for annual commitment). Restricted to
    // the matching Stripe Products so the right one applies to the cart.
    // Skipped for one-off purchases (five_operations / single_contract).
    if (isRecurring) {
      const recurringInterval = price.recurring?.interval; // 'month' | 'year'
      const productId = typeof price.product === "string" ? price.product : (price.product as any)?.id;
      try {
        for (const tier of [
          { id: "first100_monthly", percent: 30, interval: "month" as const },
          { id: "first100_yearly", percent: 40, interval: "year" as const },
        ]) {
          try {
            await stripe.coupons.retrieve(tier.id);
          } catch {
            await stripe.coupons.create({
              id: tier.id,
              name: `FIRST100 — ${tier.percent}% off`,
              percent_off: tier.percent,
              duration: "forever",
              applies_to: { products: [productId] },
            });
          }
          // Ensure a single public promotion code "FIRST100" exists per coupon.
          const existing = await stripe.promotionCodes.list({ coupon: tier.id, code: "FIRST100", limit: 1 });
          if (!existing.data.length) {
            await stripe.promotionCodes.create({
              coupon: tier.id,
              code: "FIRST100",
              restrictions: tier.interval === "year"
                ? { minimum_amount: 0, minimum_amount_currency: "eur" } as any
                : undefined,
            });
          }
        }
      } catch (couponErr) {
        console.error("FIRST100 setup failed (non-fatal):", couponErr);
      }
    }

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: price.id, quantity: 1 }],
      mode: isRecurring ? "subscription" : "payment",
      ui_mode: "embedded_page",
      return_url: returnUrl,
      customer: customerId,
      // Show Stripe's built-in "Add promotion code" field only for subs.
      // Loyalty coupon (auto-applied) takes precedence; if absent, the
      // customer can type FIRST100 manually.
      ...(isRecurring && !appliedCouponId && { allow_promotion_codes: true }),
      metadata: {
        userId,
        priceId,
        billing_period: isRecurring ? (price.recurring?.interval ?? null) : null,
        terms_version: "2026-06-25",
        privacy_version: "2026-06-25",
        withdrawal_version: "2026-06-25",
        refund_version: "2026-06-25",
        ai_ack_accepted: "true",
        ...(appliedCouponId ? { loyalty_coupon: appliedCouponId } : {}),
      },
      ...(appliedCouponId ? { discounts: [{ coupon: appliedCouponId }] } : {}),
      ...(isRecurring && { subscription_data: { metadata: { userId, ...(appliedCouponId ? { loyalty_coupon: appliedCouponId } : {}) } } }),
    });


    return new Response(JSON.stringify({ clientSecret: session.client_secret }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
