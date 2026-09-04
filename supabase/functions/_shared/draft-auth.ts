// Правила за достъп до анонимните чернови (activation continuity).
//
// Чисти функции без I/O, за да могат инвариантите да се тестват изолирано:
//
//  1. Непотърсена (unclaimed) чернова се пише САМО с валиден claim токен.
//  2. Присвоена (claimed) чернова се пише САМО от собственика ѝ, доказан с JWT.
//     Токенът вече не оторизира нищо — дори да е верният.
//  3. Невалиден / изтекъл / чужд достъп връща типизирана причина; никога не се
//     създава тихо дубликат вместо отказ.
//  4. След прехвърляне на готовия документ в `saved_documents` в черновата
//     остават само метаданни за идемпотентност и статус — без съдържание.
import { timingSafeEqual } from "./draft-token.ts";

/** Типизирани причини за отказ — общи за draft-sync и draft-claim. */
export type DraftErrorReason =
  | "invalid_request"
  | "payload_too_large"
  | "rate_limited"
  | "expired"
  | "invalid_token"
  | "unauthorized"
  | "different_owner"
  | "already_claimed"
  | "network";

export const REASON_STATUS: Record<DraftErrorReason, number> = {
  invalid_request: 400,
  payload_too_large: 413,
  rate_limited: 429,
  expired: 410,
  invalid_token: 403,
  unauthorized: 401,
  different_owner: 403,
  already_claimed: 409,
  network: 500,
};

/** Минималните полета от реда, нужни за решението. */
export interface DraftAuthRow {
  token_hash: string;
  claimed_by: string | null;
  expires_at: string;
  saved_doc_id?: string | null;
}

export interface AuthInput {
  /** Редът от базата или null, ако липсва. */
  row: DraftAuthRow | null;
  /** SHA-256 на подадения claim токен (null, ако липсва/невалиден формат). */
  tokenHash: string | null;
  /** Потребителят от JWT-то в заявката (null за анонимен). */
  userId: string | null;
  now?: number;
}

/**
 * Създаване е разрешено САМО когато `draft_id` изобщо липсва в заявката.
 * Ако е подаден (дори невалиден/изтекъл), заявката е обновяване и трябва да
 * приключи с типизиран отказ — никога с тихо създаден дубликат.
 */
export function isCreateRequest(draftId: unknown): boolean {
  return draftId === undefined || draftId === null || draftId === "";
}

export type SyncDecision =
  | { ok: true; mode: "anonymous" | "owner"; transferred: boolean }
  | { ok: false; reason: DraftErrorReason };

function isExpired(row: DraftAuthRow, now: number): boolean {
  const t = Date.parse(row.expires_at);
  return !Number.isFinite(t) || t <= now;
}

/**
 * Може ли тази заявка да ОБНОВИ съществуваща чернова?
 *
 * - липсващ/изтекъл ред → `expired` (клиентът трябва да започне нова чернова
 *   през изричния create път, не сървърът тихо вместо него);
 * - непотърсена → само верният токен;
 * - присвоена → само JWT на собственика; токенът се игнорира напълно.
 */
export function decideSyncWrite(input: AuthInput): SyncDecision {
  const now = input.now ?? Date.now();
  const { row } = input;
  if (!row) return { ok: false, reason: "expired" };
  if (isExpired(row, now)) return { ok: false, reason: "expired" };

  if (row.claimed_by) {
    if (!input.userId) return { ok: false, reason: "unauthorized" };
    if (input.userId !== row.claimed_by) return { ok: false, reason: "different_owner" };
    return { ok: true, mode: "owner", transferred: !!row.saved_doc_id };
  }

  if (!input.tokenHash || !timingSafeEqual(row.token_hash, input.tokenHash)) {
    return { ok: false, reason: "invalid_token" };
  }
  return { ok: true, mode: "anonymous", transferred: false };
}

export type ClaimDecision =
  | { ok: true; idempotent: boolean }
  | { ok: false; reason: DraftErrorReason };

/**
 * Може ли влезлият потребител да ПРИСВОИ черновата?
 *
 * - без JWT → `unauthorized`;
 * - липсваща/изтекла → `expired`;
 * - вече присвоена от друг → `already_claimed` (токенът не се проверява — не
 *   разкриваме дали е верен);
 * - вече присвоена от същия → идемпотентно OK (без токен: след claim токенът е
 *   ротиран и клиентът вече не го пази);
 * - непотърсена → само с верния токен.
 */
export function decideClaim(input: AuthInput): ClaimDecision {
  const now = input.now ?? Date.now();
  if (!input.userId) return { ok: false, reason: "unauthorized" };
  const { row } = input;
  if (!row) return { ok: false, reason: "expired" };
  if (isExpired(row, now)) return { ok: false, reason: "expired" };

  if (row.claimed_by) {
    if (row.claimed_by !== input.userId) return { ok: false, reason: "already_claimed" };
    return { ok: true, idempotent: true };
  }

  if (!input.tokenHash || !timingSafeEqual(row.token_hash, input.tokenHash)) {
    return { ok: false, reason: "invalid_token" };
  }
  return { ok: true, idempotent: false };
}

/* ------------------------- Минимизация на данните ------------------------- */

/** Има ли в съдържанието нещо за възстановяване (а не празен обект)? */
export function hasRestorableContent(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") return false;
  const p = payload as Record<string, unknown>;
  if (p.result) return true;
  if (p.signature) return true;
  if (p.answers && typeof p.answers === "object" && Object.keys(p.answers as object).length > 0) return true;
  if (p.meta && typeof p.meta === "object" && Object.keys(p.meta as object).length > 0) return true;
  return false;
}

/**
 * Редът след успешно прехвърляне в `saved_documents`: съдържанието се изтрива,
 * остават само статусните полета, нужни за идемпотентен повторен claim.
 */
export function rowAfterTransfer(savedDocId: string, rotatedTokenHash: string) {
  return {
    payload: {} as Record<string, never>,
    has_result: true,
    saved_doc_id: savedDocId,
    token_hash: rotatedTokenHash,
  };
}

/**
 * Полетата, които собственикът може да обновява по вече прехвърлена чернова:
 * само позиция и маршрут — съдържанието не се връща обратно в таблицата.
 */
export function ownerUpdateAfterTransfer(row: { route: string; step_idx: number; expires_at: string }) {
  return { route: row.route, step_idx: row.step_idx, expires_at: row.expires_at };
}

/* ------------------------------ Безопасен лог ----------------------------- */

const LOG_ALLOWLIST = new Set([
  "fn",
  "reason",
  "status",
  "mode",
  "flow",
  "step_idx",
  "has_result",
  "claimed",
  "transferred",
  "idempotent",
  "correlation_id",
  "ms",
]);

/**
 * Контекст за лог: пропуска САМО изброените технически полета. Токени,
 * съдържание, имейли, имена и всичко останало се изпускат по конструкция —
 * дори да бъдат подадени по грешка.
 */
export function safeLogContext(input: Record<string, unknown>): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};
  for (const [k, v] of Object.entries(input)) {
    if (!LOG_ALLOWLIST.has(k)) continue;
    if (typeof v === "string") out[k] = v.slice(0, 64);
    else if (typeof v === "number" || typeof v === "boolean") out[k] = v;
  }
  return out;
}

export function logDraft(fn: string, ctx: Record<string, unknown>): void {
  try {
    console.log(JSON.stringify(safeLogContext({ fn, ...ctx })));
  } catch {
    /* логът никога не спира заявката */
  }
}
