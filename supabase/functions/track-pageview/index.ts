// First-party pageview tracker. Public endpoint (verify_jwt=false), writes to
// public.page_views via service role. No raw IP stored — only a daily hash.
//
// Accepts EITHER the legacy single-event shape { session_id, event, path, ... }
// OR the new batched shape { session_id, events: [ {event, path, ...}, ... ] }.
// The batched shape lets the client coalesce up to 20 events into one request,
// cutting DB write pressure ~10× under load.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";

const SALT = Deno.env.get("PAGEVIEW_HASH_SALT") ?? "dogovori-pv-default";
const MAX_EVENTS_PER_REQUEST = 30;

async function sha256(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function parseUA(ua: string): { device: string; browser: string; os: string } {
  const u = ua || "";
  const device = /Tablet|iPad/i.test(u) ? "tablet" : /Mobi|Android|iPhone/i.test(u) ? "mobile" : "desktop";
  let browser = "other";
  if (/Edg\//.test(u)) browser = "Edge";
  else if (/OPR\//.test(u)) browser = "Opera";
  else if (/Chrome\//.test(u)) browser = "Chrome";
  else if (/Firefox\//.test(u)) browser = "Firefox";
  else if (/Safari\//.test(u)) browser = "Safari";
  let os = "other";
  if (/Windows/.test(u)) os = "Windows";
  else if (/Android/.test(u)) os = "Android";
  else if (/iPhone|iPad|iOS/.test(u)) os = "iOS";
  else if (/Mac OS X|Macintosh/.test(u)) os = "macOS";
  else if (/Linux/.test(u)) os = "Linux";
  return { device, browser, os };
}

function refHost(ref: string | null, ownHost: string | null): string | null {
  if (!ref) return null;
  try {
    const h = new URL(ref).hostname.replace(/^www\./, "");
    if (ownHost && h === ownHost.replace(/^www\./, "")) return null;
    return h;
  } catch { return null; }
}

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return new Response(null, { status: 405, headers: corsHeaders });
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!SUPABASE_URL || !SERVICE_ROLE) {
    console.error("track-pageview: missing env", { hasUrl: !!SUPABASE_URL, hasKey: !!SERVICE_ROLE });
    return new Response(JSON.stringify({ ok: false, error: "config" }), {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
  try {
    const body = await req.json().catch(() => ({} as any));
    const session_id: string = String(body.session_id ?? "");
    if (!/^[0-9a-f-]{36}$/i.test(session_id)) {
      return new Response(JSON.stringify({ error: "invalid session_id" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    // Normalise to a list of raw events.
    const rawEvents: any[] = Array.isArray(body.events)
      ? body.events.slice(0, MAX_EVENTS_PER_REQUEST)
      : [body];

    const ua = req.headers.get("user-agent") ?? "";
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "0.0.0.0";
    const country = req.headers.get("cf-ipcountry") || req.headers.get("x-vercel-ip-country") || null;
    const day = new Date().toISOString().slice(0, 10);
    const visitor_day_hash = await sha256(`${SALT}|${day}|${ip}|${ua}`);
    const { device, browser, os } = parseUA(ua);

    // Optional user from JWT (one lookup per request, not per event).
    let user_id: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const anon = createClient(SUPABASE_URL, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data } = await anon.auth.getUser();
        user_id = data?.user?.id ?? null;
      } catch { /* ignore */ }
    }

    const admin = createClient(SUPABASE_URL, SERVICE_ROLE);

    // Split into duration_update (must UPDATE existing rows) and pageview (bulk INSERT).
    const inserts: Record<string, unknown>[] = [];
    const durationUpdates: { path: string; duration_ms: number | null; is_bounce: boolean }[] = [];

    for (const ev of rawEvents) {
      const path: string = String(ev?.path ?? "/").slice(0, 512);
      const eventType: string = ev?.event === "duration_update" ? "duration_update" : "pageview";
      const duration_ms: number | null = Number.isFinite(ev?.duration_ms)
        ? Math.min(3_600_000, Math.max(0, Math.floor(ev.duration_ms)))
        : null;
      const is_bounce: boolean = ev?.is_bounce !== false;

      if (eventType === "duration_update") {
        durationUpdates.push({ path, duration_ms, is_bounce });
        continue;
      }

      const referrer: string | null = ev?.referrer ? String(ev.referrer).slice(0, 1024) : null;
      const utm_source: string | null = ev?.utm_source ? String(ev.utm_source).slice(0, 128) : null;
      const ownHost = req.headers.get("x-original-host") || (referrer ? new URL(referrer).hostname : null);
      inserts.push({
        visitor_day_hash, session_id, user_id, path,
        referrer_host: refHost(referrer, ownHost),
        utm_source, country, device, browser, os,
        duration_ms, is_bounce, event: "pageview",
      });
    }

    if (inserts.length > 0) {
      const { error } = await admin.from("page_views").insert(inserts);
      if (error) {
        console.error("track-pageview insert error", { code: (error as any)?.code, message: error.message });
      }
    }

    // Duration updates target the newest pageview row of (session_id, path).
    // Serialised to keep write ordering deterministic per session.
    for (const upd of durationUpdates) {
      const { data: existing } = await admin
        .from("page_views")
        .select("id")
        .eq("session_id", session_id)
        .eq("visitor_day_hash", visitor_day_hash)
        .eq("path", upd.path)
        .eq("event", "pageview")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        await admin.from("page_views")
          .update({ duration_ms: upd.duration_ms, is_bounce: upd.is_bounce && (upd.duration_ms ?? 0) < 10_000 })
          .eq("id", existing.id);
      }
    }

    return new Response(JSON.stringify({ ok: true, count: rawEvents.length }), {
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  } catch (e: any) {
    console.error("track-pageview error", { message: e?.message, stack: e?.stack?.slice(0, 500) });
    return new Response(JSON.stringify({ ok: false, error: e?.message ?? "internal_error" }), {
      status: 200,
      headers: { ...corsHeaders, "content-type": "application/json" },
    });
  }
});
