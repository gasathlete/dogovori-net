import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors, clientIp, hashIp } from "../_shared/cors.ts";

serve(async (req) => {
  const corsHeaders = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData?.user) {
      return new Response(JSON.stringify({ error: "Unauthorized", detail: userErr?.message }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const userId = userData.user.id;
    const ipHash = await hashIp(clientIp(req));

    const body = await req.json();
    const { kind, title, payload, source_id, contact_id, saved_document_id } = body as {
      kind: "contract" | "template";
      title: string;
      payload: unknown;
      source_id?: string;
      contact_id?: string;
      saved_document_id?: string;
    };

    if (!["contract", "template"].includes(kind)) {
      return new Response(JSON.stringify({ error: "Invalid kind" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pro status drives watermark on/off
    const { data: planRow } = await admin
      .from("download_quota")
      .select("plan, pro_until, contracts_used, templates_used, bonus_contracts")
      .eq("user_id", userId)
      .maybeSingle();
    const isPro =
      !!planRow && (planRow.plan === "pro" || (!!planRow.pro_until && new Date(planRow.pro_until) > new Date()));
    const bonusAvailable = (planRow?.bonus_contracts ?? 0) > 0;
    // Watermark for re-downloads / generic state (no consume happens).
    // For new downloads we recompute below using `used_bonus`.
    const watermark = !isPro && !bonusAvailable;
    const userTag = userId.slice(0, 8);

    const auditInsert = (action: string, target_id?: string, metadata?: Record<string, unknown>) =>
      admin.from("audit_log").insert({
        user_id: userId,
        action,
        target_type: "document",
        target_id: target_id ?? null,
        metadata: metadata ?? null,
        ip_hash: ipHash,
      });

    // Re-download of an existing saved document is free (no quota check).
    if (saved_document_id) {
      const { data: existing } = await admin
        .from("saved_documents")
        .select("id, payload, title, kind, user_id")
        .eq("id", saved_document_id)
        .eq("user_id", userId)
        .maybeSingle();
      if (!existing) {
        return new Response(JSON.stringify({ error: "Not found" }), {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      // Re-download is genuinely free: do NOT increment usage counters.
      // (Previously this incremented contracts_used/templates_used, causing
      // free users to exhaust their lifetime allowance on repeat downloads.)
      await auditInsert("redownload", existing.id, { kind: existing.kind });
      return new Response(
        JSON.stringify({
          ok: true,
          payload: existing.payload,
          title: existing.title,
          free: true,
          watermark,
          user_tag: userTag,
        }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    if (!planRow) {
      return new Response(JSON.stringify({ error: "Quota row missing" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Atomic quota consumption — must run via a USER-scoped client so that
    // auth.uid() resolves inside the SECURITY DEFINER RPC. Using the admin
    // (service role) client would make auth.uid() NULL and the function would
    // raise 'unauthenticated'.
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: consumed, error: consumeErr } = await userClient.rpc("consume_quota", { _kind: kind });
    if (consumeErr) {
      return new Response(JSON.stringify({ error: consumeErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const quotaResult = consumed as { ok: boolean; reason?: string; used_bonus?: boolean; is_pro: boolean };
    if (!quotaResult?.ok) {
      return new Response(
        JSON.stringify({ error: "quota_exceeded", kind, limit: 1 }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }
    const useBonus = !!quotaResult.used_bonus;

    const { data: saved, error: saveErr } = await admin
      .from("saved_documents")
      .insert({
        user_id: userId,
        kind,
        title,
        payload,
        source_id: source_id ?? null,
        contact_id: contact_id ?? null,
        folder_id: null,
      })
      .select()
      .single();
    if (saveErr) {
      // Refund the quota we just consumed since the save failed.
      await admin.rpc("refund_quota", { _user_id: userId, _kind: kind, _used_bonus: useBonus });
      return new Response(JSON.stringify({ error: saveErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await auditInsert("download", saved.id, { kind, used_bonus: useBonus });

    return new Response(
      JSON.stringify({
        ok: true,
        payload,
        title,
        saved_document_id: saved.id,
        free: false,
        watermark,
        user_tag: userTag,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as Error).message ?? e) }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
