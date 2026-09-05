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
    const { kind, title, payload, source_id, contact_id, folder_id, saved_document_id, session_id, doc_key, template_slug } = body as {
      kind: "contract" | "template";
      title: string;
      payload: unknown;
      source_id?: string;
      contact_id?: string;
      folder_id?: string;
      saved_document_id?: string;
      session_id?: string;
      doc_key?: string;
      template_slug?: string;
    };

    // Sprint 3 — surface template_slug into audit metadata so the
    // download-counts trigger can aggregate by template.
    const BG_TO_LAT: Record<string, string> = {
      а:"a",б:"b",в:"v",г:"g",д:"d",е:"e",ж:"zh",з:"z",и:"i",й:"y",
      к:"k",л:"l",м:"m",н:"n",о:"o",п:"p",р:"r",с:"s",т:"t",у:"u",
      ф:"f",х:"h",ц:"ts",ч:"ch",ш:"sh",щ:"sht",ъ:"a",ь:"y",ю:"yu",я:"ya",
    };
    const slugify = (s: string): string => {
      let out = "";
      for (const ch of (s || "").toLowerCase()) {
        if (BG_TO_LAT[ch] !== undefined) out += BG_TO_LAT[ch];
        else if (/[a-z0-9]/.test(ch)) out += ch;
        else out += "-";
      }
      return out.replace(/-+/g, "-").replace(/^-|-$/g, "").substring(0, 90);
    };
    const resolvedSlug = (template_slug && template_slug.trim()) || (title ? slugify(title) : null);

    if (!["contract", "template"].includes(kind)) {
      return new Response(JSON.stringify({ error: "Invalid kind" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Pro status drives watermark on/off
    const { data: planRow } = await admin
      .from("download_quota")
      .select("plan, pro_until, contracts_used, templates_used, bonus_contracts, topup_ops_balance")
      .eq("user_id", userId)
      .maybeSingle();
    const isPro =
      !!planRow && (planRow.plan === "pro" || (!!planRow.pro_until && new Date(planRow.pro_until) > new Date()));
    // Paid one-off operations (topup_ops_balance) count the same as legacy
    // admin bonuses here: a user who paid should not be watermarked on
    // re-downloads just because the charge came from the paid balance.
    const bonusAvailable =
      (planRow?.bonus_contracts ?? 0) > 0 || (planRow?.topup_ops_balance ?? 0) > 0;
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
      await auditInsert("redownload", existing.id, { kind: existing.kind, template_slug: resolvedSlug });
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

    // --- Strict Document paywall ---------------------------------------
    // Wizard-generated contracts are "Стриктни документи" — reserved for
    // paid users OR users who bought the one-off unlock bundle (2.90€ =
    // 24h unlock + 5 operations). If the user is not Pro, look for an
    // active unlock for this specific (user, doc_key).
    // If none, return `strict_paywall` BEFORE consuming any free ops.
    // Templates and other kinds go through the normal quota path.
    let strictUnlockActive = false;
    if (kind === "contract" && !isPro && doc_key) {
      const { data: unlock } = await admin
        .from("strict_doc_unlocks")
        .select("id, expires_at")
        .eq("user_id", userId)
        .eq("doc_key", doc_key)
        .gt("expires_at", new Date().toISOString())
        .maybeSingle();
      strictUnlockActive = !!unlock;
      if (!strictUnlockActive) {
        return new Response(
          JSON.stringify({ error: "strict_paywall", kind, doc_key }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }

    // Atomic quota consumption — must run via a USER-scoped client so that
    // auth.uid() resolves inside the SECURITY DEFINER RPC.
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    // If client supplied a session_id + doc_key, route through the session-aware
    // RPC so that repeat actions on the same document in the same browser tab
    // do not double-charge. Otherwise fall back to plain consume_quota.
    // When a strict-unlock is active, we skip quota consumption entirely.
    const useSession = !!session_id && !!doc_key;
    let quotaResult: {
      ok: boolean;
      reason?: string;
      used_bonus?: boolean;
      is_pro: boolean;
      charged?: boolean;
      reused_session_charge?: boolean;
    };
    if (strictUnlockActive) {
      quotaResult = { ok: true, is_pro: false, charged: false, used_bonus: false };
    } else {
      const { data: consumed, error: consumeErr } = useSession
        ? await userClient.rpc("consume_quota_session", {
            _kind: kind,
            _doc_key: doc_key,
            _session_id: session_id,
          })
        : await userClient.rpc("consume_quota", { _kind: kind });
      if (consumeErr) {
        return new Response(JSON.stringify({ error: consumeErr.message }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
      quotaResult = consumed as typeof quotaResult;
      if (!quotaResult?.ok) {
        return new Response(
          JSON.stringify({ error: "quota_exceeded", kind, limit: 1 }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
        );
      }
    }
    const useBonus = !!quotaResult.used_bonus;
    const charged = quotaResult.charged !== false && !strictUnlockActive;

    const { data: saved, error: saveErr } = await admin
      .from("saved_documents")
      .insert({
        user_id: userId,
        kind,
        title,
        payload,
        source_id: source_id ?? null,
        contact_id: contact_id ?? null,
        folder_id: folder_id ?? null,
      })
      .select()
      .single();
    if (saveErr) {
      // Refund the quota we just consumed since the save failed.
      // Only refund when we actually charged (session-reused calls are free).
      if (charged) {
        await admin.rpc("refund_quota", { _user_id: userId, _kind: kind, _used_bonus: useBonus });
      }
      return new Response(JSON.stringify({ error: saveErr.message }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    await auditInsert("download", saved.id, { kind, used_bonus: useBonus, charged, template_slug: resolvedSlug });

    const newDownloadWatermark = !isPro && !useBonus && !bonusAvailable;

    return new Response(
      JSON.stringify({
        ok: true,
        payload,
        title,
        saved_document_id: saved.id,
        free: !charged,
        charged,
        reused_session_charge: !!quotaResult.reused_session_charge,
        watermark: newDownloadWatermark,
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
