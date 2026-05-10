import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
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
    const { data: userData } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData?.user;
    if (!user) throw new Error("Unauthorized");

    const { teamId, email } = await req.json();
    if (!teamId || !email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      throw new Error("Invalid input");
    }

    // Verify caller is admin/owner of team
    const { data: isAdmin } = await admin.rpc("is_team_admin", { _user_id: user.id, _team_id: teamId });
    if (!isAdmin) throw new Error("Not allowed");

    // Generate token
    const token = crypto.randomUUID() + "-" + crypto.randomUUID().slice(0, 8);

    const { data: invite, error } = await admin
      .from("team_invitations")
      .insert({ team_id: teamId, email: email.toLowerCase(), token, invited_by: user.id })
      .select()
      .single();
    if (error) throw error;

    // Get team name for email
    const { data: team } = await admin.from("teams").select("name").eq("id", teamId).maybeSingle();

    // Use the configured app base URL (custom domain) — fragile origin-replace
    // logic broke for non-supabase.co origins (preview, custom domain).
    const appBase = (Deno.env.get("APP_BASE_URL") || "https://dogovori.net").replace(/\/+$/, "");
    const inviteUrl = `${appBase}/team/accept?token=${token}`;
    try {
      await admin.functions.invoke("send-transactional-email", {
        body: {
          templateName: "team-invitation",
          recipientEmail: email,
          idempotencyKey: `team-invite-${invite.id}`,
          templateData: {
            teamName: team?.name ?? "екип",
            inviteUrl,
            inviterName: user.email,
          },
        },
      });
    } catch (e) {
      console.warn("invitation email failed (continuing):", e);
    }

    await admin.from("team_audit_log").insert({
      team_id: teamId, user_id: user.id, action: "invite_sent",
      target_type: "email", target_id: email,
    });

    return new Response(JSON.stringify({ ok: true, token, inviteUrl }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
