// Admin-only: fetch a public legal page (lex.bg, eur-lex.europa.eu, dv.parliament.bg)
// and return cleaned plain text + suggested metadata so it can be reviewed
// before ingestion. Does NOT write to DB.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";

const ALLOWED_HOSTS = new Set([
  "lex.bg",
  "www.lex.bg",
  "eur-lex.europa.eu",
  "dv.parliament.bg",
  "www.parliament.bg",
]);

function htmlToText(html: string): string {
  // strip scripts/styles
  let s = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ");
  // breaks
  s = s.replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|div|li|tr|h\d)>/gi, "\n");
  // strip tags
  s = s.replace(/<[^>]+>/g, "");
  // decode common entities
  s = s
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_m, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_m, n) => String.fromCharCode(parseInt(n, 16)));
  // collapse whitespace but keep newlines
  s = s.replace(/[ \t\u00A0]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

function extractTitle(html: string): string | null {
  const m = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return m ? htmlToText(m[1]).slice(0, 250) : null;
}

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const auth = req.headers.get("Authorization") ?? "";
    if (!auth.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: ud } = await admin.auth.getUser(auth.replace("Bearer ", ""));
    const uid = ud?.user?.id;
    if (!uid) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const { data: isStaff } = await admin.rpc("is_staff", { _user_id: uid });
    if (!isStaff) {
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body = await req.json().catch(() => null);
    const url = (body as { url?: string } | null)?.url?.trim();
    if (!url) {
      return new Response(JSON.stringify({ error: "Липсва url" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    let parsed: URL;
    try { parsed = new URL(url); } catch {
      return new Response(JSON.stringify({ error: "Невалиден URL" }), {
        status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (!["http:", "https:"].includes(parsed.protocol) || !ALLOWED_HOSTS.has(parsed.host)) {
      return new Response(JSON.stringify({
        error: `Разрешени домейни: ${[...ALLOWED_HOSTS].join(", ")}`,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const resp = await fetch(parsed.toString(), {
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; dogovori.net legal indexer)",
        "Accept": "text/html,application/xhtml+xml",
        "Accept-Language": "bg,en;q=0.8",
      },
    });
    if (!resp.ok) {
      return new Response(JSON.stringify({ error: `HTTP ${resp.status} от източника` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const html = await resp.text();
    const title = extractTitle(html);
    const text = htmlToText(html);

    if (text.length < 500) {
      return new Response(JSON.stringify({
        error: "Извлеченият текст е твърде кратък. Опитай прав .txt/HTML източник.",
        length: text.length,
      }), { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const jurisdiction = parsed.host.includes("eur-lex") ? "EU" : "BG";

    return new Response(JSON.stringify({
      ok: true,
      url: parsed.toString(),
      jurisdiction,
      suggested_title: title,
      raw_text: text,
      length: text.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  } catch (e) {
    console.error("fetch-legal-source", e);
    return new Response(JSON.stringify({ error: String((e as Error)?.message ?? e) }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
