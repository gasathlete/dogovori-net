/**
 * Buffered event dispatcher.
 *
 * Dispatches a CustomEvent immediately AND stores it in an in-memory buffer
 * (per event name, 5s TTL). Listeners that mount slightly later can call
 * `drainBufferedEvents(name, handler)` on mount to replay any events that
 * fired before they attached — fixing the "first click after page load is
 * ignored" race caused by lazy/deferred overlays.
 */

type BufferedEntry = { detail: unknown; ts: number };

const BUFFER_TTL_MS = 5000;
const buffers = new Map<string, BufferedEntry[]>();

export function dispatchBuffered(name: string, detail?: unknown): void {
  if (typeof window === "undefined") return;
  const entry: BufferedEntry = { detail, ts: Date.now() };
  const bucket = buffers.get(name) ?? [];
  bucket.push(entry);
  buffers.set(name, bucket);
  window.dispatchEvent(new CustomEvent(name, { detail }));
}

/**
 * Replays any buffered events for `name` that are still within TTL, then
 * clears the buffer for that name. Call once from a mount effect.
 */
export function drainBufferedEvents(
  name: string,
  handler: (detail: unknown) => void,
): void {
  const bucket = buffers.get(name);
  if (!bucket || bucket.length === 0) return;
  const now = Date.now();
  const fresh = bucket.filter((e) => now - e.ts <= BUFFER_TTL_MS);
  buffers.delete(name);
  for (const e of fresh) {
    try { handler(e.detail); } catch { /* ignore */ }
  }
}

/** Drops buffered copies of `name` once a live listener has handled it, so a later mount cannot replay a stale request. */
export function clearBufferedEvents(name: string): void {
  buffers.delete(name);
}
