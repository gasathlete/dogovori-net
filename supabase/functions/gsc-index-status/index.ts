// Calls Google Search Console URL Inspection API via the Lovable connector
// gateway to report which URLs are indexed vs not. Staff-only.
//
// Body: { urls: string[], siteUrl?: string }
//   urls — list of fully-qualified URLs to inspect (max 50/call to stay snappy)
//   siteUrl — GSC property, defaults to "sc-domain:dogovori.net"
//
// Response: { results: Array<{ url, coverageState, indexingState, verdict, lastCrawlTime?, error? }> }
//
// Auth: only staff (is_staff RPC) may call this — uses the user's JWT.
// Gateway uses Daniel's GSC connection credentials (workspace-owned).

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GSC_API_KEY = Deno.env.get("GOOGLE_SEARCH_CONSOLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY missing");
    if (!GSC_API_KEY) throw new Error("GOOGLE_SEARCH_CONSOLE_API_KEY missing — connect Google Search Console");

    // Staff-only authorisation
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await client.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);
    const { data: isStaff } = await client.rpc("is_staff", { _user_id: user.id });
    if (!isStaff) return json({ error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const urls: string[] = Array.isArray(body.urls) ? body.urls.slice(0, 50) : [];
    const siteUrl: string = typeof body.siteUrl === "string" && body.siteUrl
      ? body.siteUrl
      : "sc-domain:dogovori.net";
    if (urls.length === 0) return json({ results: [] });

    // Inspect URLs concurrently (cap concurrency to avoid GSC rate limits).
    const results: any[] = [];
    const CONCURRENCY = 5;
    let cursor = 0;
    async function worker() {
      while (cursor < urls.length) {
        const i = cursor++;
        const u = urls[i];
        try {
          const res = await fetch(`${GATEWAY}/v1/urlInspection/index:inspect`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${LOVABLE_API_KEY}`,
              "X-Connection-Api-Key": GSC_API_KEY,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({ inspectionUrl: u, siteUrl, languageCode: "bg-BG" }),
          });
          const data = await res.json();
          if (!res.ok) {
            results[i] = { url: u, error: data?.error?.message ?? `HTTP ${res.status}` };
            continue;
          }
          const r = data?.inspectionResult?.indexStatusResult ?? {};
          results[i] = {
            url: u,
            verdict: r.verdict ?? null,                  // PASS | PARTIAL | FAIL | NEUTRAL
            coverageState: r.coverageState ?? null,      // Submitted and indexed / Crawled - currently not indexed / etc
            indexingState: r.indexingState ?? null,
            lastCrawlTime: r.lastCrawlTime ?? null,
            robotsTxtState: r.robotsTxtState ?? null,
            pageFetchState: r.pageFetchState ?? null,
            googleCanonical: r.googleCanonical ?? null,
            userCanonical: r.userCanonical ?? null,
          };
        } catch (e: any) {
          results[i] = { url: u, error: e?.message ?? "fetch failed" };
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, urls.length) }, worker));

    return json({ results, siteUrl, checked: urls.length });
  } catch (e: any) {
    console.error("gsc-index-status error:", e);
    return json({ error: e?.message ?? "internal_error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
