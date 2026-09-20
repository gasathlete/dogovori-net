/**
 * КРАТКОТРАЕН, ПОДПИСАН, ЕДНОКРАТЕН ПРОПУСК ЗА РЕВИЗИЯ (СЪРВЪРНО ИЗДАВАНЕ).
 *
 * Манифестът за качество доказва ПРОИЗХОД, но НИКОГА не е оторизация. Тук се
 * издава отделен пропуск, обвързан с:
 * - субект/собственик (кой има право),
 * - отпечатък на съдържанието (точно този документ),
 * - предназначение (audience) и операция,
 * - момент на издаване и кратък срок,
 * - nonce, който се консумира атомарно и ТРАЙНО (еднократност).
 *
 * Пропускът се издава САМО от сървъра след успешно оторизирано генериране.
 * Браузърът никога не подписва и не създава пропуск.
 * Липсващ сървърен ключ е НЕДОСТЪПНОСТ, не разрешение.
 */

export const REVIEW_GRANT_AUDIENCE = "review-document";
export const REVIEW_GRANT_TTL_S = 600;
export const REVIEW_GRANT_VERSION = 1;
/** Домейнова сепарация на отпечатъка на съдържанието. */
export const REVIEW_CONTENT_DIGEST_VERSION = "review-content-1";

export interface ReviewGrantPayload {
  readonly v: 1;
  readonly aud: string;
  readonly sub: string | null;
  readonly owner: string | null;
  readonly content_digest: string;
  readonly operation: string;
  readonly nonce: string;
  readonly issued_at: number;
  readonly expires_at: number;
}

export interface SignedReviewGrant {
  readonly payload: ReviewGrantPayload;
  readonly signature: string;
}

export type GrantVerdict =
  | { readonly ok: true; readonly payload: ReviewGrantPayload }
  | { readonly ok: false; readonly reason: GrantFailure };

export type GrantFailure =
  | "grant_unavailable"
  | "malformed"
  | "bad_signature"
  | "expired"
  | "wrong_audience"
  | "wrong_version"
  | "content_mismatch"
  | "subject_mismatch"
  | "owner_mismatch"
  | "operation_mismatch"
  | "replayed";

function encoder(): TextEncoder {
  return new TextEncoder();
}

function toHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function reviewGrantSecret(
  env: { get(name: string): string | undefined } = Deno.env,
): string | null {
  const v = env.get("REVIEW_GRANT_SECRET");
  return typeof v === "string" && v.trim().length >= 16 ? v : null;
}

/**
 * Нормализация за отпечатък на съдържанието: САМО CRLF и незначимо празно
 * място. Смяна на главна/малка буква е ПРОМЯНА и обезсилва пропуска.
 */
