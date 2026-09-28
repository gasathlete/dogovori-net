/**
 * Кодове за подпис (OTP): версиониран HMAC със сървърен ключ, съвместимост със
 * стари (v1, SHA-256) кодове до изтичането им, сравнение с постоянно време,
 * атомарно изразходване на опити и ограничено четене на тялото на заявката.
 */

export const OTP_MAX_ATTEMPTS = 5;
export const OTP_DAILY_FAILURE_CAP = 15;
export const OTP_RESEND_COOLDOWN_MS = 60_000;
export const OTP_MAX_SENDS_PER_HOUR = 5;
/** Горна граница за цялото тяло (подпис ≤1,5 MB + QES ≤15 MB в base64 ≈ 20 MB). */
export const SIGNER_BODY_MAX_BYTES = 22 * 1024 * 1024;
/** Действия без файлове не се нуждаят от повече от няколко KB. */
export const SIGNER_SMALL_BODY_MAX_BYTES = 16 * 1024;

export class OtpConfigError extends Error {
  constructor() { super("otp_unavailable"); this.name = "OtpConfigError"; }
}
export class BodyTooLargeError extends Error {
  constructor() { super("payload_too_large"); this.name = "BodyTooLargeError"; }
}

const enc = new TextEncoder();
const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b)).map((x) => x.toString(16).padStart(2, "0")).join("");

export function otpSecret(env: { get(n: string): string | undefined } = Deno.env): string {
  const s = env.get("SIGNING_OTP_HMAC_SECRET");
  if (typeof s !== "string" || s.length < 32) throw new OtpConfigError();
  return s;
}

export async function hashOtpV2(code: string, signerId: string, secret: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return "v2:" + hex(await crypto.subtle.sign("HMAC", key, enc.encode(`signing-otp|v2|${signerId}|${code}`)));
}

async function hashOtpV1(code: string, signerId: string): Promise<string> {
  return hex(await crypto.subtle.digest("SHA-256", enc.encode(code + "|" + signerId)));
}

export function timingSafeEqual(a: string, b: string): boolean {
  const x = enc.encode(a), y = enc.encode(b);
  let diff = x.length ^ y.length;
  const n = Math.max(x.length, y.length);
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

/** v2 изисква ключа (fail closed); v1 се приема само за вече издадени, неизтекли кодове. */
export async function verifyOtp(code: unknown, signerId: string, stored: string, secret: string | null): Promise<boolean> {
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return false;
  if (stored.startsWith("v2:")) {
    if (!secret) throw new OtpConfigError();
    return timingSafeEqual(await hashOtpV2(code, signerId, secret), stored);
  }
  if (/^[0-9a-f]{64}$/.test(stored)) return timingSafeEqual(await hashOtpV1(code, signerId), stored);
  return false;
}

/** Чете тялото с таван ПРЕДИ JSON/base64 декодиране. */
export async function readBoundedJson(req: Request, maxBytes: number): Promise<unknown> {
  const declared = Number(req.headers.get("content-length") ?? "NaN");
  if (Number.isFinite(declared) && declared > maxBytes) throw new BodyTooLargeError();
  if (!req.body) return {};
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await reader.cancel().catch(() => {}); throw new BodyTooLargeError(); }
    chunks.push(value);
  }
  const buf = new Uint8Array(total);
  let off = 0;
  for (const c of chunks) { buf.set(c, off); off += c.byteLength; }
  try { return JSON.parse(new TextDecoder().decode(buf)); } catch { return {}; }
}

/** Минимален интерфейс към реда на подписващия, за да е тестваем без база. */
export interface AttemptStore {
  /** Атомарно: attempts := expected+1 само ако attempts == expected и hash == expectedHash. Връща true при успех. */
  casAttempts(expected: number, expectedHash: string): Promise<boolean>;
  read(): Promise<{ otp_attempts: number | null; otp_code_hash: string | null; otp_expires_at: string | null }>;
}

export type AttemptResult = "ok" | "otp_required" | "otp_locked" | "otp_invalid";

/**
 * Изразходва един опит АТОМАРНО преди сравнението. Паралелни/повторени опити
 * не могат да надхвърлят OTP_MAX_ATTEMPTS за един код.
 */
export async function consumeAttemptAndVerify(
  store: AttemptStore, signerId: string, code: unknown, secret: string | null, now = Date.now(),
): Promise<AttemptResult> {
  for (let i = 0; i < 8; i++) {
    const row = await store.read();
    if (!row.otp_code_hash || !row.otp_expires_at) return "otp_required";
    const n = row.otp_attempts ?? 0;
    if (n >= OTP_MAX_ATTEMPTS) return "otp_locked";
    if (new Date(row.otp_expires_at).getTime() < now) return "otp_invalid";
    if (!(await store.casAttempts(n, row.otp_code_hash))) continue; // загубено състезание → чети отново
    return (await verifyOtp(code, signerId, row.otp_code_hash, secret)) ? "ok" : "otp_invalid";
  }
  return "otp_locked";
}
