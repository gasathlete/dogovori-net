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

/**
 * ТРАЙНА атомарна консумация на nonce (отделна таблица, НЕ общ ограничител за
 * натоварване). Вторият опит със същия nonce е повторение. Грешка в базата е
 * НЕДОСТЪПНОСТ — пропускът НЕ се приема и няма повикване към модел.
 */
export async function consumeReviewGrantDurable(
  db: NonceDb,
  payload: ReviewGrantPayload,
): Promise<{ ok: boolean; reason?: GrantFailure }> {
  const { data, error } = await db.rpc("review_grant_nonce_consume", {
    p_nonce: payload.nonce,
    p_aud: payload.aud,
    p_subject: payload.sub,
    p_owner_id: payload.owner,
    p_content_digest: payload.content_digest,
    p_operation: payload.operation,
    p_expires_at: new Date(payload.expires_at * 1000).toISOString(),
  });
  if (error) return { ok: false, reason: "grant_unavailable" };
  const r = data && typeof data === "object" && !Array.isArray(data)
    ? data as Record<string, unknown>
    : {};
  if (r.ok === true) return { ok: true };
  if (r.reason === "expired") return { ok: false, reason: "expired" };
  if (r.reason === "replayed") return { ok: false, reason: "replayed" };
  return { ok: false, reason: "grant_unavailable" };
}
