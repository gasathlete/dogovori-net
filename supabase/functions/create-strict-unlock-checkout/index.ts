import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { resolveOrCreateCustomer } from "../_shared/customer.ts";
import { buildCors } from "../_shared/cors.ts";
import { requireAppReturnUrl } from "../_shared/return-destination.ts";
import { isNewProcessingOpen, newProcessingClosedResponse } from "../_shared/new-processing-gate.ts";
import {
  SandboxForbiddenError,
  assertEnvironmentAllowed,
  sandboxForbiddenResponse,
} from "../_shared/sandbox-guard.ts";
import {
  ENTRY_PACK_LOOKUP_KEY,
  ENTRY_PACK_OPS,
  EntryPriceError,
  requireEntryPackPrice,
} from "../_shared/oneoff-credit.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST")
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
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
    const email = userData.user.email ?? undefined;

    // Сървърен флаг (default OFF): преди тялото, sandbox RPC, Stripe customer
    // и session. Разрешение от тялото/клиента не се приема.
    if (!isNewProcessingOpen("strict_unlock_checkout")) return newProcessingClosedResponse("strict_unlock_checkout", corsHeaders);

    const body = await req.json();
    const {
      doc_key,
      sector_id,
      doc_name,
      return_url,
      environment,
    } = body as {
      doc_key: string;
      sector_id?: string;
      doc_name?: string;
      return_url: string;
      environment: StripeEnv;
    };

    if (!doc_key || typeof doc_key !== "string" || doc_key.length > 200)
      throw new Error("Invalid doc_key");
    requireAppReturnUrl(return_url);
    if (environment !== "sandbox" && environment !== "live") throw new Error("Invalid environment");
    // Sandbox (test) плащания пишат в общите entitlement таблици — само staff.
        // is_staff EXECUTE е отнет от authenticated: проверката минава със
    // service-role клиент (без препратен потребителски Authorization) и userId
    // от вече проверения JWT, никога от тялото.
    const staffClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    await assertEnvironmentAllowed(staffClient, environment, userId);

    const stripe = createStripeClient(environment);
    // Бъндъл: отключване на документа + входен пакет операции. Ползваме
    // САМО съществуващата цена five_operations и изискваме точно 2,90 € EUR —
    // никога не създаваме и не променяме Stripe цена оттук.
    const prices = await stripe.prices.list({ lookup_keys: [ENTRY_PACK_LOOKUP_KEY] });
    const price = requireEntryPackPrice(prices.data as any);

    const customerId = await resolveOrCreateCustomer(stripe, { userId, email });

    const productId =
      typeof price.product === "string" ? price.product : (price.product as any).id;
    const product = await stripe.products.retrieve(productId);

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: price.id, quantity: 1 }],
      mode: "payment",
      ui_mode: "embedded_page",
      return_url,
      customer: customerId,
      payment_intent_data: { description: product.name },
      metadata: {
        userId,
        type: "strict_doc_unlock",
        priceId: ENTRY_PACK_LOOKUP_KEY,
        bundle: "strict_plus_five",
        bundle_ops: String(ENTRY_PACK_OPS),
        doc_key,
        sector_id: sector_id ?? "",
        doc_name: doc_name ?? "",
      },
    });

    return new Response(JSON.stringify({ clientSecret: session.client_secret }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof SandboxForbiddenError) return sandboxForbiddenResponse(corsHeaders);
    if (e instanceof EntryPriceError) {
      // Конфигурационен проблем, не грешка на потребителя: връщаме ограничен код.
      console.error("strict unlock bundle price problem:", e.reason);
      return new Response(
        JSON.stringify({ error: e.reason, code: e.reason }),
        { status: 503, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({ error: String((e as Error).message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
