/**
 * Неодобрени изображения (лога на партньори, снимки към статии) се качват в
 * ЧАСТНИ staging кофи. В базата се пази маркер, а не публичен адрес. При
 * одобрение сървърната функция `approve-media` копира файла в публичната кофа
 * и записва стабилния публичен адрес.
 */
export const PENDING_MEDIA_PREFIX = "pending-media:";

export const PENDING_BUCKETS = {
  partner: "partner-logos-pending",
  article: "user-articles-pending",
} as const;

export type PendingMediaKind = keyof typeof PENDING_BUCKETS;

export function pendingMediaMarker(kind: PendingMediaKind, path: string): string {
  return `${PENDING_MEDIA_PREFIX}${PENDING_BUCKETS[kind]}/${path}`;
}

export function parsePendingMedia(value: unknown): { bucket: string; path: string } | null {
  if (typeof value !== "string" || !value.startsWith(PENDING_MEDIA_PREFIX)) return null;
  const rest = value.slice(PENDING_MEDIA_PREFIX.length);
  const i = rest.indexOf("/");
  if (i <= 0) return null;
  const bucket = rest.slice(0, i);
  const path = rest.slice(i + 1);
  if (!Object.values(PENDING_BUCKETS).includes(bucket as never)) return null;
  if (!path || path.includes("..") || path.startsWith("/")) return null;
  return { bucket, path };
}

export function isPendingMedia(value: unknown): boolean {
  return parsePendingMedia(value) !== null;
}
