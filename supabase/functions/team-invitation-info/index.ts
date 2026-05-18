import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";

// Public — no auth required. Returns minimal preview info for an invitation token.
Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  try {
    const { token } = await req.json();
    if (!token || typeof token !== "string") throw new Error("Missing token");

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: invite } = await admin
      .from("team_invitations")
      .select("id, team_id, email, expires_at, accepted_at, invited_by")
      .eq("token", token).maybeSingle();
    if (!invite) return json({ ok: false, reason: "not_found" });
    if (invite.accepted_at) return json({ ok: false, reason: "already_accepted" });
    const expired = new Date(invite.expires_at) < new Date();

    const { data: team } = await admin.from("teams").select("name").eq("id", invite.team_id).maybeSingle();
    let inviterName: string | null = null;
    try {
      const { data: prof } = await admin.from("profiles").select("display_name").eq("id", invite.invited_by).maybeSingle();
      inviterName = prof?.display_name ?? null;
      if (!inviterName) {
        const { data: u } = await admin.auth.admin.getUserById(invite.invited_by);
        inviterName = u?.user?.email ?? null;
      }
    } catch { /* noop */ }

    return json({
      ok: true,
      teamName: team?.name ?? null,
      email: invite.email,
      inviterName,
      expiresAt: invite.expires_at,
      expired,
    });
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 400);
  }
});
