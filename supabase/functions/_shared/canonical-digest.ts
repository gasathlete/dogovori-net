/**
 * КАНОНИЧЕН ОТПЕЧАТЪК НА ЗАЯВКА.
 *
 * Ключът за идемпотентност е валиден само заедно с отпечатъка на СЪДЪРЖАНИЕТО.
 * Така повторение по същия ключ с друг товар е конфликт, а не тихо повторно
 * подаване на чужд резултат.
 *
 * Канонизацията е детерминирана: ключовете на обектите се подреждат, undefined
 * се изхвърля, а числата/булевите остават като стойности.
 */

export function canonicalize(value: unknown): string {
  if (value === null) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalize(v)}`).join(",")}}`;
  }
  if (typeof value === "undefined") return "null";
  return JSON.stringify(value);
}

export async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Каноничен отпечатък на произволен товар на заявка. */
export function canonicalRequestDigest(payload: unknown): Promise<string> {
  return sha256Hex(canonicalize(payload));
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Валиден UUID или null. Празен текст НИКОГА не се подава на UUID параметър. */
export function asUuidOrNull(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim();
  return UUID_RE.test(v) ? v : null;
}

/** Непразен текст или null (за text параметри като doc_key). */
export function asTextOrNull(value: unknown, maxLen = 200): string | null {
  if (typeof value !== "string") return null;
  const v = value.trim().slice(0, maxLen);
  return v.length > 0 ? v : null;
}
