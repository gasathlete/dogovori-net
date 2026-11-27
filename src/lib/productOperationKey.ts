/**
 * GATE 3 — устойчива самоличност на ЕДНА платена операция в браузъра.
 *
 * Едно щракване, презареждане, временна грешка или загубен отговор използват
 * СЪЩИЯ ключ за повторяемост. Така сървърът разпознава повторението и връща
 * записания резултат, вместо да започне второ платено изпълнение.
 *
 * Ключът се сменя само когато входът наистина е различен: друго платено право,
 * друг резултат, друга версия или друго указание. В хранилището влизат само
 * непрозрачни отпечатъци — никакво указание, текст на документ или резултат.
 */

const STORAGE_KEY = "dogovari.product.operation.v1";
const TTL_MS = 24 * 60 * 60 * 1000;

export type ProductOperationPurpose = "product_refinement" | "product_selection";

interface StoredProductOperation {
  purpose: ProductOperationPurpose;
  scope: string;
  key: string;
  createdAt: number;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

function canonicalJson(value: unknown): string {
  if (value === null || value === undefined) return "null";
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

function readAll(): StoredProductOperation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter((r): r is StoredProductOperation =>
      !!r && typeof r.purpose === "string" && typeof r.scope === "string" &&
      typeof r.key === "string" && typeof r.createdAt === "number" &&
      now - r.createdAt < TTL_MS
    );
  } catch {
    return [];
  }
}

function writeAll(rows: StoredProductOperation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(-40)));
  } catch { /* липсващо хранилище не бива да спира заявката */ }
}

/**
 * Отпечатък на пълния обхват на платената операция. Подавайте вече непрозрачни
 * стойности (отпечатъци и версии), не сурово съдържание.
 */
export async function productOperationScope(parts: {
  purpose: ProductOperationPurpose;
  entitlementId: string;
  resultDigest: string;
  version: number;
  input?: unknown;
}): Promise<string> {
  return await sha256Hex(canonicalJson([
    "product_operation_scope_v1",
    parts.purpose,
    parts.entitlementId,
    parts.resultDigest,
    parts.version,
    parts.input ?? null,
  ]));
}

/** Същият обхват → същият ключ, и след презареждане на страницата. */
export function getOrCreateProductOperationKey(
  purpose: ProductOperationPurpose,
  scope: string,
): string {
  const rows = readAll();
  const existing = rows.find((r) => r.purpose === purpose && r.scope === scope);
  if (existing) return existing.key;
  const key = crypto.randomUUID();
  writeAll([...rows, { purpose, scope, key, createdAt: Date.now() }]);
  return key;
}

/**
 * Изчистване САМО след записан успех или доказан конфликт. Временна грешка,
 * изчакване и състояние „за изясняване“ НЕ изчистват ключа.
 */
export function clearProductOperationKey(
  purpose: ProductOperationPurpose,
  scope: string,
): void {
  writeAll(readAll().filter((r) => !(r.purpose === purpose && r.scope === scope)));
}
