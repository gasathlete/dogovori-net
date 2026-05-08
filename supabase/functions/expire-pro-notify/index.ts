// Cron-triggered Edge Function: notifies Pro users whose subscription expires soon or has just expired.
// Runs daily; idempotency keys ensure safe re-runs.
import { createClient } from "npm:@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const admin = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const now = new Date();

  // Range buckets (UTC):
  //  - "expiring": pro_until between (now + 6.5d, now + 7.5d) → 7-day reminder
  //  - "expired":  pro_until between (now - 1d, now)         → just expired
  const day = 24 * 60 * 60 * 1000;
  const expiringFrom = new Date(now.getTime() + 6.5 * day).toISOString();
  const expiringTo = new Date(now.getTime() + 7.5 * day).toISOString();
  const expiredFrom = new Date(now.getTime() - 1 * day).toISOString();
  const expiredTo = new Date(now.getTime()).toISOString();

  let expiringSent = 0;
  let expiredSent = 0;
  const errors: string[] = [];

  // Helper to look up profile + email
  const userInfo = async (user_id: string) => {
    const { data: u } = await admin.auth.admin.getUserById(user_id);
    const { data: p } = await admin.from("profiles").select("display_name").eq("id", user_id).maybeSingle();
    return { email: u.user?.email ?? null, name: (p as any)?.display_name ?? null };
  };

  const send = async (
    template: "pro-expiring" | "pro-expired",
    user_id: string,
    bucket: string,
    extra: Record<string, unknown> = {},
  ) => {
    const { email, name } = await userInfo(user_id);
    if (!email) return;
    const idempotencyKey = `${template}-${user_id}-${bucket}`;
    const { error } = await admin.functions.invoke("send-transactional-email", {
      body: {
        templateName: template,
        recipientEmail: email,
        idempotencyKey,
        templateData: { name, ...extra },
      },
    });
    if (error) errors.push(`${template} ${user_id}: ${error.message}`);
    else if (template === "pro-expiring") expiringSent++;
    else expiredSent++;
  };

  try {
    // 1) Expiring in ~7 days
    const { data: expiring } = await admin
      .from("download_quota")
      .select("user_id, pro_until")
      .eq("plan", "pro")
      .gte("pro_until", expiringFrom)
      .lte("pro_until", expiringTo);

    for (const row of (expiring as any[] | null) ?? []) {
      const bucket = String(row.pro_until).slice(0, 10);
      await send("pro-expiring", row.user_id, bucket, {
        daysLeft: 7,
        expiresOn: new Date(row.pro_until).toLocaleDateString("bg-BG"),
      });
    }

    // 2) Expired in last 24h — use subscriptions table for accurate transition signal
    const { data: expired } = await admin
      .from("subscriptions")
      .select("user_id, current_period_end, status")
      .in("status", ["canceled", "incomplete_expired", "unpaid"])
      .gte("current_period_end", expiredFrom)
      .lte("current_period_end", expiredTo);

    const seen = new Set<string>();
    for (const row of (expired as any[] | null) ?? []) {
      if (seen.has(row.user_id)) continue;
      seen.add(row.user_id);
      const bucket = String(row.current_period_end).slice(0, 10);
      await send("pro-expired", row.user_id, bucket);
    }

    return new Response(
      JSON.stringify({ ok: true, expiringSent, expiredSent, errors }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(
      JSON.stringify({ ok: false, error: String((e as Error).message ?? e), expiringSent, expiredSent, errors }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
