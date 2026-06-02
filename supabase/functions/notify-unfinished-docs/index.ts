// Daily cron: scans for unfinished document kits (status = 'in_progress')
// older than 24h and creates a "finish_doc" notification for the owner,
// unless one already exists for that kit. Idempotent — safe to run any time.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    // Cutoff: kits untouched for at least 24 hours.
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: kits, error: kitsErr } = await supabase
      .from("document_kits")
      .select("id, user_id, title, updated_at")
      .eq("status", "in_progress")
      .lt("updated_at", cutoff)
      .limit(500);

    if (kitsErr) throw kitsErr;

    let created = 0;
    let skipped = 0;

    for (const kit of kits ?? []) {
      const link = `/komplekti/moi/${kit.id}`;
      // Check existing finish_doc notification for this kit (match on link).
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", kit.user_id)
        .eq("kind", "finish_doc")
        .eq("link", link)
        .limit(1)
        .maybeSingle();

      if (existing) { skipped++; continue; }

      const { error: insErr } = await supabase.from("notifications").insert({
        user_id: kit.user_id,
        kind: "finish_doc",
        title: "Довършете документа си",
        body: `Имате незавършен комплект „${kit.title}". Кликнете „Отвори", за да продължите.`,
        link,
      });
      if (insErr) console.error("insert notification failed", insErr);
      else created++;
    }

    return new Response(
      JSON.stringify({ ok: true, scanned: kits?.length ?? 0, created, skipped }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("notify-unfinished-docs error", e);
    return new Response(
      JSON.stringify({ ok: false, error: String(e) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
