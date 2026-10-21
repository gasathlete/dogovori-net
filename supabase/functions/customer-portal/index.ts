import { createClient } from "npm:@supabase/supabase-js@2";
import { type StripeEnv, createStripeClient } from "../_shared/stripe.ts";
import { buildCors } from "../_shared/cors.ts";
import {
  SandboxForbiddenError,
  assertEnvironmentAllowed,
  sandboxForbiddenResponse,
} from "../_shared/sandbox-guard.ts";
import {
  TeamEnvironmentMismatchError,
  assertTeamEnvironment,
  requireTeamAdmin,
  teamEnvMismatchResponse,
} from "../_shared/team-env.ts";
import { mustSucceed } from "../_shared/db-guard.ts";
import { requireAppReturnUrl } from "../_shared/return-destination.ts";

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
    if (returnUrl !== undefined) requireAppReturnUrl(returnUrl);
    // Sandbox (test) плащания пишат в общите entitlement таблици — само staff.
    await assertEnvironmentAllowed(supabase, environment, user.id);

    let stripeCustomerId: string | null = null;

    if (teamId) {
      // Fail-closed: RPC грешка също е отказ.
      await requireTeamAdmin(supabase, user.id, teamId);
      const team = mustSucceed(
        await supabase
          .from("teams")
          .select("stripe_customer_id, environment")
          .eq("id", teamId)
          .maybeSingle(),
        "teams select",
      ) as { stripe_customer_id?: string | null; environment?: string | null } | null;
      if (!team) throw new Error("Team not found");
      // Не използваме Stripe customer от друго окръжение.
      assertTeamEnvironment(team.environment, environment);
      stripeCustomerId = team.stripe_customer_id ?? null;
    } else {
      const sub = mustSucceed(
        await supabase
          .from("subscriptions")
          .select("stripe_customer_id")
          .eq("user_id", user.id)
          .eq("environment", environment)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        "subscriptions select",
      ) as { stripe_customer_id?: string | null } | null;
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
    if (e instanceof SandboxForbiddenError) return sandboxForbiddenResponse(corsHeaders);
    if (e instanceof TeamEnvironmentMismatchError) return teamEnvMismatchResponse(corsHeaders);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

