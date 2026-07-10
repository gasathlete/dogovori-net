import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { resolveOrCreateCustomer } from "../_shared/customer.ts";
import { buildCors } from "../_shared/cors.ts";

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
    if (!return_url || typeof return_url !== "string") throw new Error("return_url required");
    if (environment !== "sandbox" && environment !== "live") throw new Error("Invalid environment");

    const stripe = createStripeClient(environment);
    const prices = await stripe.prices.list({ lookup_keys: ["strict_doc_unlock"] });
    if (!prices.data.length) throw new Error("Price not configured");
    const price = prices.data[0];

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
    return new Response(
      JSON.stringify({ error: String((e as Error).message ?? e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
