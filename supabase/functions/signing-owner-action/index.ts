// DTrust Basic — действия на собственика на заявка: отмяна и одитен сертификат.
// Собственикът НЕ може да променя статуси/подписи на участници; отмяната е
// единственият преход, и то само от незавършено състояние.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors, clientIp, hashIp } from "../_shared/cors.ts";
import { loadAuditCertificate } from "../_shared/signing-certificate.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  const cors = buildCors(req, "POST, OPTIONS");
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
  try {
    if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const raw = await req.text();
    if (raw.length > 2048) return json({ error: "payload_too_large" }, 413);
    let body: { action?: unknown; request_id?: unknown };
    try { body = await new Response(raw).json(); } catch { return json({ error: "invalid_body" }, 400); }
    const { action, request_id } = body;
    if ((action !== "revoke" && action !== "certificate") || typeof request_id !== "string" || !UUID.test(request_id)) {
      return json({ error: "invalid_body" }, 400);
    }
    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const { data: u } = await admin.auth.getUser(auth.slice(7));
    const userId = u?.user?.id;
    if (!userId) return json({ error: "unauthorized" }, 401);

    const { data: env } = await admin.from("signing_requests")
      .select("id, owner_id, team_id, status").eq("id", request_id).maybeSingle();
    let allowed = !!env && env.owner_id === userId;
    if (env && !allowed && env.team_id) {
      const { data: m } = await admin.from("team_members").select("role")
        .eq("team_id", env.team_id).eq("user_id", userId).maybeSingle();
      allowed = action === "certificate" ? !!m : (m?.role === "owner" || m?.role === "admin");
    }
    // Еднакъв отговор за чужда и несъществуваща заявка (без enumeration).
    if (!env || !allowed) return json({ error: "not_found" }, 404);

    if (action === "certificate") {
      const cert = await loadAuditCertificate(admin, env.id);
      if (!cert.ok) return json({ error: cert.code }, cert.code === "not_found" ? 404 : 409);
      return json({ ok: true, certificate: cert.certificate, certificate_sha256: cert.certificate_sha256 });
    }

    const now = new Date().toISOString();
    const { data: moved } = await admin.from("signing_requests")
      .update({ status: "cancelled", cancelled_at: now })
      .eq("id", env.id).in("status", ["draft", "pending", "in_progress"]).select("id");
    if (!moved || moved.length !== 1) return json({ error: "not_revocable", status: env.status }, 409);
    // Старите линкове спират веднага: всеки токен изисква незавършена заявка,
    // а неизползваните кодове се анулират.
    await admin.from("signing_request_signers").update({ otp_code_hash: null, otp_expires_at: null })
      .eq("request_id", env.id).not("status", "in", "(signed,declined)");
    await admin.from("signing_audit_events").insert({
      request_id: env.id, event_type: "cancelled",
      ip_hash: await hashIp(clientIp(req)), user_agent: req.headers.get("user-agent") ?? null,
      metadata: { by: "owner" },
    });
    return json({ ok: true });
  } catch (e) {
    console.error("signing-owner-action error", e);
    return json({ error: "internal_error" }, 500);
  }
});
