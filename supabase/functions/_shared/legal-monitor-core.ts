// N0/N1 — детерминистични решения на монитора (без мрежа, без DB, без AI).
// Изнесени тук, за да са напълно тестируеми и еднозначни.

import type { ExpectedCadence, LegalSourceEntry } from "./legal-source-registry.ts";
import type { AdapterEnvelope, NormalizedItem } from "./legal-source-adapters.ts";
import { MAX_SUMMARY, MAX_TITLE, sanitizeExternalText } from "./legal-source-adapters.ts";

export type FreshnessState = "unknown" | "fresh" | "stale" | "failing" | "disabled";

export type RunOutcome = "success" | "no_change" | "changed" | "skipped" | "failed" | "needs_review";

export type RunTrigger = "manual" | "scheduled" | "dry_run";

const CADENCE_MS: Record<ExpectedCadence, number> = {
  hourly: 60 * 60 * 1000,
  daily: 24 * 60 * 60 * 1000,
  weekly: 7 * 24 * 60 * 60 * 1000,
  monthly: 31 * 24 * 60 * 60 * 1000,
  irregular: 45 * 24 * 60 * 60 * 1000,
};

/** Успехът остарява спрямо очакваната честота, умножена по толеранс 3. */
export function computeFreshnessState(input: {
  enabled: boolean;
  expectedCadence: ExpectedCadence;
  lastSuccessAt: string | null;
  lastAttemptAt: string | null;
  nowMs: number;
}): FreshnessState {
  if (!input.enabled) return "disabled";
  if (!input.lastSuccessAt) return input.lastAttemptAt ? "failing" : "unknown";
  const successMs = Date.parse(input.lastSuccessAt);
  if (!Number.isFinite(successMs)) return "unknown";
  const budget = CADENCE_MS[input.expectedCadence] * 3;
  if (input.nowMs - successMs > budget) return "stale";
  const attemptMs = input.lastAttemptAt ? Date.parse(input.lastAttemptAt) : NaN;
  if (Number.isFinite(attemptMs) && attemptMs - successMs > budget) return "failing";
  return "fresh";
}

export interface RunRecord {
  source_key: string;
  trigger: RunTrigger;
  started_at: string;
  finished_at: string;
  outcome: RunOutcome;
  http_status: number | null;
  content_type: string | null;
  byte_count: number | null;
  discovered_count: number;
  changed_count: number;
  error_code: string | null;
}

const FAILURE_OUTCOMES: ReadonlySet<RunOutcome> = new Set(["failed", "needs_review", "skipped"]);
const SUCCESS_OUTCOMES: ReadonlySet<RunOutcome> = new Set(["success", "no_change", "changed"]);

/**
 * Строи запис за пробег със същите инварианти като DB constraint-ите:
 * error_code съществува само при неуспех и никога не носи външен текст.
 */
export function buildRunRecord(input: {
  sourceKey: string;
  trigger: RunTrigger;
  startedAt: string;
  finishedAt: string;
  outcome: RunOutcome;
  httpStatus?: number | null;
  contentType?: string | null;
  byteCount?: number | null;
  discovered?: number;
  changed?: number;
  errorCode?: string | null;
}): RunRecord {
  const outcome = input.outcome;
  const rawCode = input.errorCode ?? null;
  const errorCode =
    rawCode && FAILURE_OUTCOMES.has(outcome) && /^[a-z][a-z0-9_]{2,59}$/.test(rawCode) ? rawCode : null;
  return {
    source_key: input.sourceKey,
    trigger: input.trigger,
    started_at: input.startedAt,
    finished_at: input.finishedAt,
    outcome,
    http_status: input.httpStatus ?? null,
    content_type: input.contentType ? input.contentType.slice(0, 120) : null,
    byte_count: typeof input.byteCount === "number" && input.byteCount >= 0 ? input.byteCount : null,
    discovered_count: Math.max(0, Math.min(100000, input.discovered ?? 0)),
    changed_count: Math.max(0, Math.min(100000, input.changed ?? 0)),
    error_code: errorCode,
  };
}

export interface RegistryTouch {
  last_attempt_at: string;
  last_success_at?: string;
  last_change_at?: string;
  freshness_state: FreshnessState;
}

/**
 * Пробег с неуспех НИКОГА не пипа last_success_at.
 * Само реална промяна пипа last_change_at.
 */
export function registryTouchForRun(input: {
  entry: Pick<LegalSourceEntry, "enabled" | "expectedCadence">;
  outcome: RunOutcome;
  at: string;
  previousLastSuccessAt: string | null;
}): RegistryTouch {
  const isSuccess = SUCCESS_OUTCOMES.has(input.outcome);
  const lastSuccess = isSuccess ? input.at : input.previousLastSuccessAt;
  const touch: RegistryTouch = {
    last_attempt_at: input.at,
    freshness_state: computeFreshnessState({
      enabled: input.entry.enabled,
      expectedCadence: input.entry.expectedCadence,
      lastSuccessAt: lastSuccess,
      lastAttemptAt: input.at,
      nowMs: Date.parse(input.at),
    }),
  };
  if (isSuccess) touch.last_success_at = input.at;
  if (input.outcome === "changed") touch.last_change_at = input.at;
  return touch;
}

