import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";

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

    const { data: invite } = await admin.from("team_invitations").select("team_id, email").eq("id", invitationId).maybeSingle();
    if (!invite) throw new Error("Invitation not found");

    const { data: isAdmin } = await admin.rpc("is_team_admin", { _user_id: user.id, _team_id: invite.team_id });
    if (!isAdmin) throw new Error("Not allowed");

    await admin.from("team_invitations").delete().eq("id", invitationId);
    await admin.from("team_audit_log").insert({
      team_id: invite.team_id, user_id: user.id, action: "invite.cancelled",
      target_type: "email", target_id: invite.email,
    });
    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 400);
  }
});
