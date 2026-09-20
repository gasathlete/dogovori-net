/**
 * КРАТКОТРАЕН, ПОДПИСАН, ЕДНОКРАТЕН ПРОПУСК ЗА РЕВИЗИЯ.
 *
 * Манифестът за качество е безсрочен и затова НЕ е пропуск за платени
 * повиквания. Тук се издава отделен пропуск, обвързан с:
 * - субект/собственик (кой има право),
 * - отпечатък на съдържанието (точно този документ),
 * - предназначение (audience) и операция,
 * - момент на издаване и кратък срок,
 * - nonce, който се консумира атомарно (еднократност).
 *
 * Липсващ сървърен ключ е НЕДОСТЪПНОСТ, не разрешение.
 */

export const REVIEW_GRANT_AUDIENCE = "review-document";
export const REVIEW_GRANT_TTL_S = 600;

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
  | "content_mismatch"
  | "subject_mismatch"
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

function looksLikeGrant(value: unknown): value is SignedReviewGrant {
  const g = value as SignedReviewGrant | null;
  const p = g?.payload as ReviewGrantPayload | undefined;
  return !!g && typeof g.signature === "string" && !!p && p.v === 1 &&
    typeof p.aud === "string" && typeof p.content_digest === "string" &&
    typeof p.operation === "string" && typeof p.nonce === "string" &&
    typeof p.issued_at === "number" && typeof p.expires_at === "number";
}

/**
 * Проверява подпис, срок, предназначение, съдържание, субект И собственик
 * (без nonce).
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
  // Собственикът е обвързан в подписа и СЕ ПРОВЕРЯВА: пропуск, издаден за
  // документ на един собственик, не важи за друг.
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

/**
 * Атомарна консумация: вторият опит със същия nonce е повторение. Проверката е
 * FAIL-CLOSED — при инфраструктурен проблем пропускът НЕ се приема.
 */
export async function consumeReviewGrant(
  rateLimit: (
    key: string,
    max: number,
    windowSeconds: number,
  ) => Promise<{ ok: boolean; unavailable?: boolean }>,
  payload: ReviewGrantPayload,
): Promise<{ ok: boolean; reason?: GrantFailure }> {
  const res = await rateLimit(reviewGrantNonceKey(payload.nonce), 1, 3600);
  if (res.ok) return { ok: true };
  return { ok: false, reason: res.unavailable ? "grant_unavailable" : "replayed" };
}

