/**
 * P0-E2 — устойчива идентичност на ЕДИН ход към DogovaryAI.
 *
 * Ключът преживява повторно изпращане, презареждане и загубен отговор, за да
 * не бъде таксуван или дублиран един и същ въпрос. Записваме САМО непрозрачни
 * стойности: идентификатор (UUID) и отпечатък на обхвата. Никога самото
 * съобщение, документ или път.
 */

const STORAGE_KEY = "dogovari.assistant.turn.v1";
const TTL_MS = 24 * 60 * 60 * 1000;

interface StoredTurn {
  /** Отпечатък на обхвата (SHA-256, малки букви). */
  scope: string;
  operationId: string;
  /** Обхват по потребител — смяна на профил изчиства ключа. */
  user: string;
  createdAt: number;
}

function readAll(): StoredTurn[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const now = Date.now();
    return parsed.filter((r): r is StoredTurn =>
      !!r && typeof r.scope === "string" && typeof r.operationId === "string" &&
      typeof r.user === "string" && typeof r.createdAt === "number" &&
      now - r.createdAt < TTL_MS
    );
  } catch {
    return [];
  }
}

function writeAll(rows: StoredTurn[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(-20)));
  } catch { /* липсващо хранилище не бива да спира изпращането */ }
}

/** Непрозрачен отпечатък на пълния обхват на заявката. */
export async function turnScopeHash(parts: {
  userId: string;
  threadId: string | null;
  message: string;
  contextKind: string | null;
  contextEntityId: string | null;
  path: string;
}): Promise<string> {
  const payload = JSON.stringify([
    "assistant_turn_scope_v1",
    parts.userId,
    parts.threadId ?? "new_thread",
    parts.contextKind ?? "",
    parts.contextEntityId ?? "",
    parts.path,
    parts.message,
  ]);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(payload));
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Същият обхват връща СЪЩИЯ идентификатор — и след презареждане. */
export function getOrCreateTurnOperationId(userId: string, scope: string): string {
  const rows = readAll();
  const existing = rows.find((r) => r.user === userId && r.scope === scope);
  if (existing) return existing.operationId;
  const operationId = crypto.randomUUID();
  writeAll([...readAll(), { scope, operationId, user: userId, createdAt: Date.now() }]);
  return operationId;
}

/** Изчистваме САМО при потвърден успех или доказан конфликт/изтекъл отговор. */
export function clearTurnOperation(userId: string, scope: string): void {
  writeAll(readAll().filter((r) => !(r.user === userId && r.scope === scope)));
}

/** Смяна на профил/изход: нищо от предишния потребител не остава. */
export function clearTurnOperationsForOtherUsers(userId: string | null): void {
  writeAll(userId ? readAll().filter((r) => r.user === userId) : []);
}
