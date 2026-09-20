/**
 * GATE 2 — устойчива идентичност на ЕДНА документна операция с модел.
 *
 * Един и същ обхват връща СЪЩИЯ идентификатор при двойно щракване, повторно
 * показване на компонента, презареждане, временна грешка, изтекло време и
 * загубен отговор. Идентификаторът се сменя само при потвърдено повторение,
 * доказан конфликт/изтекъл резултат, потвърден изход от профила или истинска
 * промяна на входа/версията.
 *
 * В хранилището влизат САМО непрозрачни отпечатъци: никакъв документ,
 * изображение, съобщение, текст на договор или реален идентификатор на профил.
 */

const STORAGE_KEY = "dogovari.document.operation.v1";
const TTL_MS = 24 * 60 * 60 * 1000;

export type DocumentOperationPurpose =
  | "correct_uploaded"
  | "generate_linked_document"
  | "negotiation_strategy"
  | "ocr_contract";

interface StoredOperation {
  purpose: DocumentOperationPurpose;
  /** Отпечатък на обхвата (SHA-256, малки букви). */
  scope: string;
  operationId: string;
  /** Отпечатък на профила — никога самият идентификатор. */
  user: string;
  createdAt: number;
}

async function sha256Hex(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Непрозрачен отпечатък на профила. */
export async function documentOperationUserKey(userId: string): Promise<string> {
  return await sha256Hex(`ai_document_user_v1:${userId}`);
}

function readAll(): StoredOperation[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter((r): r is StoredOperation =>
      !!r && typeof r.purpose === "string" && typeof r.scope === "string" &&
      typeof r.operationId === "string" && typeof r.user === "string" &&
      typeof r.createdAt === "number" && now - r.createdAt < TTL_MS
    );
  } catch {
    return [];
  }
}

function writeAll(rows: StoredOperation[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(-40)));
  } catch { /* липсващо хранилище не бива да спира заявката */ }
}

/**
 * РЕКУРСИВНО канонично представяне: подредбата на ключовете е детерминирана на
 * ВСЯКО ниво, а `undefined` се изхвърля. Така вложени опции или различен ред на
 * ключовете не могат да завъртят запазения идентификатор на операцията.
 */
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

/**
 * Отпечатък на ПЪЛНИЯ обхват: предназначение, профил, точният ресурс, неговата
 * непроменима версия и всички опции, които влияят на резултата. Подавайте вече
 * непрозрачни стойности (отпечатъци), не сурово съдържание.
 */
export async function documentOperationScope(parts: {
  purpose: DocumentOperationPurpose;
  userId: string;
  resourceId?: string | null;
  resourceVersion?: string | null;
  options?: Record<string, unknown>;
}): Promise<string> {
  return await sha256Hex(canonicalJson([
    "ai_document_scope_v1",
    parts.purpose,
    parts.userId,
    parts.resourceId ?? "",
    parts.resourceVersion ?? "",
    parts.options ?? {},
  ]));
}

/** Същият обхват → същият идентификатор, и след презареждане. */
export function getOrCreateDocumentOperationId(
  purpose: DocumentOperationPurpose,
  userKey: string,
  scope: string,
): string {
  const rows = readAll();
  const existing = rows.find((r) =>
    r.purpose === purpose && r.user === userKey && r.scope === scope
  );
  if (existing) return existing.operationId;
  const operationId = crypto.randomUUID();
  writeAll([...rows, { purpose, scope, operationId, user: userKey, createdAt: Date.now() }]);
  return operationId;
}

/** Изчистване САМО при потвърдено повторение/конфликт/изтекъл резултат. */
export function clearDocumentOperation(
  purpose: DocumentOperationPurpose,
  userKey: string,
  scope: string,
): void {
  writeAll(readAll().filter((r) =>
    !(r.purpose === purpose && r.user === userKey && r.scope === scope)
  ));
}

/**
 * Само при ПОТВЪРДЕН изход/смяна на профил. Докато удостоверяването зарежда,
 * тази функция НЕ бива да се вика — иначе устойчивият ключ се губи.
 */
export function clearDocumentOperationsForOtherUsers(userKey: string | null): void {
  writeAll(userKey ? readAll().filter((r) => r.user === userKey) : []);
}
