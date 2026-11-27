// Токени за анонимни чернови (activation continuity).
//
// В базата се пази САМО SHA-256 хеш на токена. Сравнението е constant-time, за
// да не изтича информация през времето за отговор. Токенът е еднократен за
// claim: присвояването става с атомарен `update … where claimed_by is null`.

/** Непотърсена (анонимна) чернова живее 24 часа. */
export const ANON_DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
/** Присвоена, но недовършена чернова остава възстановима за собственика 30 дни. */
export const CLAIMED_DRAFT_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** 32 байта ентропия, base64url — безопасно за URL и localStorage указателя. */
export function generateClaimToken(): string {
  const buf = new Uint8Array(32);
  crypto.getRandomValues(buf);
  let bin = "";
  for (const b of buf) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function hashToken(token: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Сравнение с постоянно време (дължините се изравняват предварително). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isValidClaimToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(token);
}

export function isValidDraftId(id: unknown): id is string {
  return (
    typeof id === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)
  );
}

export function isSafeRoute(route: unknown): route is string {
  return typeof route === "string" && route.length <= 400 && /^\/[^/\\]/.test(route);
}

export type DraftFlow = "wizard" | "build";

export function isValidFlow(flow: unknown): flow is DraftFlow {
  return flow === "wizard" || flow === "build";
}

/** Максимален размер на съдържанието (защита от abuse). */
export const MAX_PAYLOAD_BYTES = 512 * 1024;

export function payloadTooLarge(payload: unknown): boolean {
  try {
    return new TextEncoder().encode(JSON.stringify(payload ?? {})).length > MAX_PAYLOAD_BYTES;
  } catch {
    return true;
  }
}

/** @deprecated Използвай `DraftErrorReason` от `draft-auth.ts`. */
export type ClaimReason = "expired" | "already_claimed" | "invalid_token" | "network";
