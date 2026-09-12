// N0/N1 — единствен admin/service endpoint за контролния слой на нормативните
// източници.
//
// Действия:
//   sync_registry  — идемпотентен upsert на code-owned allowlist. БЕЗ мрежа.
//   poll           — проверява един или всички разрешени източници.
//   health         === агрегати за статус, без сурови payload-и.
//
// Гаранции:
//   * Fail-closed автентикация: service_role JWT или staff потребител.
//   * Никакъв URL от заявката. Само записи от регистъра.
//   * Изолация по източник: провалът на един не отбелязва другите като успешни.
//   * dry_run парсва и отчита, но НЕ записва нищо.
//   * Никакви AI/embedding заявки. Съществуващият RAG корпус не се пипа.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { buildCors } from "../_shared/cors.ts";
import {
  enabledSources,
  getRegistryEntry,
  LEGAL_SOURCE_REGISTRY,
  registrySyncRows,
} from "../_shared/legal-source-registry.ts";
import type { LegalSourceEntry } from "../_shared/legal-source-registry.ts";
import { safeFetchSource } from "../_shared/legal-fetch-guard.ts";
import { authorizeMonitorRequest } from "../_shared/legal-monitor-auth.ts";
import { INTERNAL_CRON_VERIFIER_RPC } from "../_shared/cron-auth.ts";
import { bearerToken } from "../_shared/service-token.ts";
import { runAdapter } from "../_shared/legal-source-adapters.ts";
import {
  aggregateHealth,
  auditOutcomeAfterTouch,
  buildRunRecord,
  dbErrorCode,
  decideSnapshot,
  degradeForBookkeepingFailure,
  registryTouchForRun,
  toCandidateRows,
} from "../_shared/legal-monitor-core.ts";
import type { DbErrorCode, RunOutcome, RunTrigger, SourceRunResult } from "../_shared/legal-monitor-core.ts";


const MAX_STORED_PAYLOAD = 200_000;

