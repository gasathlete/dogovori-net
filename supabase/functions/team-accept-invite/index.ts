import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";

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

    const { token } = await req.json();
    if (!token) throw new Error("Missing token");

    const { data: invite } = await admin
      .from("team_invitations")
      .select("*")
      .eq("token", token)
      .maybeSingle();
    if (!invite) throw new Error("Invalid invitation");
    if (invite.accepted_at) throw new Error("Already accepted");
    if (new Date(invite.expires_at) < new Date()) throw new Error("Invitation expired");

    // SECURITY: invitation token must be redeemed by the addressed email only.
    // Otherwise anyone who obtains the token (forwarded email, screenshot, leaked
    // link) could join and gain access to all team-shared documents via RLS.
    const callerEmail = (user.email ?? "").toLowerCase();
    if (!callerEmail || callerEmail !== String(invite.email).toLowerCase()) {
      throw new Error("Тази покана е изпратена на друг имейл адрес. Влезте с правилния акаунт.");
    }

    // Verify team has capacity
    const { data: team } = await admin.from("teams").select("seat_count, status").eq("id", invite.team_id).maybeSingle();
    if (!team || team.status !== "active") throw new Error("Team not active");

    const { count } = await admin
      .from("team_members")
      .select("*", { count: "exact", head: true })
      .eq("team_id", invite.team_id);
    if ((count ?? 0) >= team.seat_count) {
      throw new Error("Team is full — owner needs to add more seats");
    }

    // Add member
    const { error: insertErr } = await admin.from("team_members").insert({
      team_id: invite.team_id, user_id: user.id, role: "member",
    });
    if (insertErr && !insertErr.message.includes("duplicate")) throw insertErr;

    await admin
      .from("team_invitations")
      .update({ accepted_at: new Date().toISOString() })
      .eq("id", invite.id);

    await admin.from("team_audit_log").insert({
      team_id: invite.team_id, user_id: user.id, action: "member_joined",
    });

    return new Response(JSON.stringify({ ok: true, teamId: invite.team_id }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
