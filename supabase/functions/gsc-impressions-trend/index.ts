// Compares Google Search Console total impressions/clicks for the last 7 days
// vs the prior 7 days. Used by AdminGscPanel to flash a red banner when
// impressions drop ≥10% week-over-week (configurable via body.alertThreshold).
//
// Body: { siteUrl?: string, alertThreshold?: number }
//   siteUrl — GSC property (default "sc-domain:dogovori.net")
//   alertThreshold — percentage drop that triggers `alert: true` (default 10)
//
// Response: { current, previous, deltaPct, alert, range }
//
// Auth: staff-only. Optionally pings SEO_ALERT_WEBHOOK when alert fires.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";

const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";

function isoDate(daysAgo: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

async function queryRange(siteUrl: string, start: string, end: string, lovableKey: string, gscKey: string) {
  const res = await fetch(
    `${GATEWAY}/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lovableKey}`,
        "X-Connection-Api-Key": gscKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        startDate: start,
        endDate: end,
        dimensions: [],
        rowLimit: 1,
      }),
    },
  );
  const data = await res.json();
  if (!res.ok) throw new Error(data?.error?.message ?? `HTTP ${res.status}`);
  const row = (data?.rows ?? [])[0] ?? {};
  return {
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    ctr: Number(row.ctr ?? 0),
    position: Number(row.position ?? 0),
  };
}

Deno.serve(async (req) => {
  const corsHeaders = buildCors(req);
  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    const GSC_API_KEY = Deno.env.get("GOOGLE_SEARCH_CONSOLE_API_KEY");

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const authHeader = req.headers.get("Authorization") ?? "";
    const client = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData } = await client.auth.getUser();
    const user = userData?.user;
    if (!user) return json({ error: "unauthorized" }, 401);
    const admin = createClient(supabaseUrl, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
    const { data: isStaff, error: staffError } = await admin.rpc("is_staff", { _user_id: user.id });
    if (staffError || isStaff !== true) return json({ error: "forbidden" }, 403);
    if (!LOVABLE_API_KEY || !GSC_API_KEY) return json({ code: "gsc_unavailable", message: "Справката от Google Search Console не е свързана. Останалите справки остават достъпни." }, 503);

    const body = await req.json().catch(() => ({}));
    const siteUrl: string = typeof body.siteUrl === "string" && body.siteUrl
      ? body.siteUrl
      : "sc-domain:dogovori.net";
    if (!["sc-domain:dogovori.net", "https://dogovori.net/", "https://www.dogovori.net/"].includes(siteUrl)) {
      return json({ code: "invalid_property", message: "Изберете собственост на Dogovori.net." }, 400);
    }
    const alertThreshold: number = Number(body.alertThreshold ?? 10);
    if (!Number.isFinite(alertThreshold) || alertThreshold < 0 || alertThreshold > 100) return json({ code: "invalid_threshold" }, 400);

    const lag = 3;
    const currentEnd = isoDate(lag);
    const currentStart = isoDate(lag + 6);
    const previousEnd = isoDate(lag + 7);
    const previousStart = isoDate(lag + 13);

    const [current, previous] = await Promise.all([
      queryRange(siteUrl, currentStart, currentEnd, LOVABLE_API_KEY, GSC_API_KEY),
      queryRange(siteUrl, previousStart, previousEnd, LOVABLE_API_KEY, GSC_API_KEY),
    ]);

    const deltaPct = previous.impressions === 0
      ? 0
      : ((current.impressions - previous.impressions) / previous.impressions) * 100;
    const alert = deltaPct <= -alertThreshold;

    const webhook = Deno.env.get("SEO_ALERT_WEBHOOK");
    if (alert && webhook) {
      try {
        await fetch(webhook, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            text: `🚨 GSC impressions dropped ${deltaPct.toFixed(1)}% WoW on ${siteUrl}\n` +
              `• Last 7d: ${current.impressions} impressions / ${current.clicks} clicks\n` +
              `• Prior 7d: ${previous.impressions} impressions / ${previous.clicks} clicks`,
          }),
        });
      } catch (e) {
        console.warn("webhook failed", e);
      }
    }

    return json({
      siteUrl,
      alert,
      alertThreshold,
      deltaPct,
      current,
      previous,
      range: {
        current: { start: currentStart, end: currentEnd },
        previous: { start: previousStart, end: previousEnd },
      },
    });
  } catch (e: any) {
    console.error("gsc-impressions-trend: provider_unavailable");
    return json({ code: "gsc_unavailable", message: "Справката е временно недостъпна. Опитайте отново; останалите действия не са засегнати." }, 503);
  }
});
