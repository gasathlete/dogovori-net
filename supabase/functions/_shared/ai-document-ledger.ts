/**
 * GATE 2 — ТОЧНО ЕДНО ИЗПЪЛНЕНИЕ за четирите удостоверени пътя с модел:
 *   correct_uploaded | generate_linked_document | negotiation_strategy | ocr_contract
 *
 * Принципи (същите като при асистента, но за документните пътища):
 *  - Всяка заявка, която МОЖЕ да стигне до модел, носи клиентски UUID
 *    operation_id. Без него няма изпълнение.
 *  - Каноничното обвързване покрива потребител, предназначение, ТОЧНИЯ собствен
 *    ресурс, непроменимата версия/отпечатък и ВСЯКА опция, която влияе на
 *    резултата. Никакво сурово съдържание (текст, изображение, base64) не влиза
 *    в обвързването, в леджъра или в журналите — само отпечатъци.
 *  - Само-четящото търсене е ПРЕДИ ограниченията на честотата, ключа на
 *    доставчика, квотата, RAG и всяка бизнес промяна.
 *  - Резервация → трайно `model_started` → потвърждение/отмяна/изравняване.
 *    НИКОЕ повикване към доставчик не се прави преди трайно записан
 *    `model_started`.
 *  - След `model_started` несигурността НЕ връща квота автоматично и НЕ вика
 *    модела втори път: отива в изравняване.
 *
 * Таблица и RPC: миграция 0040 (`ai_document_operations`). Само service_role.
 */

import { canonicalize, sha256Hex } from "./canonical-digest.ts";
import {
  BILLING_RECONCILIATION_MESSAGE_BG,
  BILLING_RECONCILIATION_REQUIRED,
  OPERATION_IN_PROGRESS,
  RESPONSE_EXPIRED,
} from "./quota-ledger.ts";

export const AI_DOCUMENT_PURPOSES = [
  "correct_uploaded",
  "generate_linked_document",
  "negotiation_strategy",
  "ocr_contract",
] as const;

export type AiDocumentPurpose = typeof AI_DOCUMENT_PURPOSES[number];

/**
 * ТОЧНИ БЮДЖЕТИ за повиквания към доставчик на ЕДНА операция. Броят включва
 * основното повикване, поправката на JSON и резервния модел — заедно.
 */
export const PROVIDER_CALL_BUDGET: Record<AiDocumentPurpose, number> = {
  // 1 генериране + най-много 1 повторно четене/поправка на JSON.
  correct_uploaded: 2,
  // 1 генериране; RAG вгражданията не са генеративни повиквания.
  generate_linked_document: 1,
  // 1 основен модел + най-много 1 резервен модел.
  negotiation_strategy: 2,
  // Най-много 12 страници = най-много 12 повиквания за ЦЯЛАТА партида.
  ocr_contract: 12,
};

export const OPERATION_ID_REQUIRED = "operation_id_required";
export const OPERATION_BINDING_CONFLICT = "operation_binding_conflict";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Валиден клиентски operation_id или null. Нищо не се „поправя" тихо. */
export function asOperationId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().toLowerCase();
  return UUID_RE.test(v) ? v : null;
}

export interface DocumentBindingInput {
  purpose: AiDocumentPurpose;
  userId: string;
  /** Точният собствен ресурс (документ/анализ) или null, когато няма такъв. */
  resourceId: string | null;
  /** Непроменима версия/отпечатък на ресурса (например SHA-256 на текста). */
  resourceVersion: string | null;
  /** ВСЯКА опция, която влияе на резултата (вид, режим, език, избор…). */
  options: Record<string, unknown>;
}

/**
 * Каноничен SHA-256 в малки букви. Подредбата на ключовете е детерминирана, а
 * стойностите трябва вече да са отпечатъци/идентификатори — НЕ съдържание.
 */
export function canonicalDocumentBinding(input: DocumentBindingInput): Promise<string> {
  return sha256Hex(canonicalize([
    "ai_document_operation_v1",
    input.purpose,
    input.userId,
    input.resourceId ?? "",
    input.resourceVersion ?? "",
    input.options ?? {},
  ]));
}

/**
 * Обвързване на ПОДРЕДЕНАТА последователност страници за OCR: само SHA-256 на
 * всяка страница и нечувствителна метаинформация. base64/байтове НИКОГА.
 */
export async function ocrPageSequenceDigest(dataUrls: string[]): Promise<{
  digest: string;
  pages: Array<{ index: number; bytes: number; sha256: string }>;
}> {
  const pages: Array<{ index: number; bytes: number; sha256: string }> = [];
  for (let i = 0; i < dataUrls.length; i++) {
    const raw = String(dataUrls[i] ?? "");
    pages.push({ index: i, bytes: raw.length, sha256: await sha256Hex(raw) });
  }
  return {
    digest: await sha256Hex(canonicalize(pages.map((p) => [p.index, p.bytes, p.sha256]))),
    pages,
  };
}

/* -------------------------------------------------------------------------
 * Клиент на RPC — минимален контракт, за да е тестваемо без мрежа.
 * ------------------------------------------------------------------------- */

