import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { buildCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("Unauthorized");

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) throw new Error("Unauthorized");

    const body = await req.json();
    const { returnUrl, environment, teamId } = body as { returnUrl?: string; environment: StripeEnv; teamId?: string };
    if (environment !== "sandbox" && environment !== "live") throw new Error("Invalid environment");

    let stripeCustomerId: string | null = null;

    if (teamId) {
      const { data: isAdmin } = await supabase.rpc("is_team_admin", { _user_id: user.id, _team_id: teamId });
      if (!isAdmin) throw new Error("Not allowed");
      const { data: team } = await supabase.from("teams").select("stripe_customer_id").eq("id", teamId).maybeSingle();
      stripeCustomerId = team?.stripe_customer_id ?? null;
    } else {
      const { data: sub } = await supabase
        .from("subscriptions")
        .select("stripe_customer_id")
        .eq("user_id", user.id)
        .eq("environment", environment)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      stripeCustomerId = sub?.stripe_customer_id ?? null;
    }

    if (!stripeCustomerId) {
      return new Response(
        JSON.stringify({ error: "No subscription found", code: "no_subscription" }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }


    const stripe = createStripeClient(environment);
    const portal = await stripe.billingPortal.sessions.create({
      customer: stripeCustomerId,
      ...(returnUrl && { return_url: returnUrl }),
    });


    return new Response(JSON.stringify({ url: portal.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
