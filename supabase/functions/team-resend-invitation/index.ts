import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";
import { sendAppEmail } from "../_shared/transactional-email-templates/send-and-log.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: userData } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData?.user;
    if (!user) throw new Error("Unauthorized");

    const { invitationId } = await req.json();
    if (!invitationId) throw new Error("Missing invitationId");

    const { data: invite } = await admin.from("team_invitations").select("*").eq("id", invitationId).maybeSingle();
    if (!invite) throw new Error("Invitation not found");
    if (invite.accepted_at) throw new Error("Already accepted");

    const { data: isAdmin } = await admin.rpc("is_team_admin", { _user_id: user.id, _team_id: invite.team_id });
    if (!isAdmin) throw new Error("Not allowed");

    const newToken = crypto.randomUUID() + "-" + crypto.randomUUID().slice(0, 8);
    const newExpires = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString();
    await admin.from("team_invitations").update({ token: newToken, expires_at: newExpires }).eq("id", invitationId);

    const { data: team } = await admin.from("teams").select("name").eq("id", invite.team_id).maybeSingle();
    const appBase = (Deno.env.get("APP_BASE_URL") || "https://dogovori.net").replace(/\/+$/, "");
    const inviteUrl = `${appBase}/team/accept?token=${newToken}`;
    try {
      await sendAppEmail(admin, "team-invitation", invite.email, {
        idempotencyKey: `team-invite-resend-${invitationId}-${Date.now()}`,
        templateData: { teamName: team?.name ?? "екип", inviteUrl, inviterName: user.email },
      });
    } catch (e) { console.warn("resend email failed:", e); }

    await admin.from("team_audit_log").insert({
      team_id: invite.team_id, user_id: user.id, action: "invite.resent",
      target_type: "email", target_id: invite.email,
    });
    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 400);
  }
});
