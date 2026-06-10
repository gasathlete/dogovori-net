// Daily rollup for AI Act Art. 72 post-market monitoring.
// Aggregates ai_audit_log by (date, operation) into ai_post_market_metrics.
// Can be invoked manually by staff or by pg_cron.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireServiceRole } from "../_shared/cron-auth.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const denied = await requireServiceRole(req);
  if (denied) return denied;

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    let body: { days?: number } = {};
    try { body = await req.json(); } catch { /* no body */ }
    const days = Math.min(Math.max(body.days ?? 7, 1), 90);

    const since = new Date(Date.now() - days * 86_400_000).toISOString();

    // Pull audit rows in window (RPC would be cleaner but stay schema-tolerant).
    const { data: rows, error } = await supabase
      .from("ai_audit_log")
      .select("created_at, operation, status, risk_level, redaction_applied, fallback_used, contains_special_category_data")
      .gte("created_at", since);

    if (error) throw error;

    // date(YYYY-MM-DD) → operation → counters
    const buckets = new Map<string, Map<string, {
      total: number; blocked: number; redaction: number; fallback: number; special: number;
    }>>();

    for (const r of rows ?? []) {
      const date = (r.created_at as string).slice(0, 10);
      const op = r.operation as string;
      if (!buckets.has(date)) buckets.set(date, new Map());
      const opMap = buckets.get(date)!;
      if (!opMap.has(op)) opMap.set(op, { total: 0, blocked: 0, redaction: 0, fallback: 0, special: 0 });
      const c = opMap.get(op)!;
      c.total++;
      if (r.status === "blocked" || r.risk_level === "blocked") c.blocked++;
      if (r.redaction_applied) c.redaction++;
      if (r.fallback_used) c.fallback++;
      if (r.contains_special_category_data) c.special++;
    }

    const upserts: any[] = [];
    for (const [date, opMap] of buckets) {
      for (const [op, c] of opMap) {
        upserts.push({
          date,
          operation: op,
          total_calls: c.total,
          blocked_count: c.blocked,
          redaction_count: c.redaction,
          fallback_count: c.fallback,
          special_category_blocks: c.special,
          user_complaints: 0,
        });
      }
    }

    if (upserts.length > 0) {
      const { error: upErr } = await supabase
        .from("ai_post_market_metrics")
        .upsert(upserts, { onConflict: "date,operation" });
      if (upErr) throw upErr;
    }

    return new Response(JSON.stringify({ ok: true, days, buckets: upserts.length }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("ai-post-market-rollup error:", e);
    return new Response(JSON.stringify({ error: String(e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
