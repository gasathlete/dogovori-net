// First-party pageview tracker. Public endpoint (verify_jwt=false), writes to
// public.page_views via service role. No raw IP stored — only a daily hash.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const SALT = Deno.env.get("PAGEVIEW_HASH_SALT") ?? "dogovori-pv-default";

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
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  try {
    const body = await req.json().catch(() => ({}));
    const path: string = String(body.path ?? "/").slice(0, 512);
    const referrer: string | null = body.referrer ? String(body.referrer).slice(0, 1024) : null;
    const session_id: string = String(body.session_id ?? "");
    const event: string = body.event === "duration_update" ? "duration_update" : "pageview";
    const duration_ms: number | null = Number.isFinite(body.duration_ms) ? Math.min(3_600_000, Math.max(0, Math.floor(body.duration_ms))) : null;
    const is_bounce: boolean = body.is_bounce !== false;
    const utm_source: string | null = body.utm_source ? String(body.utm_source).slice(0, 128) : null;

    if (!/^[0-9a-f-]{36}$/i.test(session_id)) {
      return new Response(JSON.stringify({ error: "invalid session_id" }), { status: 400, headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const ua = req.headers.get("user-agent") ?? "";
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "0.0.0.0";
    const country = req.headers.get("cf-ipcountry") || req.headers.get("x-vercel-ip-country") || null;
    const ownHost = req.headers.get("x-original-host") || (referrer ? new URL(referrer).hostname : null);
    const day = new Date().toISOString().slice(0, 10);
    const visitor_day_hash = await sha256(`${SALT}|${day}|${ip}|${ua}`);
    const { device, browser, os } = parseUA(ua);

    // Optional user from JWT
    let user_id: string | null = null;
    const authHeader = req.headers.get("Authorization");
    if (authHeader?.startsWith("Bearer ")) {
      try {
        const anon = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
          global: { headers: { Authorization: authHeader } },
        });
        const { data } = await anon.auth.getUser();
        user_id = data?.user?.id ?? null;
      } catch { /* ignore */ }
    }

    const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    if (event === "duration_update") {
      // Update the most recent pageview row of this session with this path
      const { data: existing } = await admin
        .from("page_views")
        .select("id")
        .eq("session_id", session_id)
        .eq("path", path)
        .eq("event", "pageview")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing?.id) {
        await admin.from("page_views")
          .update({ duration_ms, is_bounce: is_bounce && (duration_ms ?? 0) < 10_000 })
          .eq("id", existing.id);
      }
      return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "content-type": "application/json" } });
    }

    const { error } = await admin.from("page_views").insert({
      visitor_day_hash, session_id, user_id, path,
      referrer_host: refHost(referrer, ownHost),
      utm_source, country, device, browser, os,
      duration_ms, is_bounce, event: "pageview",
    });
    if (error) throw error;
    return new Response(JSON.stringify({ ok: true }), { headers: { ...corsHeaders, "content-type": "application/json" } });
  } catch (e: any) {
    console.error("track-pageview error", e);
    return new Response(JSON.stringify({ error: e?.message ?? "internal_error" }), { status: 500, headers: { ...corsHeaders, "content-type": "application/json" } });
  }
});
