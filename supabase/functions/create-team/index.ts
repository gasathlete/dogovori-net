import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { resolveOrCreateCustomer } from "../_shared/customer.ts";
import { buildCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: userData } = await admin.auth.getUser(token);
    const user = userData?.user;
    if (!user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json();
    const { name, seats, billing, returnUrl, environment } = body as {
      name: string;
      seats: number;
      billing?: "monthly" | "yearly";
      returnUrl: string;
      environment: StripeEnv;
    };

    if (!name || name.length < 2 || name.length > 100) throw new Error("Invalid team name");
    if (!Number.isInteger(seats) || seats < 3 || seats > 100) throw new Error("Seats must be 3–100");
    if (billing && billing !== "yearly") throw new Error("Екип е само годишен абонамент");
    // Block if user has an active individual subscription
    {
      const { data: sub } = await admin
        .from("subscriptions")
        .select("status")
        .eq("user_id", user.id)
        .eq("environment", environment)
        .in("status", ["active", "trialing", "past_due"])
        .maybeSingle();
      if (sub) throw new Error("Имате активен индивидуален абонамент. Откажете го преди да създадете екип.");
    }
    if (!returnUrl) throw new Error("returnUrl required");
    if (environment !== "sandbox" && environment !== "live") throw new Error("Invalid environment");

    // Create team in pending status
    const { data: team, error: teamErr } = await admin
      .from("teams")
      .insert({
        name, owner_id: user.id, seat_count: seats, status: "pending", environment,
      })
      .select()
      .single();
    if (teamErr) throw teamErr;

    // Owner becomes a member with owner role
    await admin.from("team_members").insert({
      team_id: team.id, user_id: user.id, role: "owner",
    });

    const stripe = createStripeClient(environment);
    const lookupKey = "team_seat_yearly";
    const prices = await stripe.prices.list({ lookup_keys: [lookupKey] });
    if (!prices.data.length) throw new Error("Team price not found");

    const customerId = await resolveOrCreateCustomer(stripe, { userId: user.id, email: user.email });

    const session = await stripe.checkout.sessions.create({
      line_items: [{ price: prices.data[0].id, quantity: seats }],
      mode: "subscription",
      ui_mode: "embedded_page",
      return_url: returnUrl,
      customer: customerId,
      // FIRST100 promo code support — coupons are ensured on first
      // create-checkout call; allow_promotion_codes shows Stripe's input.
      allow_promotion_codes: true,
      metadata: { userId: user.id, teamId: team.id, kind: "team" },
      subscription_data: { metadata: { userId: user.id, teamId: team.id, kind: "team" } },
    });

    return new Response(
      JSON.stringify({ clientSecret: session.client_secret, teamId: team.id }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