function json(body: unknown, status: number, cors: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  const cors = buildCors(req);
  if (req.method === "OPTIONS") return new Response(null, { headers: cors });
  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405, cors);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  if (!supabaseUrl || !serviceKey || !anonKey) {
    return json({ error: "server_not_configured" }, 500, cors);
  }

  const admin = createClient(supabaseUrl, serviceKey);

  // ---- Fail-closed автентикация: точен service ключ или staff потребител ----
  const auth = await authorizeMonitorRequest(
    {
      serviceKey,
      getUser: async (t) => {
        const { data, error } = await admin.auth.getUser(t);
        return { userId: data?.user?.id ?? null, error };
      },
      isStaff: async (userId) => {
        const { data, error } = await admin.rpc("is_staff", { _user_id: userId });
        return { staff: data === true, error };
      },
      verifyDedicated: async (candidate) => {
        const { data, error } = await admin.rpc(INTERNAL_CRON_VERIFIER_RPC, {
          _candidate: candidate,
        });
        if (error) throw error;
        return data === true;
      },
    },
    bearerToken(req),
  );
  if (!auth.ok) return json({ error: auth.error }, auth.status, cors);
  const isServiceRole = auth.isServiceRole;

  const body = (await req.json().catch(() => null)) as
    | { action?: unknown; source_key?: unknown; dry_run?: unknown }
    | null;
  const action = typeof body?.action === "string" ? body.action : "";
  const dryRun = body?.dry_run === true;
  const requestedKey = typeof body?.source_key === "string" ? body.source_key : null;

  try {
    // ---------------- sync_registry (без мрежа) ----------------
    if (action === "sync_registry") {
      const rows = registrySyncRows();
      if (dryRun) {
        return json({ ok: true, action, dry_run: true, sources: rows.length, rows }, 200, cors);
      }
      const { error } = await admin
        .from("legal_source_registry")
        .upsert(rows, { onConflict: "source_key" });
      if (error) return json({ error: "registry_sync_failed" }, 500, cors);
      return json({ ok: true, action, sources: rows.length }, 200, cors);
    }

    // ---------------- health ----------------
    if (action === "health") {
      const reg = await admin
        .from("legal_source_registry")
        .select(
          "source_key, title, jurisdiction, authority_tier, enabled, watch_only, review_status, expected_cadence, freshness_state, last_attempt_at, last_success_at, last_change_at, parser_version",
        )
        .order("source_key");
      const cand = await admin
        .from("legal_change_candidates")
        .select("id", { count: "exact", head: true })
        .eq("review_status", "new");
      const runs = await admin
        .from("legal_ingestion_runs")
        .select("source_key, outcome, error_code, started_at")
        .order("started_at", { ascending: false })
        .limit(50);

      // Fail-closed: частичен успех не се отчита като „ok“.
      const health = aggregateHealth([
        dbErrorCode(Boolean(reg.error), "registry_read_failed"),
        dbErrorCode(Boolean(cand.error), "candidates_count_failed"),
        dbErrorCode(Boolean(runs.error), "runs_read_failed"),
      ]);
      if (!health.ok) {
        return json(
          { ok: false, action, error: "health_degraded", degraded_codes: health.degraded_codes },
          503,
          cors,
        );
      }

      return json(
        {
          ok: true,
          action,
          code_allowlist: LEGAL_SOURCE_REGISTRY.length,
          enabled_in_code: enabledSources().length,
          pending_review: cand.count ?? 0,
          sources: reg.data ?? [],
          recent_runs: runs.data ?? [],
        },
        200,
        cors,
      );
    }



    // ---------------- poll ----------------
    if (action === "poll") {
      let targets: readonly LegalSourceEntry[];
      if (requestedKey) {
        const entry = getRegistryEntry(requestedKey);
        if (!entry) return json({ error: "unknown_source_key" }, 400, cors);
        targets = [entry];
      } else {
        targets = enabledSources();
      }

      const trigger: RunTrigger = dryRun ? "dry_run" : isServiceRole ? "scheduled" : "manual";
      const results: SourceRunResult[] = [];

      for (const entry of targets) {
        // Изолация: всеки източник има собствен try/catch и собствен запис.
        const startedAt = new Date().toISOString();
        let outcome: RunOutcome = "failed";
        let errorCode: string | null = "unknown_error";
        let httpStatus: number | null = null;
        let contentType: string | null = null;
        let byteCount: number | null = null;
        let discovered = 0;
        let changed = 0;
        let parserStatus: SourceRunResult["parser_status"] = null;
        let persisted = false;

        try {
          if (!entry.enabled || entry.reviewStatus !== "approved") {
            outcome = "skipped";
            errorCode = "source_disabled";
          } else {
            const fetched = await safeFetchSource(entry);
            if (!fetched.ok) {
              outcome = "failed";
              errorCode = fetched.errorCode;
              httpStatus = fetched.status;
            } else if (fetched.notModified) {
              outcome = "no_change";
              errorCode = null;
              httpStatus = 304;
            } else {
              httpStatus = fetched.status;
              contentType = fetched.contentType;
              byteCount = fetched.byteCount;

              const envelope = runAdapter(entry.adapterId, fetched.body, entry.parserVersion);
              parserStatus = envelope.parserStatus;
              discovered = envelope.items.length;

              if (envelope.parserStatus === "parser_error") {
                // Fail-closed: без фалшив успех и без резервен неофициален източник.
                outcome = "needs_review";
                errorCode = envelope.errorCode ?? "unrecognized_schema";
              } else {
                const prevRead = await admin
                  .from("legal_source_snapshots")
                  .select("checksum")
                  .eq("source_key", entry.sourceKey)
                  .order("retrieved_at", { ascending: false })
                  .limit(1)
                  .maybeSingle();

                if (prevRead.error) {
                  // Fail-closed: без предишен checksum „changed“ не е надеждно.
                  outcome = "failed";
                  errorCode = "snapshot_read_failed";
                } else {
                const decision = decideSnapshot(prevRead.data?.checksum ?? null, fetched.checksum);

                if (decision === "unchanged") {
                  outcome = "no_change";
                  errorCode = null;
                } else if (dryRun) {

                  outcome = envelope.parserStatus === "needs_review" ? "needs_review" : "changed";
                  errorCode = envelope.parserStatus === "needs_review"
                    ? envelope.errorCode ?? "unrecognized_schema"
                    : null;
                  changed = envelope.items.length;
                } else {
                  const { data: snap, error: snapErr } = await admin
                    .from("legal_source_snapshots")
                    .insert({
                      source_key: entry.sourceKey,
                      canonical_url: fetched.canonicalUrl,
                      content_type: fetched.contentType,
                      byte_count: fetched.byteCount,
                      checksum: fetched.checksum,
                      parser_version: entry.parserVersion,
                      raw_payload: fetched.body.slice(0, MAX_STORED_PAYLOAD),
                    })
                    .select("id")
                    .single();

                  if (snapErr || !snap) {
                    outcome = "failed";
                    errorCode = "snapshot_write_failed";
                  } else {
                    const rows = toCandidateRows(envelope, snap.id, fetched.checksum);
                    if (rows.length > 0) {
                      const { error: candErr } = await admin
                        .from("legal_change_candidates")
                        .upsert(rows, { onConflict: "snapshot_id,item_key", ignoreDuplicates: true });
                      if (candErr) {
                        outcome = "needs_review";
                        errorCode = "candidate_write_failed";
                      } else {
                        changed = rows.length;
                        outcome = envelope.parserStatus === "needs_review" ? "needs_review" : "changed";
                        errorCode = envelope.parserStatus === "needs_review"
                          ? envelope.errorCode ?? "unrecognized_schema"
                          : null;
                        persisted = true;
                      }
                    } else {
                      outcome = "no_change";
                      errorCode = null;
                      persisted = true;
                    }
                  }
                }
                }

              }
            }
          }
        } catch {
          outcome = "failed";
          errorCode = "unhandled_source_error";
        }

        const finishedAt = new Date().toISOString();

        // Ред на bookkeeping: първо registry touch, после audit запис с ФИНАЛНИЯ
        // резултат. Така записаният audit ред никога не остава „success“ при
        // известен провал на touch.
        let touchFailure: Extract<DbErrorCode, "registry_touch_failed"> | null = null;

        if (!dryRun) {
          const regRead = await admin
            .from("legal_source_registry")
            .select("last_success_at")
            .eq("source_key", entry.sourceKey)
            .maybeSingle();
          if (regRead.error) {
            touchFailure = "registry_touch_failed";
          } else {
            const touch = registryTouchForRun({
              entry,
              outcome,
              at: finishedAt,
              previousLastSuccessAt: regRead.data?.last_success_at ?? null,
            });
            const upd = await admin
              .from("legal_source_registry")
              .update(touch)
              .eq("source_key", entry.sourceKey);
            if (upd.error) touchFailure = "registry_touch_failed";
          }
        }

        const audited = auditOutcomeAfterTouch(outcome, errorCode, touchFailure);

        const record = buildRunRecord({
          sourceKey: entry.sourceKey,
          trigger,
          startedAt,
          finishedAt,
          outcome: audited.outcome,
          httpStatus,
          contentType,
          byteCount,
          discovered,
          changed,
          errorCode: audited.error_code,
        });

        let finalOutcome: RunOutcome = record.outcome;
        let finalErrorCode: string | null = record.error_code;

        if (!dryRun) {
          const runIns = await admin.from("legal_ingestion_runs").insert(record);
          if (runIns.error) {
            // Липсващ audit ред не може да се отчете като успех.
            const degraded = degradeForBookkeepingFailure(record.outcome, "run_audit_write_failed");
            finalOutcome = degraded.outcome;
            finalErrorCode = degraded.error_code;
          }
        }

        results.push({
          source_key: entry.sourceKey,
          outcome: finalOutcome,
          error_code: finalErrorCode,
          discovered: record.discovered_count,
          changed: record.changed_count,
          parser_status: parserStatus,
          // `persisted` описва честно съдържателния запис (snapshot/candidates),
          // не bookkeeping-а.
          persisted: dryRun ? false : persisted,
        });

      }

      return json(
        { ok: true, action, dry_run: dryRun, polled: results.length, results },
        200,
        cors,
      );
    }

    return json({ error: "unknown_action" }, 400, cors);
  } catch (e) {
    console.error("legal-source-monitor", (e as Error)?.name ?? "error");
    return json({ error: "internal_error" }, 500, cors);
  }
});
