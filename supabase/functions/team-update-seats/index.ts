import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { createStripeClient } from "../_shared/stripe.ts";
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
import { mustAffectRows, mustSucceed } from "../_shared/db-guard.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: userData } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData?.user;
    if (!user) throw new Error("Unauthorized");

    const { teamId, seats, environment } = await req.json();
    if (!teamId || !Number.isInteger(seats) || seats < 3 || seats > 100) {
      throw new Error("Invalid input");
    }
    if (environment !== "sandbox" && environment !== "live") throw new Error("Invalid environment");
    // Sandbox (test) плащания пишат в общите entitlement таблици — само staff.
    await assertEnvironmentAllowed(admin, environment, user.id);

    // Fail-closed: RPC грешка също е отказ.
    await requireTeamAdmin(admin, user.id, teamId);

    const teamRes = await admin.from("teams").select("*").eq("id", teamId).maybeSingle();
    const team = mustSucceed(teamRes, "teams select") as
      | { seat_count?: number; stripe_subscription_id?: string | null; environment?: string | null }
      | null;
    if (!team) throw new Error("Team not found");

    // Окръжението на екипа трябва да съвпада — ПРЕДИ Stripe клиент/мутации.
    assertTeamEnvironment(team.environment, environment);

    // Ensure not shrinking below current member count
    const { count, error: countErr } = await admin
      .from("team_members")
      .select("*", { count: "exact", head: true })
      .eq("team_id", teamId);
    if (countErr) throw new Error(`team_members count failed: ${countErr.message}`);
    if (seats < (count ?? 0)) {
      throw new Error(`Cannot reduce below ${count} members — remove members first`);
    }

    // Update Stripe subscription quantity
    if (team.stripe_subscription_id) {
      const stripe = createStripeClient(environment);
      const sub = await stripe.subscriptions.retrieve(team.stripe_subscription_id);
      const itemId = sub.items.data[0]?.id;
      if (!itemId) throw new Error("No subscription item");
      await stripe.subscriptions.update(team.stripe_subscription_id, {
        items: [{ id: itemId, quantity: seats }],
        proration_behavior: "create_prorations",
      });
    }

    // Критично: неуспешен seat_count update НЕ бива да връща ok:true.
    mustAffectRows(
      await admin
        .from("teams")
        .update({ seat_count: seats })
        .eq("id", teamId)
        .eq("environment", environment)
        .select("id"),
      "teams seat_count update",
    );
    mustSucceed(
      await admin.from("team_audit_log").insert({
        team_id: teamId, user_id: user.id, action: "seats_updated",
        metadata: { from: team.seat_count, to: seats },
      }),
      "team_audit_log insert",
    );

    return new Response(JSON.stringify({ ok: true, seats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    if (e instanceof SandboxForbiddenError) return sandboxForbiddenResponse(corsHeaders);
    if (e instanceof TeamEnvironmentMismatchError) return teamEnvMismatchResponse(corsHeaders);
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

