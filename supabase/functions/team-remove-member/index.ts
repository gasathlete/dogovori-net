import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) throw new Error("Unauthorized");
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: userData } = await admin.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData?.user;
    if (!user) throw new Error("Unauthorized");

    const { teamId, userId } = await req.json();
    if (!teamId || !userId) throw new Error("Missing teamId/userId");

    const { data: isAdmin } = await admin.rpc("is_team_admin", { _user_id: user.id, _team_id: teamId });
    if (!isAdmin) throw new Error("Not allowed");

    const { data: target } = await admin
      .from("team_members").select("role").eq("team_id", teamId).eq("user_id", userId).maybeSingle();
    if (!target) throw new Error("Member not found");
    if (target.role === "owner") throw new Error("Cannot remove owner");

    await admin.from("team_members").delete().eq("team_id", teamId).eq("user_id", userId);
    await admin.from("team_audit_log").insert({
      team_id: teamId, user_id: user.id, action: "member.removed",
      target_type: "user", target_id: userId,
    });

    return json({ ok: true });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 400);
  }
});
