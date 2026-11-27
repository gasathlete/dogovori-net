import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { resolveOrCreateCustomer } from "../_shared/customer.ts";
import { buildCors } from "../_shared/cors.ts";
import { isNewProcessingOpen, newProcessingClosedResponse } from "../_shared/new-processing-gate.ts";
import {
  ENTRY_PACK_LOOKUP_KEY,
  EntryPriceError,
  SUBSCRIPTION_LOOKUP_KEYS,
  isAllowedCheckoutLookupKey,
  requireEntryPackPrice,
} from "../_shared/oneoff-credit.ts";
import {
  SandboxForbiddenError,
  assertEnvironmentAllowed,
  sandboxForbiddenResponse,
} from "../_shared/sandbox-guard.ts";
import { consentMetadata, readConsent } from "../_shared/purchase-consent.ts";
import { requireAppReturnUrl } from "../_shared/return-destination.ts";
import { requireSubscriptionPrice } from "../_shared/canonical-subscription.ts";

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

    // Сървърен флаг (default OFF): преди тялото, sandbox RPC, Stripe customer
    // и session. Разрешение от тялото/клиента не се приема.
    if (!isNewProcessingOpen("subscription_checkout")) return newProcessingClosedResponse("subscription_checkout", corsHeaders);

    const body = await req.json();
    const { priceId, returnUrl, environment } = body as {
      priceId: string;
      returnUrl: string;
      environment: StripeEnv;
    };

    // Строг server-side allowlist: точно съвпадение с реално използван lookup
    // key. Regex не е достатъчен — произволен ключ не трябва да стига до Stripe.
    // Екипните места (team_*) минават през create-team, не оттук.
    if (!isAllowedCheckoutLookupKey(priceId)) {
      throw new EntryPriceError("unsupported_price");
    }
    requireAppReturnUrl(returnUrl);
    // Честен прочит на съгласията: каквото е потвърдено в интерфейса, толкова
    // се записва. Липсващо съгласие остава false, не се презаписва на true.
    const consent = readConsent(body as Record<string, unknown>);
    if (environment !== "sandbox" && environment !== "live") throw new Error("Invalid environment");
    // Sandbox (test) плащания дават реален entitlement в общите таблици —
    // разрешени са само за staff. Проверката е server-side по JWT user id.
        // is_staff EXECUTE е отнет от authenticated: проверката минава със
    // service-role клиент (без препратен потребителски Authorization) и userId
    // от вече проверения JWT, никога от тялото.
    const staffClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await assertEnvironmentAllowed(staffClient, environment, userId);

    const stripe = createStripeClient(environment);

    const prices = await stripe.prices.list({ lookup_keys: [priceId] });
    let price: any;
    if (priceId === ENTRY_PACK_LOOKUP_KEY) {
      // Входният пакет: приемаме само active, one_time, EUR, 290 центa.
      price = requireEntryPackPrice(prices.data as any);
    } else if (SUBSCRIPTION_LOOKUP_KEYS.includes(priceId)) {
      price = requireSubscriptionPrice(prices.data, priceId, body.quantity ?? 1);
    } else {
      const active = prices.data.find((p: any) => p.active === true);
      if (!active) throw new EntryPriceError("price_not_found");
      const shouldRecur = SUBSCRIPTION_LOOKUP_KEYS.includes(priceId);
      if (shouldRecur !== (active.type === "recurring")) {
        throw new EntryPriceError("price_mismatch");
      }
      price = active;
    }
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

    // Септемврийската промоция SEPT20 е прекратена — не се прилага
    // автоматично намаление. Публични промокодове няма.

    // Deactivate the retired FIRST100 codes so they can no longer be used.
    if (isRecurring) {
      try {
        const legacy = await stripe.promotionCodes.list({ code: "FIRST100", limit: 20, active: true });
        for (const pc of legacy.data) {
          await stripe.promotionCodes.update(pc.id, { active: false });
        }
      } catch (deactivateErr) {
        console.error("FIRST100 legacy deactivation failed (non-fatal):", deactivateErr);
      }
    }



    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: price.id, quantity: 1 }],
      mode: isRecurring ? "subscription" : "payment",
      ui_mode: "embedded_page",
      return_url: returnUrl,
      customer: customerId,
      // Auto-applied discount: само loyalty купон, когато клиентът го е
      // спечелил. Публични промокодове няма, затова и поле за код не се
      // показва — цената в „Планове“ е и сумата, която се плаща.
      metadata: {
        userId,
        priceId,
        ...(priceId === "branding_unlock_once" ? { type: "branding_unlock" } : {}),
        billing_period: isRecurring ? (price.recurring?.interval ?? null) : null,
        // Само реално получените съгласия. Сървърът никога не записва
        // потвърждение, което не е дошло от интерфейса.
        ...consentMetadata(consent),
        ...(appliedCouponId ? { loyalty_coupon: appliedCouponId } : {}),
      },

      ...(appliedCouponId ? { discounts: [{ coupon: appliedCouponId }] } : {}),
      ...(isRecurring && {
        subscription_data: {
          metadata: {
            userId,
            ...(appliedCouponId ? { loyalty_coupon: appliedCouponId } : {}),
          },
        },
      }),
    });


    return new Response(JSON.stringify({ clientSecret: session.client_secret }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    // Само ограничени, безопасни кодове — без чувствителен текст навън.
    if (e instanceof SandboxForbiddenError) return sandboxForbiddenResponse(corsHeaders);
    if (e instanceof EntryPriceError) {
      console.error("create-checkout price problem:", e.reason);
      return new Response(JSON.stringify({ error: e.reason, code: e.reason }), {
        status: e.reason === "unsupported_price" ? 400 : 503,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