export function normalizeReviewContent(text: string): string {
  return (text ?? "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t\u00A0]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** Каноничен отпечатък на ТОЧНОТО съдържание, което ще се ревизира. */
export async function reviewContentDigest(text: string): Promise<string> {
  const canon = [REVIEW_CONTENT_DIGEST_VERSION, normalizeReviewContent(text)].join("|");
  return toHex(await crypto.subtle.digest("SHA-256", encoder().encode(canon)));
}

/** Канонична серилизация: подписва се точно този ред на полетата. */
export function canonicalGrant(p: ReviewGrantPayload): string {
  return JSON.stringify([
    p.v,
    p.aud,
    p.sub ?? "",
    p.owner ?? "",
    p.content_digest,
    p.operation,
    p.nonce,
    p.issued_at,
    p.expires_at,
  ]);
}

async function sign(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    encoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  return toHex(await crypto.subtle.sign("HMAC", key, encoder().encode(message)));
}

export async function issueReviewGrant(input: {
  secret: string;
  subject: string | null;
  owner: string | null;
  contentDigest: string;
  operation: string;
  now?: number;
  ttlSeconds?: number;
}): Promise<SignedReviewGrant> {
  const now = input.now ?? Date.now();
  const ttl = Math.max(60, Math.min(input.ttlSeconds ?? REVIEW_GRANT_TTL_S, 3600));
  const payload: ReviewGrantPayload = {
    v: 1,
    aud: REVIEW_GRANT_AUDIENCE,
    sub: input.subject,
    owner: input.owner,
    content_digest: input.contentDigest,
    operation: input.operation,
    nonce: crypto.randomUUID(),
    issued_at: Math.floor(now / 1000),
    expires_at: Math.floor(now / 1000) + ttl,
  };
  return { payload, signature: await sign(input.secret, canonicalGrant(payload)) };
}

/**
 * ДОСТИГАЕМО СЪРВЪРНО ИЗДАВАНЕ от поток за генериране.
 *
 * Издава се САМО след успешно оторизирано генериране и САМО за точно това
 * съдържание. Без сървърен ключ НЕ се издава нищо (пропускът е по избор за
 * генератора, но никога не се „симулира" от клиента).
 */
export async function issueGrantForGeneratedContent(input: {
  secret: string | null;
  ownerId: string | null;
  documentText: string;
  operation?: string;
  ttlSeconds?: number;
}): Promise<SignedReviewGrant | null> {
  if (!input.secret) return null;
  if (!input.ownerId) return null;
  const text = typeof input.documentText === "string" ? input.documentText : "";
  if (normalizeReviewContent(text).length === 0) return null;
  return await issueReviewGrant({
    secret: input.secret,
    subject: input.ownerId,
    owner: input.ownerId,
    contentDigest: await reviewContentDigest(text),
    operation: input.operation ?? REVIEW_GRANT_AUDIENCE,
    ttlSeconds: input.ttlSeconds,
  });
}

function looksLikeGrant(value: unknown): value is SignedReviewGrant {
  const g = value as SignedReviewGrant | null;
  const p = g?.payload as ReviewGrantPayload | undefined;
  return !!g && typeof g.signature === "string" && !!p &&
    typeof p.v === "number" &&
    typeof p.aud === "string" && typeof p.content_digest === "string" &&
    typeof p.operation === "string" && typeof p.nonce === "string" &&
    typeof p.issued_at === "number" && typeof p.expires_at === "number";
}

/**
 * Проверява ВЕРСИЯ, подпис, срок, предназначение, съдържание, субект И
 * собственик (без nonce — консумацията е отделна и трайна).
 */
export async function verifyReviewGrant(input: {
  grant: unknown;
  secret: string | null;
  contentDigest: string;
  subject: string | null;
  /** Очакван собственик на документа, ако извикването го знае. */
  expectedOwner?: string | null;
  /** Очаквана операция, ако извикването е обвързано с конкретна операция. */
  expectedOperation?: string | null;
  now?: number;
}): Promise<GrantVerdict> {
  if (!input.secret) return { ok: false, reason: "grant_unavailable" };
  if (!looksLikeGrant(input.grant)) return { ok: false, reason: "malformed" };
  const p = input.grant.payload;
  if (p.v !== REVIEW_GRANT_VERSION) return { ok: false, reason: "wrong_version" };
  const expected = await sign(input.secret, canonicalGrant(p));
  if (expected !== input.grant.signature) return { ok: false, reason: "bad_signature" };
  if (p.aud !== REVIEW_GRANT_AUDIENCE) return { ok: false, reason: "wrong_audience" };
  const nowS = Math.floor((input.now ?? Date.now()) / 1000);
  if (nowS >= p.expires_at) return { ok: false, reason: "expired" };
  if (p.content_digest !== input.contentDigest) return { ok: false, reason: "content_mismatch" };
  // Пропуск, издаден за конкретен субект, не важи за друг потребител.
  if (p.sub && input.subject && p.sub !== input.subject) {
    return { ok: false, reason: "subject_mismatch" };
  }
  if (p.sub && !input.subject) return { ok: false, reason: "subject_mismatch" };
  // Собственикът е обвързан в подписа и СЕ ПРОВЕРЯВА.
  if (p.owner) {
    const actor = input.expectedOwner ?? input.subject;
    if (!actor || p.owner !== actor) return { ok: false, reason: "owner_mismatch" };
  }
  if (input.expectedOperation && p.operation !== input.expectedOperation) {
    return { ok: false, reason: "operation_mismatch" };
  }
  return { ok: true, payload: p };
}

export function reviewGrantNonceKey(nonce: string): string {
  return `review-grant:${nonce}`;
}

export interface NonceDb {
  rpc(
    name: string,
    args: Record<string, unknown>,
    // deno-lint-ignore no-explicit-any
  ): PromiseLike<{ data: any; error: { message: string } | null }>;
}

function rowOf(data: unknown): Record<string, unknown> {
  return data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
}

/**
 * ТРАЕН ЛЕДЖЪР НА РЕВИЗИЯТА (не „изгарящ" nonce).
 *
 * Резервацията се прави НЕПОСРЕДСТВЕНО ПРЕДИ платеното повикване към модела.
 * Всяка безплатна проверка (валидация, оторизация, потвърждение за чувствителни
 * данни, ограничител, заземяване) минава ПРЕДИ това, за да не изгаря
 * единственият пропуск.
 */
export type ReviewReserveOutcome =
  /** Резервирано: сега и само сега може да се извика моделът. */
  | { readonly kind: "reserved" }
  /** Вече направена ревизия: връща се ТОЧНИЯТ резултат, без модел. */
  | { readonly kind: "replay"; readonly response: Record<string, unknown> }
  /** Активна заявка: никакво второ повикване към модел. */
  | { readonly kind: "in_progress"; readonly retryAfterSeconds: number }
  | { readonly kind: "expired" }
  | { readonly kind: "conflict" }
  | { readonly kind: "reconciliation"; readonly reason: string }
  | { readonly kind: "unavailable"; readonly reason: string };

/**
 * САМО-ЧЕТЯЩО състояние на ревизия по ЦЯЛОТО подписано обвързване. Не резервира,
 * не отменя и НЕ изгаря пропуска. Ползва се ПРЕДИ безплатните, но чупливи
 * стъпки (ограничител, класификация, редакция, заземяване, доставчик), за да не
 * бъде блокиран нормален повторен опит по вече завършена ревизия.
 */
export type ReviewLookupOutcome =
  | { readonly kind: "absent"; readonly reason?: string }
  | { readonly kind: "committed"; readonly response: Record<string, unknown> }
  | { readonly kind: "in_progress"; readonly retryAfterSeconds: number }
  | { readonly kind: "expired" }
  | { readonly kind: "conflict" }
  | { readonly kind: "reconciliation"; readonly reason: string }
  | { readonly kind: "unavailable"; readonly reason: string };

export async function lookupReviewOperation(
  db: NonceDb,
  payload: ReviewGrantPayload,
): Promise<ReviewLookupOutcome> {
  let data: unknown = null;
  let error: { message: string } | null = null;
  try {
    const out = await db.rpc("review_operation_lookup", {
      p_nonce: payload.nonce,
      p_aud: payload.aud,
      p_subject: payload.sub,
      p_owner_id: payload.owner,
      p_content_digest: payload.content_digest,
      p_operation: payload.operation,
    });
    data = out.data;
    error = out.error;
  } catch {
    return { kind: "unavailable", reason: "lookup_threw" };
  }
  if (error) return { kind: "unavailable", reason: "lookup_uncertain" };
  const r = rowOf(data);
  const status = String(r.status ?? "");
  if (status === "committed") {
    const stored = rowOf(r.response);
    if (Object.keys(stored).length === 0) return { kind: "expired" };
    return { kind: "committed", response: stored };
  }
  if (status === "in_progress") {
    return {
      kind: "in_progress",
      retryAfterSeconds: Math.max(1, Number(r.retry_after_seconds ?? 5)),
    };
  }
  if (status === "response_expired") return { kind: "expired" };
  if (status === "conflict") return { kind: "conflict" };
  if (status === "reconciliation") {
    return { kind: "reconciliation", reason: String(r.reason ?? "reconciliation_required") };
  }
  if (status === "absent") {
    return { kind: "absent", reason: r.reason ? String(r.reason) : undefined };
  }
  return { kind: "unavailable", reason: `unexpected_lookup_status:${status || "empty"}` };
}

export async function reserveReviewOperation(
  db: NonceDb,
  payload: ReviewGrantPayload,
  leaseSeconds = 180,
): Promise<ReviewReserveOutcome> {
  let data: unknown = null;
  let error: { message: string } | null = null;
  try {
    const out = await db.rpc("review_operation_reserve", {
      p_nonce: payload.nonce,
      p_aud: payload.aud,
      p_subject: payload.sub,
      p_owner_id: payload.owner,
      p_content_digest: payload.content_digest,
      p_operation: payload.operation,
      p_expires_at: new Date(payload.expires_at * 1000).toISOString(),
      p_lease_seconds: leaseSeconds,
    });
    data = out.data;
    error = out.error;
  } catch {
    return { kind: "unavailable", reason: "reserve_threw" };
  }
  if (error) return { kind: "unavailable", reason: "reserve_uncertain" };
  const r = rowOf(data);
  if (r.ok === true) {
    if (r.replay === true) {
      const stored = rowOf(r.response);
      if (Object.keys(stored).length === 0) {
        return { kind: "unavailable", reason: "response_missing" };
      }
      return { kind: "replay", response: stored };
    }
    return { kind: "reserved" };
  }
  if (r.reason === "in_progress") {
    return {
      kind: "in_progress",
      retryAfterSeconds: Math.max(1, Number(r.retry_after_seconds ?? 5)),
    };
  }
  if (r.reason === "expired") return { kind: "expired" };
  if (r.reason === "binding_conflict") return { kind: "conflict" };
  if (r.reason === "reconciliation_required" || r.reason === "cancellation_unproven") {
    return { kind: "reconciliation", reason: String(r.reason) };
  }
  return {
    kind: "unavailable",
    reason: typeof r.reason === "string" ? r.reason : "reserve_failed",
  };
}

export type ReviewCommitOutcome =
  | {
    readonly kind: "committed";
    readonly replay: boolean;
    readonly response: Record<string, unknown>;
  }
  /** Неизвестен запис: НЕ се отменя нищо, изисква изравняване. */
  | { readonly kind: "uncertain"; readonly reason: string };

export async function commitReviewOperation(
  db: NonceDb,
  payload: ReviewGrantPayload,
  response: Record<string, unknown>,
): Promise<ReviewCommitOutcome> {
  let data: unknown = null;
  let error: { message: string } | null = null;
  try {
    const out = await db.rpc("review_operation_commit", {
      p_nonce: payload.nonce,
      p_content_digest: payload.content_digest,
      p_response: response,
    });
    data = out.data;
    error = out.error;
  } catch {
    return { kind: "uncertain", reason: "commit_threw" };
  }
  if (error) return { kind: "uncertain", reason: "commit_uncertain" };
  const r = rowOf(data);
  if (r.ok === true) {
    const stored = rowOf(r.response);
    if (Object.keys(stored).length === 0) {
      return { kind: "uncertain", reason: "response_missing" };
    }
    return { kind: "committed", replay: r.replay === true, response: stored };
  }
  return {
    kind: "uncertain",
    reason: typeof r.reason === "string" ? r.reason : "commit_failed",
  };
}

export type ReviewCancelOutcome =
  /** ДОКАЗАНА отмяна: СЪЩИЯТ пропуск може да опита отново. */
  | { readonly kind: "cancelled" }
  | { readonly kind: "already_committed" }
  | { readonly kind: "uncertain"; readonly reason: string };

export async function cancelReviewOperation(
  db: NonceDb,
  payload: ReviewGrantPayload,
  reason: string,
): Promise<ReviewCancelOutcome> {
  let data: unknown = null;
  let error: { message: string } | null = null;
  try {
    const out = await db.rpc("review_operation_cancel", {
      p_nonce: payload.nonce,
      p_content_digest: payload.content_digest,
      p_reason: reason,
      p_reconciliation_required: false,
    });
    data = out.data;
    error = out.error;
  } catch {
    return { kind: "uncertain", reason: "cancel_threw" };
  }
  if (error) return { kind: "uncertain", reason: "cancel_uncertain" };
  const r = rowOf(data);
  if (r.ok === true) return { kind: "cancelled" };
  if (r.reason === "already_committed") return { kind: "already_committed" };
  return {
    kind: "uncertain",
    reason: typeof r.reason === "string" ? r.reason : "cancel_failed",
  };
}

// =============================================================================
// СОБСТВЕНИ (owned) операции по ревизия — durable леджър, когато оторизацията
// идва от ПРОВЕРЕН СОБСТВЕНИК на запазен документ (grantPayload === null), а
// не от подписан еднократен пропуск. Обвързването е с owner/document/version/
// hash вместо nonce-грант (виж 0036). Стилът е нарочно огледален на
// `lookupReviewOperation`/`reserveReviewOperation`/`commitReviewOperation`/
// `cancelReviewOperation` по-горе — типовете на изхода се преизползват.
// =============================================================================

export interface OwnedReviewBinding {
  readonly operationId: string;
  readonly ownerId: string;
  readonly documentId: string;
  readonly documentVersion: string | null;
  readonly documentHash: string;
  readonly contentDigest: string;
  readonly purpose: string;
}

export async function lookupOwnedReviewOperation(
  db: NonceDb,
  binding: OwnedReviewBinding,
): Promise<ReviewLookupOutcome> {
  let data: unknown = null;
  let error: { message: string } | null = null;
  try {
    const out = await db.rpc("owned_review_operation_lookup", {
      p_operation_id: binding.operationId,
      p_owner_id: binding.ownerId,
      p_document_id: binding.documentId,
      p_document_version: binding.documentVersion,
      p_document_hash: binding.documentHash,
      p_content_digest: binding.contentDigest,
      p_purpose: binding.purpose,
    });
    data = out.data;
    error = out.error;
  } catch {
    return { kind: "unavailable", reason: "lookup_threw" };
  }
  if (error) return { kind: "unavailable", reason: "lookup_uncertain" };
  const r = rowOf(data);
  const status = String(r.status ?? "");
  if (status === "committed") {
    const stored = rowOf(r.response);
    if (Object.keys(stored).length === 0) return { kind: "expired" };
    return { kind: "committed", response: stored };
  }
  if (status === "in_progress") {
    return {
      kind: "in_progress",
      retryAfterSeconds: Math.max(1, Number(r.retry_after_seconds ?? 5)),
    };
  }
  if (status === "response_expired") return { kind: "expired" };
  if (status === "conflict") return { kind: "conflict" };
  if (status === "reconciliation") {
    return { kind: "reconciliation", reason: String(r.reason ?? "reconciliation_required") };
  }
  if (status === "absent") {
    return { kind: "absent", reason: r.reason ? String(r.reason) : undefined };
  }
  return { kind: "unavailable", reason: `unexpected_lookup_status:${status || "empty"}` };
}

export async function reserveOwnedReviewOperation(
  db: NonceDb,
  binding: OwnedReviewBinding,
  leaseSeconds = 180,
): Promise<ReviewReserveOutcome> {
  let data: unknown = null;
  let error: { message: string } | null = null;
  try {
    const out = await db.rpc("owned_review_operation_reserve", {
      p_operation_id: binding.operationId,
      p_owner_id: binding.ownerId,
      p_document_id: binding.documentId,
      p_document_version: binding.documentVersion,
      p_document_hash: binding.documentHash,
      p_content_digest: binding.contentDigest,
      p_purpose: binding.purpose,
      p_lease_seconds: leaseSeconds,
    });
    data = out.data;
    error = out.error;
  } catch {
    return { kind: "unavailable", reason: "reserve_threw" };
  }
  if (error) return { kind: "unavailable", reason: "reserve_uncertain" };
  const r = rowOf(data);
  if (r.ok === true) {
    if (r.replay === true) {
      const stored = rowOf(r.response);
      if (Object.keys(stored).length === 0) {
        return { kind: "unavailable", reason: "response_missing" };
      }
      return { kind: "replay", response: stored };
    }
    return { kind: "reserved" };
  }
  if (r.reason === "in_progress") {
    return {
      kind: "in_progress",
      retryAfterSeconds: Math.max(1, Number(r.retry_after_seconds ?? 5)),
    };
  }
  if (r.reason === "response_expired") return { kind: "expired" };
  if (r.reason === "binding_conflict") return { kind: "conflict" };
  if (r.reason === "reconciliation_required" || r.reason === "cancellation_unproven") {
    return { kind: "reconciliation", reason: String(r.reason) };
  }
  return {
    kind: "unavailable",
    reason: typeof r.reason === "string" ? r.reason : "reserve_failed",
  };
}

export async function commitOwnedReviewOperation(
  db: NonceDb,
  binding: OwnedReviewBinding,
  response: Record<string, unknown>,
): Promise<ReviewCommitOutcome> {
  let data: unknown = null;
  let error: { message: string } | null = null;
  try {
    const out = await db.rpc("owned_review_operation_commit", {
      p_operation_id: binding.operationId,
      p_owner_id: binding.ownerId,
      p_response: response,
    });
    data = out.data;
    error = out.error;
  } catch {
    return { kind: "uncertain", reason: "commit_threw" };
  }
  if (error) return { kind: "uncertain", reason: "commit_uncertain" };
  const r = rowOf(data);
  if (r.ok === true) {
    const stored = rowOf(r.response);
    if (Object.keys(stored).length === 0) {
      return { kind: "uncertain", reason: "response_missing" };
    }
    return { kind: "committed", replay: r.replay === true, response: stored };
  }
  return {
    kind: "uncertain",
    reason: typeof r.reason === "string" ? r.reason : "commit_failed",
  };
}

export async function cancelOwnedReviewOperation(
  db: NonceDb,
  binding: OwnedReviewBinding,
  reason: string,
): Promise<ReviewCancelOutcome> {
  let data: unknown = null;
  let error: { message: string } | null = null;
  try {
    const out = await db.rpc("owned_review_operation_cancel", {
      p_operation_id: binding.operationId,
      p_owner_id: binding.ownerId,
      p_reason: reason,
    });
    data = out.data;
    error = out.error;
  } catch {
    return { kind: "uncertain", reason: "cancel_threw" };
  }
  if (error) return { kind: "uncertain", reason: "cancel_uncertain" };
  const r = rowOf(data);
  if (r.ok === true) return { kind: "cancelled" };
  if (r.reason === "already_committed") return { kind: "already_committed" };
  return {
    kind: "uncertain",
    reason: typeof r.reason === "string" ? r.reason : "cancel_failed",
  };
}
