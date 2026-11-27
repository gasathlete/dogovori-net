// Retention sweeper - runs hourly via pg_cron.
//
// НОРМАЛЕН РЕЖИМ (мутации, в този ред):
//   1. uploaded_contracts по-стари от 24 ч, които не са запазени/свързани
//   2. изчистване на extracted_text от по-старите оцелели записи
//   3. ai_audit_log по-стар от 12 месеца
//   4. изтекли временни файлове по заявка (storage_artifacts)
//   5. изравняване на застояли единични резервации (quota_operations)
//   6. трите слоя изтекъл точен товар: anon/review (0034),
//      quota_operations.result_ref (0035), quota_wave_operations.result (0037)
//   7. маркиране на застояли вълни за изрично изравняване (без авто-връщане)
//
// DRY-RUN (`?count_only=1`): проверява се ВЕДНАГА след auth и ПРЕДИ всяка
// мутация. В този режим се изпълнява САМО едно само-четящо преброяване
// (public.retention_due_counts, 0038) — никакво изтриване, обновяване,
// премахване от хранилището, изравняване или маркиране.
//
// ДОГОВОР ЗА ГРЕШКИ: навън излизат само стабилни кодове на етап и correlation
// id — никакви DB/storage съобщения, пътища, SQL или потребителски данни. Ако
// някой етап се провали, отговорът е ok:false с HTTP 503, а числата за
// частично свършената работа се отчитат честно.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-correlation-id, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};
import { requireServiceRole } from "../_shared/cron-auth.ts";
import { dryRunResponse, isDryRunRequest } from "../_shared/dry-run.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function isCountOnly(req: Request): boolean {
  try {
    return new URL(req.url).searchParams.get("count_only") === "1";
  } catch {
    return false;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  const denied = await requireServiceRole(req);
  if (denied) return denied;
  if (await isDryRunRequest(req)) return dryRunResponse("retention-sweeper", corsHeaders);

  // ПЪРВО: режимът се решава преди да е извършена каквато и да е мутация.
  const countOnly = isCountOnly(req);
  const correlationId = crypto.randomUUID();
  const jsonHeaders = {
    ...corsHeaders,
    "Content-Type": "application/json",
    "x-correlation-id": correlationId,
  };

  const stats = {
    mode: countOnly ? "count_only" : "sweep",
    uploaded_deleted: 0,
    uploaded_text_trimmed: 0,
    audit_log_deleted: 0,
    storage_deleted: 0,
    request_artifacts_examined: 0,
    // Истинна статистика: потвърдено премахнати, вече липсващи и маркирани.
    request_artifacts_removed: 0,
    request_artifacts_missing: 0,
    request_artifacts_marked: 0,
    request_artifacts_skipped: 0,
    stale_operations_examined: 0,
    stale_operations_cancelled: 0,
    stale_operations_unresolved: 0,
    // Изтекли точни отговори: заличава се САМО товарът, счетоводните и
    // anti-replay данни остават.
    exact_responses_examined: 0,
    exact_responses_cleared_anon: 0,
    exact_responses_cleared_review: 0,
    quota_results_due: 0,
    quota_results_cleared: 0,
    wave_results_due: 0,
    wave_results_cleared: 0,
    // Изтекли резервации на вълни: САМО маркиране за изрично решение.
    wave_stale_due: 0,
    wave_stale_examined: 0,
    wave_stale_flagged: 0,
    operations_stale_due: 0,
  };
  // Само стабилни имена на етапи — без DB/storage текст.
  const failedStages: string[] = [];
  const fail = (stage: string) => {
    if (!failedStages.includes(stage)) failedStages.push(stage);
  };

  const respond = () =>
    new Response(
      JSON.stringify(
        failedStages.length > 0
          ? { ok: false, error: "retention_incomplete", failed_stages: failedStages, correlation_id: correlationId, stats }
          : { ok: true, correlation_id: correlationId, stats },
      ),
      { headers: jsonHeaders, status: failedStages.length > 0 ? 503 : 200 },
    );

  try {
    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // =======================================================================
    // DRY-RUN: САМО преброяване. Връща се преди всеки мутиращ помощник/RPC.
    // =======================================================================
    if (countOnly) {
      const { data: due, error: dueErr } = await supabase.rpc("retention_due_counts");
      if (dueErr) {
        fail("due_counts");
      } else {
        const r = (due ?? {}) as Record<string, unknown>;
        stats.exact_responses_examined = Number(r.anon_due ?? 0) + Number(r.review_due ?? 0);
        stats.quota_results_due = Number(r.quota_results_due ?? 0);
        stats.wave_results_due = Number(r.wave_results_due ?? 0);
        stats.wave_stale_due = Number(r.wave_stale_due ?? 0);
        stats.operations_stale_due = Number(r.operations_stale_due ?? 0);
      }
      return respond();
    }

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
      fail("uploaded_contracts_query");
    } else if (candidates && candidates.length > 0) {
      // Verify no risk_analyses references
      const ids = candidates.map((c) => c.id);
      const { data: linked, error: linkedErr } = await supabase
        .from("risk_analyses")
        .select("uploaded_contract_id")
        .in("uploaded_contract_id", ids);
      if (linkedErr) fail("risk_analyses_query");
      const linkedIds = new Set((linked ?? []).map((r) => r.uploaded_contract_id));
      const toDelete = linkedErr ? [] : candidates.filter((c) => !linkedIds.has(c.id));

      // Best-effort storage removal
      const storagePaths = toDelete
        .map((c) => c.storage_path)
        .filter((p): p is string => !!p);
      if (storagePaths.length > 0) {
        const { data: removed, error: rmErr } = await supabase.storage
          .from("uploads")
          .remove(storagePaths);
        if (rmErr) {
          fail("storage_remove");
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
          fail("uploaded_contracts_delete");
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
      fail("extracted_text_trim");
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
      fail("audit_log_delete");
    } else {
      stats.audit_log_deleted = auditDel?.length ?? 0;
    }

    // 4. Изтеклите временни файлове по заявка (download-blank) се заличават.
    //    Публични/одобрени и draft/ обекти НЕ се пипат.
    const { sweepExpiredRequestArtifacts } = await import("../_shared/artifact-sweep.ts");
    const sweep = await sweepExpiredRequestArtifacts(
      supabase as unknown as Parameters<typeof sweepExpiredRequestArtifacts>[0],
    );
    stats.request_artifacts_examined = sweep.examined;
    stats.request_artifacts_removed = sweep.removed;
    stats.request_artifacts_missing = sweep.missing;
    stats.request_artifacts_marked = sweep.marked;
    stats.request_artifacts_skipped = sweep.skipped_not_request;
    // Само фактът на провала — съобщенията на помощника не излизат навън.
    if (sweep.errors.length > 0) fail("artifact_sweep");

    // 5. Изравняване на изтекли резервации на квота: точно едно връщане,
    //    заключени редове, потвърдените операции остават непокътнати.
    const { reconcileStaleOperations } = await import("../_shared/quota-ledger.ts");
    const stale = await reconcileStaleOperations(
      supabase as unknown as Parameters<typeof reconcileStaleOperations>[0],
      50,
    );
    stats.stale_operations_examined = stale.examined;
    stats.stale_operations_cancelled = stale.cancelled;
    stats.stale_operations_unresolved = stale.unresolved;
    if (stale.error) fail("quota_reconcile_stale");

    // 6. Изтекли ТОЧНИ отговори (24 ч прозорец за повторен опит): заличава се
    //    САМО JSON товарът. Правата, квотите и anti-replay обвързването остават.
    const { data: sweepData, error: sweepErr } = await supabase.rpc(
      "sweep_expired_exact_responses",
      { p_limit: 500, p_dry_run: false },
    );
    if (sweepErr) {
      fail("exact_response_sweep");
    } else {
      const r = (sweepData ?? {}) as Record<string, unknown>;
      stats.exact_responses_examined = Number(r.anon_due ?? 0) + Number(r.review_due ?? 0);
      stats.exact_responses_cleared_anon = Number(r.anon_cleared ?? 0);
      stats.exact_responses_cleared_review = Number(r.review_cleared ?? 0);
    }

    // Единичните операции (0035).
    const { data: quotaSweep, error: quotaSweepErr } = await supabase.rpc(
      "sweep_expired_quota_results",
      { p_limit: 500, p_dry_run: false },
    );
    if (quotaSweepErr) {
      fail("quota_result_sweep");
    } else {
      const r = (quotaSweep ?? {}) as Record<string, unknown>;
      stats.quota_results_due = Number(r.due ?? 0);
      stats.quota_results_cleared = Number(r.cleared ?? 0);
    }

    // Вълните поправки (0037).
    const { data: waveSweep, error: waveSweepErr } = await supabase.rpc(
      "sweep_expired_quota_wave_results",
      { p_limit: 500, p_dry_run: false },
    );
    if (waveSweepErr) {
      fail("quota_wave_result_sweep");
    } else {
      const r = (waveSweep ?? {}) as Record<string, unknown>;
      stats.wave_results_due = Number(r.due ?? 0);
      stats.wave_results_cleared = Number(r.cleared ?? 0);
    }

    // 7. Изтекли резервации на вълни: САМО маркиране + доказателство за
    //    изравняване. Без автоматично връщане на квота и без пре-резервация.
    const { data: waveStale, error: waveStaleErr } = await supabase.rpc(
      "quota_wave_reconcile_stale",
      { p_limit: 50 },
    );
    if (waveStaleErr) {
      fail("quota_wave_reconcile_stale");
    } else {
      const r = (waveStale ?? {}) as Record<string, unknown>;
      stats.wave_stale_examined = Number(r.examined ?? 0);
      stats.wave_stale_flagged = Number(r.flagged ?? 0);
    }

    // 8. Ходовете на асистента (0039): изтича САМО товарът на транскрипта;
    //    съобщенията, обвързването и счетоводството остават.
    const { data: turnSweep, error: turnSweepErr } = await supabase.rpc(
      "sweep_expired_assistant_turn_results",
      { p_limit: 500, p_dry_run: false },
    );
    if (turnSweepErr) {
      fail("assistant_turn_result_sweep");
    } else {
      const r = (turnSweep ?? {}) as Record<string, unknown>;
      stats.assistant_results_due = Number(r.due ?? 0);
      stats.assistant_results_cleared = Number(r.cleared ?? 0);
    }

    // 9. Застояли ходове: САМО маркиране за изравняване, без авто-връщане.
    const { data: turnStale, error: turnStaleErr } = await supabase.rpc(
      "assistant_turn_reconcile_stale",
      { p_limit: 50 },
    );
    if (turnStaleErr) {
      fail("assistant_turn_reconcile_stale");
    } else {
      const r = (turnStale ?? {}) as Record<string, unknown>;
      stats.assistant_stale_examined = Number(r.examined ?? 0);
      stats.assistant_stale_flagged = Number(r.flagged ?? 0);
    }

    return respond();
  } catch {
    // Без суров текст на изключението в лога и в отговора.
    console.error("retention-sweeper failed", { correlation_id: correlationId });
    fail("unexpected");
    return respond();
  }
});
