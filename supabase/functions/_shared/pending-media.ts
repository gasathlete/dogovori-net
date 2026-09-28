// Сървърно огледало на src/lib/pendingMedia.ts.
export const PENDING_MEDIA_PREFIX = "pending-media:";
const BUCKETS = { partner: "partner-logos-pending", article: "user-articles-pending" } as const;
const PUBLIC = { partner: "partner-logos", article: "user-articles" } as const;
export type MediaKind = keyof typeof BUCKETS;

export function publicBucketFor(kind: MediaKind): string {
  return PUBLIC[kind];
}

/** Разпознава само маркер за кофата на съответния вид; отхвърля обхождане. */
export function parsePendingMedia(value: unknown, kind: MediaKind): { bucket: string; path: string } | null {
  if (typeof value !== "string" || !value.startsWith(PENDING_MEDIA_PREFIX)) return null;
  const rest = value.slice(PENDING_MEDIA_PREFIX.length);
  const bucket = BUCKETS[kind];
  if (!rest.startsWith(bucket + "/")) return null;
  const path = rest.slice(bucket.length + 1);
  // deno-lint-ignore no-control-regex
  if (!path || path.length > 512 || /[\u0000-\u001f\\]/.test(path)) return null;
  const parts = path.split("/");
  if (parts.length !== 2 || parts.some((p) => !p || p === "." || p === "..")) return null;
  if (!/^[0-9a-f-]{36}$/i.test(parts[0]) || !/^[\w-]+\.(png|jpe?g|webp)$/i.test(parts[1])) return null;
  return { bucket, path };
}
