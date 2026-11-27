/**
 * Проверки за обвързване на споделена връзка с документа и файла на
 * собственика. Service ключът заобикаля RLS, затова всяка цел и всеки път в
 * хранилището се проверяват изрично спрямо owner_id на връзката.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * true само когато пътят е относителен, без „..“/обратни наклонени черти/
 * управляващи символи и първият сегмент е точно UUID-то на собственика.
 */
export function isOwnerStoragePath(path: unknown, ownerId: unknown): path is string {
  if (typeof path !== "string" || typeof ownerId !== "string") return false;
  if (!UUID_RE.test(ownerId)) return false;
  if (path.length === 0 || path.length > 1024) return false;
  // deno-lint-ignore no-control-regex
  if (/[\u0000-\u001f\u007f\\]/.test(path)) return false;
  if (path.startsWith("/")) return false;
  const parts = path.split("/");
  if (parts.some((p) => p === "" || p === "." || p === "..")) return false;
  return parts.length >= 2 && parts[0].toLowerCase() === ownerId.toLowerCase();
}

/** Целта принадлежи на собственика на връзката. */
export function targetBelongsToOwner(target: { user_id?: unknown } | null | undefined, ownerId: unknown): boolean {
  return !!target && typeof ownerId === "string" && target.user_id === ownerId;
}