export type SnapshotDecision = "unchanged" | "new_snapshot";

/** Идентичен checksum => no-op. Различен => нов snapshot и кандидати. */
export function decideSnapshot(previousChecksum: string | null, newChecksum: string): SnapshotDecision {
  return previousChecksum && previousChecksum === newChecksum ? "unchanged" : "new_snapshot";
}

export interface CandidateRow {
  source_key: string;
  snapshot_id: string;
  item_key: string;
  lifecycle: NormalizedItem["lifecycle"];
  official_identifier: string | null;
  celex: string | null;
  gazette_issue: string | null;
  title: string;
  publication_date: string | null;
  effective_date: string | null;
  summary: string;
  severity: NormalizedItem["severity"];
  diff_metadata: Record<string, unknown>;
}

/**
 * Превръща нормализирани елементи в редове за запис, налагайки същите
 * инварианти като DB: предложение без дата на влизане в сила, CELEX и брой на
 * ДВ взаимно изключващи се, ограничени дължини, дата на обнародване отделно от
 * датата на влизане в сила.
 */
export function toCandidateRows(
  envelope: AdapterEnvelope,
  snapshotId: string,
  changedChecksum: string,
): CandidateRow[] {
  return envelope.items.map((it) => {
    const lifecycle = it.lifecycle;
    const celex = it.celex ? it.celex.slice(0, 60) : null;
    return {
      source_key: envelope.sourceKey,
      snapshot_id: snapshotId,
      item_key: sanitizeExternalText(it.itemKey, 200),
      lifecycle,
      official_identifier: it.officialIdentifier ? sanitizeExternalText(it.officialIdentifier, 200) : null,
      celex,
      gazette_issue: celex ? null : it.gazetteIssue ? sanitizeExternalText(it.gazetteIssue, 60) : null,
      title: sanitizeExternalText(it.title, MAX_TITLE),
      publication_date: it.publicationDate,
      // Инвариант: proposed никога не е действащо право.
      effective_date: lifecycle === "proposed" ? null : it.effectiveDate,
      summary: sanitizeExternalText(it.summary, MAX_SUMMARY),
      severity: it.severity,
      diff_metadata: {
        parser_version: envelope.parserVersion,
        parser_status: envelope.parserStatus,
        adapter_id: envelope.adapterId,
        snapshot_checksum: changedChecksum,
      },
    };
  });
}

/** Изходът на монитора: без сурови payload-и, без лични данни. */
export interface SourceRunResult {
  source_key: string;
  outcome: RunOutcome;
  error_code: string | null;
  discovered: number;
  changed: number;
  parser_status: AdapterEnvelope["parserStatus"] | null;
  persisted: boolean;
}

// ---------------- Fail-closed DB решения (чисти помощници) ----------------

/** Затворено множество машинни кодове за DB проблеми. Никога raw error text. */
export type DbErrorCode =
  | "registry_read_failed"
  | "candidates_count_failed"
  | "runs_read_failed"
  | "snapshot_read_failed"
  | "snapshot_write_failed"
  | "candidate_write_failed"
  | "run_audit_write_failed"
  | "registry_touch_failed";

/**
 * Превръща Supabase резултат в затворен код. Без message/stack/payload.
 * Липсващи данни при успешна заявка НЕ са грешка (връща null).
 */
export function dbErrorCode(
  hasError: boolean,
  code: DbErrorCode,
): DbErrorCode | null {
  return hasError ? code : null;
}

export interface HealthAggregate {
  ok: boolean;
  degraded_codes: DbErrorCode[];
}

/**
 * Health е `ok` само когато ВСИЧКИ съставни заявки са успели. Частичен успех
 * се отчита като degraded, за да не се чете като „всичко е наред“.
 */
export function aggregateHealth(codes: readonly (DbErrorCode | null)[]): HealthAggregate {
  const degraded = codes.filter((c): c is DbErrorCode => c !== null);
  return { ok: degraded.length === 0, degraded_codes: degraded };
}

/**
 * Провал при запис на audit-а (ingestion run) или при touch на регистъра НЕ
 * може да остане „ok“. Резултатът за източника се влошава контролирано.
 */
export function degradeForBookkeepingFailure(
  outcome: RunOutcome,
  code: Extract<DbErrorCode, "run_audit_write_failed" | "registry_touch_failed">,
): { outcome: RunOutcome; error_code: DbErrorCode } {
  return { outcome: outcome === "failed" ? "failed" : "needs_review", error_code: code };
}

/**
 * Изчислява резултата, който ТРЯБВА да бъде записан в audit-а, при вече известен
 * провал на registry touch. Инвариант: никога success/no_change/changed след
 * известен touch failure — audit редът не бива да лъже.
 */
export function auditOutcomeAfterTouch(
  contentOutcome: RunOutcome,
  contentErrorCode: string | null,
  touchFailure: Extract<DbErrorCode, "registry_touch_failed"> | null,
): { outcome: RunOutcome; error_code: string | null } {
  if (!touchFailure) return { outcome: contentOutcome, error_code: contentErrorCode };
  const degraded = degradeForBookkeepingFailure(contentOutcome, touchFailure);
  return { outcome: degraded.outcome, error_code: degraded.error_code };
}