export interface LedgerRpc {
  rpc(
    name: string,
    params: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { message: string } | null }>;
}

export type LedgerOutcome =
  | { kind: "absent" }
  | { kind: "reserved"; waveOps: number; leaseSeconds: number }
  | { kind: "committed"; result: Record<string, unknown>; replay: boolean }
  | { kind: "in_progress"; retryAfterSeconds: number; modelStarted: boolean }
  | { kind: "conflict"; reason: string }
  | { kind: "reconciliation"; reason: string }
  | { kind: "response_expired" }
  | { kind: "quota_exhausted"; reason: string }
  | { kind: "unavailable"; reason: string };

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function mapOutcome(raw: unknown): LedgerOutcome {
  const row = asRecord(raw);
  const status = String(row.status ?? "");
  const reason = String(row.reason ?? status ?? "unknown");
  switch (status) {
    case "absent":
      return { kind: "absent" };
    case "reserved":
      return {
        kind: "reserved",
        waveOps: Number(row.wave_ops ?? 0),
        leaseSeconds: Number(row.lease_seconds ?? 300),
      };
    case "committed":
    case "replay":
      return {
        kind: "committed",
        result: asRecord(row.result),
        replay: row.replay === true || status === "replay",
      };
    case "in_progress":
      return {
        kind: "in_progress",
        retryAfterSeconds: Math.max(1, Number(row.retry_after_seconds ?? 4)),
        modelStarted: row.model_started === true,
      };
    case "response_expired":
      return { kind: "response_expired" };
    case "conflict":
      return { kind: "conflict", reason };
    case "reconciliation":
      return { kind: "reconciliation", reason };
    case "quota_exhausted":
    case "denied":
      return { kind: "quota_exhausted", reason };
    case "invalid":
      return { kind: "unavailable", reason: "invalid_request" };
    default:
      return { kind: "unavailable", reason: reason || "unknown_status" };
  }
}

/** Грешка от базата НИКОГА не се тълкува като „няма операция". */
function mapError(error: { message: string } | null | undefined): LedgerOutcome | null {
  if (!error) return null;
  return { kind: "unavailable", reason: "ledger_unavailable" };
}

/** САМО-ЧЕТЯЩО. Извиква се преди всяка променлива стъпка. */
export async function lookupDocumentOperation(
  db: LedgerRpc,
  input: { operationId: string; userId: string; purpose: AiDocumentPurpose; binding: string },
): Promise<LedgerOutcome> {
  const { data, error } = await db.rpc("ai_document_operation_lookup", {
    p_operation_id: input.operationId,
    p_user_id: input.userId,
    p_purpose: input.purpose,
    p_binding: input.binding,
  });
  return mapError(error) ?? mapOutcome(data);
}

export interface ReserveDocumentInput {
  operationId: string;
  userId: string;
  purpose: AiDocumentPurpose;
  binding: string;
  inputDigest?: string | null;
  resourceId?: string | null;
  resourceVersion?: string | null;
  leaseSeconds?: number;
  /** Точният брой платими операции за атомарна вълна (OCR). 0 = без вълна. */
  waveOps?: number;
  waveKind?: "contract" | "template" | "analysis";
}

export async function reserveDocumentOperation(
  db: LedgerRpc,
  input: ReserveDocumentInput,
): Promise<LedgerOutcome> {
  const { data, error } = await db.rpc("ai_document_operation_reserve", {
    p_operation_id: input.operationId,
    p_user_id: input.userId,
    p_purpose: input.purpose,
    p_binding: input.binding,
    p_input_digest: input.inputDigest ?? null,
    p_resource_id: input.resourceId ?? null,
    p_resource_version: input.resourceVersion ?? null,
    p_lease_seconds: Math.max(60, Math.min(input.leaseSeconds ?? 300, 1800)),
    p_wave_ops: Math.max(0, Math.floor(input.waveOps ?? 0)),
    p_wave_kind: input.waveKind ?? null,
  });
  return mapError(error) ?? mapOutcome(data);
}

/** ТРАЙНО начало на модела. `false` → НЯМА право на повикване към доставчик. */
export async function markDocumentModelStarted(
  db: LedgerRpc,
  input: { operationId: string; userId: string },
): Promise<{ ok: boolean; outcome: LedgerOutcome }> {
  const { data, error } = await db.rpc("ai_document_operation_mark_model_started", {
    p_operation_id: input.operationId,
    p_user_id: input.userId,
  });
  if (error) return { ok: false, outcome: { kind: "unavailable", reason: "ledger_unavailable" } };
  const status = String(asRecord(data).status ?? "");
  if (status === "ok") return { ok: true, outcome: { kind: "reserved", waveOps: 0, leaseSeconds: 0 } };
  if (status === "already_started") {
    // Друго изпълнение вече е стартирало модела по същия ключ: НЕ се вика пак.
    return { ok: false, outcome: { kind: "in_progress", retryAfterSeconds: 4, modelStarted: true } };
  }
  return { ok: false, outcome: mapOutcome(data) };
}

