// Retention sweeper - runs hourly via pg_cron.
// Deletes:
//   - uploaded_contracts older than 24h that are not saved/linked
//   - trims extracted_text from older uploaded_contracts
//   - ai_audit_log rows older than 12 months
//   - orphaned storage objects in 'uploads' bucket
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";
import { requireServiceRole } from "../_shared/cron-auth.ts";
import { dryRunResponse, isDryRunRequest } from "../_shared/dry-run.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const denied = await requireServiceRole(req);
  if (denied) return denied;
  if (await isDryRunRequest(req)) return dryRunResponse("retention-sweeper", corsHeaders);


  const stats = {
    uploaded_deleted: 0,
    uploaded_text_trimmed: 0,
    audit_log_deleted: 0,
    storage_deleted: 0,
    errors: [] as string[],
  };

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const cutoff12mo = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Delete uploaded_contracts older than 24h that are not saved/linked.
    // Fetch candidates first to know storage paths.
    const { data: candidates, error: candErr } = await supabase
      .from("uploaded_contracts")
      .select("id, user_id, storage_path, folder_id, deal_id")
      .lt("created_at", cutoff24h)
      .is("folder_id", null)
      .is("deal_id", null)
      .limit(500);

    if (candErr) {
      stats.errors.push(`uploaded_contracts query: ${candErr.message}`);
    } else if (candidates && candidates.length > 0) {
      // Verify no risk_analyses references
      const ids = candidates.map((c) => c.id);
      const { data: linked } = await supabase
        .from("risk_analyses")
        .select("uploaded_contract_id")
        .in("uploaded_contract_id", ids);
      const linkedIds = new Set((linked ?? []).map((r) => r.uploaded_contract_id));
      const toDelete = candidates.filter((c) => !linkedIds.has(c.id));

      // Best-effort storage removal
      const storagePaths = toDelete
        .map((c) => c.storage_path)
        .filter((p): p is string => !!p);
      if (storagePaths.length > 0) {
        const { data: removed, error: rmErr } = await supabase.storage
          .from("uploads")
          .remove(storagePaths);
        if (rmErr) {
          stats.errors.push(`storage remove: ${rmErr.message}`);
        } else {
          stats.storage_deleted += removed?.length ?? 0;
        }
      }

      if (toDelete.length > 0) {
        const { error: delErr } = await supabase
          .from("uploaded_contracts")
          .delete()
          .in("id", toDelete.map((c) => c.id));
        if (delErr) {
          stats.errors.push(`uploaded_contracts delete: ${delErr.message}`);
        } else {
          stats.uploaded_deleted = toDelete.length;
        }
      }
    }

    // 2. Trim extracted_text from older uploaded_contracts that survived
    //    (e.g. saved into folders) but no longer need the raw text in DB.
    const { data: trimmed, error: trimErr } = await supabase
      .from("uploaded_contracts")
      .update({ extracted_text: "" })
      .lt("created_at", cutoff24h)
      .neq("extracted_text", "")
      .select("id");
    if (trimErr) {
      stats.errors.push(`extracted_text trim: ${trimErr.message}`);
    } else {
      stats.uploaded_text_trimmed = trimmed?.length ?? 0;
    }

    // 3. Delete ai_audit_log rows older than 12 months.
    const { data: auditDel, error: auditErr } = await supabase
      .from("ai_audit_log")
      .delete()
      .lt("created_at", cutoff12mo)
      .select("id");
    if (auditErr) {
      stats.errors.push(`ai_audit_log delete: ${auditErr.message}`);
    } else {
      stats.audit_log_deleted = auditDel?.length ?? 0;
    }

    return new Response(JSON.stringify({ ok: true, stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (e) {
    console.error("retention-sweeper error", e);
    return new Response(
      JSON.stringify({ ok: false, error: "internal_error", stats }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" }, status: 500 },
    );
  }
});
