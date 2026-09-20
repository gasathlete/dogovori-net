/**
 * ЗАЛИЧАВАНЕ НА ВРЕМЕННИ ФАЙЛОВЕ ПО ЗАЯВКА.
 *
 * download-blank записва генерирания документ в `document-blanks` под
 * `request/<uuid>/...` и го вписва в леджъра `storage_artifacts`. Тук се трият
 * изтеклите записи — идемпотентно, на ограничени партиди и с истинна
 * статистика. Публични/одобрени обекти и `draft/` НЕ се пипат.
 */

export const REQUEST_PREFIX = "request/";
export const DRAFT_PREFIX = "draft/";

/** Заличаваме само пътища по заявка. Всичко друго е извън обхват. */
export function isSweepableRequestPath(path: string): boolean {
  return path.startsWith(REQUEST_PREFIX);
}

export interface ArtifactRow {
  readonly id: string;
  readonly bucket: string;
  readonly storage_path: string;
  readonly scope: string;
}

interface SweepDb {
  from(table: string): {
    select(cols: string): {
      is(col: string, val: null): {
        lt(col: string, val: string): {
          limit(n: number): Promise<{ data: ArtifactRow[] | null; error: { message: string } | null }>;
        };
      };
    };
    update(values: Record<string, unknown>): {
      in(col: string, vals: string[]): Promise<{ error: { message: string } | null }>;
    };
  };
  storage: {
    from(bucket: string): {
      remove(paths: string[]): Promise<{ data: unknown; error: { message: string } | null }>;
    };
  };
}

export interface SweepResult {
  readonly examined: number;
  readonly deleted: number;
  readonly skipped_not_request: number;
  readonly errors: string[];
}

export async function sweepExpiredRequestArtifacts(
  db: SweepDb,
  opts: { now?: Date; batchSize?: number } = {},
): Promise<SweepResult> {
  const now = opts.now ?? new Date();
  const batchSize = Math.min(Math.max(opts.batchSize ?? 200, 1), 500);
  const errors: string[] = [];

  const { data, error } = await db
    .from("storage_artifacts")
    .select("id, bucket, storage_path, scope")
    .is("deleted_at", null)
    .lt("expires_at", now.toISOString())
    .limit(batchSize);

  if (error) {
    return { examined: 0, deleted: 0, skipped_not_request: 0, errors: [`storage_artifacts query: ${error.message}`] };
  }

  const rows = data ?? [];
  const sweepable = rows.filter((r) => r.scope === "request" && isSweepableRequestPath(r.storage_path));
  const skipped = rows.length - sweepable.length;
  if (sweepable.length === 0) {
    return { examined: rows.length, deleted: 0, skipped_not_request: skipped, errors };
  }

  // Групираме по кошер, за да е изтриването едно извикване на кошер.
  const byBucket = new Map<string, ArtifactRow[]>();
  for (const row of sweepable) {
    const list = byBucket.get(row.bucket) ?? [];
    list.push(row);
    byBucket.set(row.bucket, list);
  }

  let deleted = 0;
  for (const [bucket, list] of byBucket) {
    const { error: rmErr } = await db.storage.from(bucket).remove(list.map((r) => r.storage_path));
    if (rmErr) {
      errors.push(`${bucket} remove: ${rmErr.message}`);
      continue;
    }
    // Маркирането е идемпотентно: повторен курс не трие втори път.
    const { error: markErr } = await db
      .from("storage_artifacts")
      .update({ deleted_at: new Date().toISOString() })
      .in("id", list.map((r) => r.id));
    if (markErr) {
      errors.push(`${bucket} mark deleted: ${markErr.message}`);
      continue;
    }
    deleted += list.length;
  }

  return { examined: rows.length, deleted, skipped_not_request: skipped, errors };
}