export interface CommitDocumentInput {
  operationId: string;
  userId: string;
  /** Минималният товар за ТОЧНО повторение. Без излишно съдържание. */
  result: Record<string, unknown>;
  resultTtlSeconds?: number;
  /** Име на функцията за ai_usage; празно = без счетоводен запис. */
  usageFunction?: string | null;
  /** Единствената бизнес промяна, ако има такава. */
  business?: Record<string, unknown> | null;
}

export async function commitDocumentOperation(
  db: LedgerRpc,
  input: CommitDocumentInput,
): Promise<LedgerOutcome> {
  const { data, error } = await db.rpc("ai_document_operation_commit", {
    p_operation_id: input.operationId,
    p_user_id: input.userId,
    p_result: input.result,
    p_result_ttl_seconds: Math.max(60, Math.min(input.resultTtlSeconds ?? 86400, 7 * 86400)),
    p_usage_function: input.usageFunction ?? null,
    p_business: input.business ?? null,
  });
  return mapError(error) ?? mapOutcome(data);
}

/** Отмяна САМО при доказан провал ПРЕДИ модела. */
export async function cancelDocumentOperation(
  db: LedgerRpc,
  input: { operationId: string; userId: string; reason: string },
): Promise<LedgerOutcome> {
  const { data, error } = await db.rpc("ai_document_operation_cancel", {
    p_operation_id: input.operationId,
    p_user_id: input.userId,
    p_reason: input.reason,
  });
  return mapError(error) ?? mapOutcome(data);
}

/** Несигурност СЛЕД модела: без връщане на квота и без втори модел. */
export async function markDocumentReconciliation(
  db: LedgerRpc,
  input: { operationId: string; userId: string; reason: string },
): Promise<LedgerOutcome> {
  const { data, error } = await db.rpc("ai_document_operation_mark_reconciliation", {
    p_operation_id: input.operationId,
    p_user_id: input.userId,
    p_reason: input.reason,
  });
  return mapError(error) ?? mapOutcome(data);
}

/* -------------------------------------------------------------------------
 * Детерминистични HTTP отговори.
 * ------------------------------------------------------------------------- */

const json = (body: unknown, status: number, headers: Record<string, string>) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });

export function operationIdRequiredResponse(headers: Record<string, string>): Response {
  return json({
    error: "Заявката не може да бъде обработена без идентификатор на операцията.",
    code: OPERATION_ID_REQUIRED,
    retryable: false,
  }, 400, headers);
}

export function operationConflictResponse(headers: Record<string, string>, reason: string): Response {
  return json({
    error: "Същият идентификатор вече е използван за друга заявка. Започнете нова.",
    code: OPERATION_BINDING_CONFLICT,
    reason,
    retryable: false,
    new_operation_required: true,
  }, 409, headers);
}

export function operationInProgressJson(
  headers: Record<string, string>,
  retryAfterSeconds: number,
): Response {
  const wait = Math.max(1, Math.floor(retryAfterSeconds));
  return new Response(JSON.stringify({
    error: "Същата заявка вече се обработва. Изчакайте няколко секунди.",
    code: OPERATION_IN_PROGRESS,
    retryable: true,
    retry_after_seconds: wait,
    charge_state: "reserved",
  }), {
    status: 409,
    headers: { ...headers, "Content-Type": "application/json", "Retry-After": String(wait) },
  });
}

export function operationReconciliationResponse(
  headers: Record<string, string>,
  reason: string,
): Response {
  return json({
    error: BILLING_RECONCILIATION_MESSAGE_BG,
    code: BILLING_RECONCILIATION_REQUIRED,
    reason,
    charge_state: "unresolved",
  }, 503, headers);
}

export function operationExpiredResponse(headers: Record<string, string>): Response {
  return json({
    error: "Запазеният резултат вече не е наличен. Направете нова заявка.",
    code: RESPONSE_EXPIRED,
    new_request_required: true,
    retryable: false,
  }, 410, headers);
}

export function ledgerUnavailableResponse(headers: Record<string, string>): Response {
  return json({
    error: "Обработката е временно недостъпна. Опитайте отново след малко.",
    code: "operation_ledger_unavailable",
    retryable: true,
  }, 503, headers);
}

/**
 * ЕДИН детерминистичен превод на изхода от леджъра в HTTP отговор за всички
 * състояния, при които НЯМА право на изпълнение. `null` = продължавай.
 */
export function ledgerBlockResponse(
  outcome: LedgerOutcome,
  headers: Record<string, string>,
): Response | null {
  switch (outcome.kind) {
    case "in_progress":
      return operationInProgressJson(headers, outcome.retryAfterSeconds);
    case "conflict":
      return operationConflictResponse(headers, outcome.reason);
    case "reconciliation":
      return operationReconciliationResponse(headers, outcome.reason);
    case "response_expired":
      return operationExpiredResponse(headers);
    case "unavailable":
      return ledgerUnavailableResponse(headers);
    default:
      return null;
  }
}
