// Staff-only: одобрява партньор/статия и публикува изображението от частната
// staging кофа в публичната. Файлът в staging НЕ се изтрива.
import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";
import { BodyTooLargeError, readBoundedJson } from "../_shared/signing-otp.ts";
import { parsePendingMedia, publicBucketFor } from "../_shared/pending-media.ts";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

serve(async (req) => {
  const cors = buildCors(req);
  const json = (b: unknown, status = 200) =>
    new Response(JSON.stringify(b), { status, headers: { ...cors, "Content-Type": "application/json" } });
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);
  try {
    let body: { kind?: string; id?: string };
    try {
      body = (await readBoundedJson(req, 2_000)) as { kind?: string; id?: string };
    } catch (e) {
      if (e instanceof BodyTooLargeError) return json({ error: "payload_too_large" }, 413);
      throw e;
    }
    const kind = body.kind === "partner" || body.kind === "article" ? body.kind : null;
    if (!kind || typeof body.id !== "string" || !UUID_RE.test(body.id)) return json({ error: "invalid_input" }, 400);

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) return json({ error: "unauthorized" }, 401);
    const { data: u } = await admin.auth.getUser(auth.slice(7));
    const uid = u?.user?.id;
    if (!uid) return json({ error: "unauthorized" }, 401);
    const { data: staff } = await admin.rpc("is_staff", { _user_id: uid });
    if (staff !== true) return json({ error: "forbidden" }, 403);

    const table = kind === "partner" ? "partners" : "user_articles";
    const col = kind === "partner" ? "logo_url" : "image_url";
    const ownerCol = kind === "partner" ? "submitted_by" : "user_id";
    const { data: row } = await admin.from(table).select(`id, ${col}, ${ownerCol}`).eq("id", body.id).maybeSingle();
    if (!row) return json({ error: "not_found" }, 404);
    const current = (row as Record<string, unknown>)[col];
    const owner = (row as Record<string, unknown>)[ownerCol];

    let url = typeof current === "string" ? current : "";
    const pending = parsePendingMedia(current, kind);
    if (pending) {
      if (typeof owner !== "string" || pending.path.split("/")[0] !== owner) {
        return json({ error: "media_owner_mismatch" }, 409);
      }
      const dl = await admin.storage.from(pending.bucket).download(pending.path);
      if (dl.error || !dl.data) return json({ error: "media_missing" }, 404);
      const target = publicBucketFor(kind);
      const up = await admin.storage.from(target).upload(pending.path, dl.data, {
        contentType: dl.data.type || "application/octet-stream", upsert: false,
      });
      if (up.error && !/exists|duplicate/i.test(up.error.message)) return json({ error: "publish_failed" }, 500);
      url = admin.storage.from(target).getPublicUrl(pending.path).data.publicUrl;
    }

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = kind === "partner"
      ? { status: "approved", approved_by: uid, approved_at: now, [col]: url }
      : { status: "approved", reviewed_at: now, published_at: now, [col]: url };
    const { error } = await admin.from(table).update(patch).eq("id", body.id);
    if (error) return json({ error: "update_failed" }, 500);
    return json({ ok: true, url });
  } catch (e) {
    console.error("approve-media error", e);
    return json({ error: "internal_error" }, 500);
  }
});
