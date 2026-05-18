import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

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

    const body = await req.json();
    const { teamId, action } = body as { teamId: string; action: string };
    if (!teamId || !action) throw new Error("Missing teamId/action");

    const { data: isMember } = await admin.rpc("is_team_member", { _user_id: user.id, _team_id: teamId });
    if (!isMember) throw new Error("Not a team member");

    const { data: callerRow } = await admin
      .from("team_members")
      .select("role")
      .eq("team_id", teamId)
      .eq("user_id", user.id)
      .maybeSingle();
    const callerRole = callerRow?.role as "owner" | "admin" | "member" | undefined;
    if (!callerRole) throw new Error("Not a team member");
    const isAdmin = callerRole === "owner" || callerRole === "admin";

    // Helper: fetch a list of users (id, email, display_name, avatar_url)
    async function hydrateUsers(userIds: string[]) {
      if (userIds.length === 0) return new Map<string, { email: string | null; display_name: string | null; avatar_url: string | null }>();
      const uniq = [...new Set(userIds)];
      const profiles = await admin.from("profiles").select("id, display_name, avatar_url").in("id", uniq);
      const profMap = new Map(profiles.data?.map((p) => [p.id, p]) ?? []);
      const out = new Map<string, { email: string | null; display_name: string | null; avatar_url: string | null }>();
      for (const id of uniq) {
        try {
          const { data } = await admin.auth.admin.getUserById(id);
          const p = profMap.get(id) as any;
          out.set(id, {
            email: data?.user?.email ?? null,
            display_name: p?.display_name ?? null,
            avatar_url: p?.avatar_url ?? null,
          });
        } catch {
          const p = profMap.get(id) as any;
          out.set(id, { email: null, display_name: p?.display_name ?? null, avatar_url: p?.avatar_url ?? null });
        }
      }
      return out;
    }

    if (action === "list") {
      const { data: mem } = await admin
        .from("team_members")
        .select("id, user_id, role, joined_at")
        .eq("team_id", teamId)
        .order("joined_at", { ascending: true });
      const map = await hydrateUsers((mem ?? []).map((m) => m.user_id));
      const members = (mem ?? []).map((m) => ({
        id: m.id,
        user_id: m.user_id,
        role: m.role,
        joined_at: m.joined_at,
        ...(map.get(m.user_id) ?? { email: null, display_name: null, avatar_url: null }),
      }));
      return json({ members });
    }

    if (action === "change-role") {
      if (!isAdmin) throw new Error("Not allowed");
      const { userId, role } = body as { userId: string; role: "admin" | "member" };
      if (!userId || (role !== "admin" && role !== "member")) throw new Error("Invalid input");
      const { data: target } = await admin
        .from("team_members")
        .select("role")
        .eq("team_id", teamId).eq("user_id", userId).maybeSingle();
      if (!target) throw new Error("Member not found");
      if (target.role === "owner") throw new Error("Cannot change owner's role");
      // only owner can promote/demote admin
      if (callerRole !== "owner") throw new Error("Only owner can change admin roles");

      await admin.from("team_members").update({ role }).eq("team_id", teamId).eq("user_id", userId);
      await admin.from("team_audit_log").insert({
        team_id: teamId, user_id: user.id, action: "member.role_changed",
        target_type: "user", target_id: userId, metadata: { from: target.role, to: role },
      });
      return json({ ok: true });
    }

    if (action === "leave") {
      if (callerRole === "owner") throw new Error("Собственикът трябва първо да прехвърли собствеността");
      await admin.from("team_members").delete().eq("team_id", teamId).eq("user_id", user.id);
      await admin.from("team_audit_log").insert({
        team_id: teamId, user_id: user.id, action: "member.left",
        target_type: "user", target_id: user.id,
      });
      return json({ ok: true });
    }

    if (action === "transfer-ownership") {
      if (callerRole !== "owner") throw new Error("Only owner can transfer ownership");
      const { newOwnerId, confirmName } = body as { newOwnerId: string; confirmName: string };
      if (!newOwnerId) throw new Error("Missing newOwnerId");
      const { data: team } = await admin.from("teams").select("name, owner_id").eq("id", teamId).maybeSingle();
      if (!team) throw new Error("Team not found");
      if ((confirmName ?? "").trim() !== team.name.trim()) throw new Error("Името на екипа не съвпада");
      const { data: target } = await admin.from("team_members").select("role").eq("team_id", teamId).eq("user_id", newOwnerId).maybeSingle();
      if (!target) throw new Error("New owner is not a team member");

      await admin.from("team_members").update({ role: "admin" }).eq("team_id", teamId).eq("user_id", user.id);
      await admin.from("team_members").update({ role: "owner" }).eq("team_id", teamId).eq("user_id", newOwnerId);
      await admin.from("teams").update({ owner_id: newOwnerId }).eq("id", teamId);
      await admin.from("team_audit_log").insert({
        team_id: teamId, user_id: user.id, action: "team.ownership_transferred",
        target_type: "user", target_id: newOwnerId,
      });
      return json({ ok: true });
    }

    if (action === "audit-list") {
      if (!isAdmin) throw new Error("Not allowed");
      const { limit = 20, offset = 0, actionFilter } = body as { limit?: number; offset?: number; actionFilter?: string };
      let q = admin.from("team_audit_log")
        .select("id, action, target_type, target_id, metadata, created_at, user_id", { count: "exact" })
        .eq("team_id", teamId)
        .order("created_at", { ascending: false })
        .range(offset, offset + Math.min(limit, 100) - 1);
      if (actionFilter) q = q.eq("action", actionFilter);
      const { data: log, count } = await q;
      const actorIds = (log ?? []).map((l) => l.user_id).filter(Boolean) as string[];
      const targetUserIds = (log ?? []).filter((l) => l.target_type === "user").map((l) => l.target_id).filter(Boolean) as string[];
      const map = await hydrateUsers([...actorIds, ...targetUserIds]);
      const entries = (log ?? []).map((l) => ({
        ...l,
        actor: l.user_id ? (map.get(l.user_id) ?? null) : null,
        target_user: l.target_type === "user" && l.target_id ? (map.get(l.target_id) ?? null) : null,
      }));
      return json({ entries, total: count ?? 0 });
    }

    throw new Error("Unknown action");
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 400);
  }
});
