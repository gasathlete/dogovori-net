/**
 * ЗАЛИЧАВАНЕ НА ВРЕМЕННИ ФАЙЛОВЕ ПО ЗАЯВКА.
 *
 * download-blank записва генерирания документ в `document-blanks` под
 * `request/<uuid>/...` и го вписва в леджъра `storage_artifacts`. Тук се трият
 * изтеклите записи — идемпотентно, на ограничени партиди и с истинна
 * статистика. Публични/одобрени обекти и `draft/` НЕ се пипат.
 *
 * Два важни принципа:
 * 1) Филтърът по обхват/път е В БАЗАТА, ПРЕДИ ограничението на партидата.
 *    Иначе изтекли `draft/` редове могат вечно да заемат цялата партида и
 *    файловете по заявка никога да не се изтрият.
 * 2) „Няма грешка" НЕ значи „изтрито". Отчита се какво реално е върнало
 *    хранилището: премахнати, вече липсващи и маркирани — поотделно.
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

interface RemovedObject {
  readonly name?: string;
  readonly path?: string;
}

interface SelectChain {
  eq(col: string, val: string): SelectChain;
  is(col: string, val: null): SelectChain;
  lt(col: string, val: string): SelectChain;
  like(col: string, val: string): SelectChain;
  order(col: string, opts: { ascending: boolean }): SelectChain;
  limit(n: number): Promise<{ data: ArtifactRow[] | null; error: { message: string } | null }>;
}

interface StorageListEntry {
  readonly name?: string;
}

interface SweepDb {
  from(table: string): {
    select(cols: string): SelectChain;
    update(values: Record<string, unknown>): {
      in(col: string, vals: string[]): Promise<{ error: { message: string } | null }>;
    };
  };
  storage: {
    from(bucket: string): {
      remove(
        paths: string[],
      ): Promise<{ data: RemovedObject[] | null; error: { message: string } | null }>;
      list(
        prefix: string,
        opts: { search?: string; limit?: number },
      ): Promise<{ data: StorageListEntry[] | null; error: { message: string } | null }>;
    };
  };
}

export interface SweepResult {
  readonly examined: number;
  /** Обекти, които хранилището потвърди като премахнати в този курс. */
  readonly removed: number;
  /** Обекти, чието ОТСЪСТВИЕ е потвърдено с проверка в хранилището. */
  readonly missing: number;
  /** Редове, маркирани като заличени (само след успешен запис в базата). */
  readonly marked: number;
  /**
   * Редове без доказан изход: обектът още съществува, проверката за наличие
   * се провали или записът в базата не мина. Остават чакащи следващ курс.
   */
  readonly unresolved: number;
  readonly skipped_not_request: number;
  readonly errors: string[];
}

function objectName(obj: RemovedObject): string {
  return String(obj.name ?? obj.path ?? "");
}

/**
 * ТОЧНА проверка за наличие на един обект. „Липсва в отговора на remove" НЕ е
 * доказателство за отсъствие — затова се проверява изрично.
 */
async function objectAbsent(
  db: SweepDb,
  bucket: string,
  path: string,
): Promise<{ absent: boolean; error?: string }> {
  const slash = path.lastIndexOf("/");
  const prefix = slash >= 0 ? path.slice(0, slash) : "";
  const name = slash >= 0 ? path.slice(slash + 1) : path;
  try {
    const { data, error } = await db.storage.from(bucket).list(prefix, { search: name, limit: 100 });
    if (error) return { absent: false, error: error.message };
    const entries = (data ?? []).map((e) => String(e.name ?? ""));
    return { absent: !entries.includes(name) };
  } catch (e) {
    return { absent: false, error: e instanceof Error ? e.message : "existence check failed" };
  }
}

export async function sweepExpiredRequestArtifacts(
  db: SweepDb,
  opts: { now?: Date; batchSize?: number } = {},
): Promise<SweepResult> {
  const now = opts.now ?? new Date();
  const batchSize = Math.min(Math.max(opts.batchSize ?? 200, 1), 500);
  const errors: string[] = [];
  const empty = { removed: 0, missing: 0, marked: 0, unresolved: 0, skipped_not_request: 0 };

  // Филтрите по обхват и префикс са В ЗАЯВКАТА, за да не се „изяжда" партидата
  // от изтекли чернови и заличаването по заявка да не спира никога.
  const { data, error } = await db
    .from("storage_artifacts")
    .select("id, bucket, storage_path, scope")
    .eq("scope", "request")
    .like("storage_path", `${REQUEST_PREFIX}%`)
    .is("deleted_at", null)
    .lt("expires_at", now.toISOString())
    .order("expires_at", { ascending: true })
    .limit(batchSize);

  if (error) {
    return {
      examined: 0,
      ...empty,
      errors: [`storage_artifacts query: ${error.message}`],
    };
  }

  const rows = data ?? [];
  // Защитен слой и в кода: дори при променена заявка не пипаме чужди пътища.
  const sweepable = rows.filter(
    (r) => r.scope === "request" && isSweepableRequestPath(r.storage_path),
  );
  const skipped = rows.length - sweepable.length;
  if (sweepable.length === 0) {
    return { examined: rows.length, ...empty, skipped_not_request: skipped, errors };
  }

  const byBucket = new Map<string, ArtifactRow[]>();
  for (const row of sweepable) {
    const list = byBucket.get(row.bucket) ?? [];
    list.push(row);
    byBucket.set(row.bucket, list);
  }

  let removed = 0;
  let missing = 0;
  let marked = 0;
  let unresolved = 0;
  const nowIso = new Date().toISOString();

  /** Записва причината на реда, без да твърди заличаване. */
  const keepPending = async (bucket: string, ids: string[], reason: string) => {
    unresolved += ids.length;
    const { error: noteErr } = await db
      .from("storage_artifacts")
      .update({ delete_error: reason })
      .in("id", ids);
    if (noteErr) errors.push(`${bucket} record delete_error: ${noteErr.message}`);
  };

  for (const [bucket, list] of byBucket) {
    const { data: removedObjects, error: rmErr } = await db.storage
      .from(bucket)
      .remove(list.map((r) => r.storage_path));

    if (rmErr) {
      errors.push(`${bucket} remove: ${rmErr.message}`);
      await keepPending(bucket, list.map((r) => r.id), rmErr.message);
      continue;
    }

    // Съгласуваме какво реално е върнало хранилището.
    const confirmed = new Set((removedObjects ?? []).map(objectName).filter(Boolean));
    const confirmedRows = list.filter((r) => confirmed.has(r.storage_path));
    const omitted = list.filter((r) => !confirmed.has(r.storage_path));

    // Пропуснат в отговора обект се ПРОВЕРЯВА поименно. Само потвърдено
    // отсъствие е „липсващ"; наличен или непроверим остава чакащ.
    const absentRows: ArtifactRow[] = [];
    for (const r of omitted) {
      const check = await objectAbsent(db, bucket, r.storage_path);
      if (check.absent) {
        absentRows.push(r);
        continue;
      }
      const reason = check.error
        ? `existence_check_failed: ${check.error}`
        : "object_still_present_after_remove";
      errors.push(`${bucket} ${r.storage_path}: ${reason}`);
      await keepPending(bucket, [r.id], reason);
    }

    const resolved = [...confirmedRows, ...absentRows];
    if (resolved.length === 0) continue;

    const { error: markErr } = await db
      .from("storage_artifacts")
      .update({ deleted_at: nowIso, delete_error: null })
      .in("id", resolved.map((r) => r.id));
    if (markErr) {
      errors.push(`${bucket} mark deleted: ${markErr.message}`);
      await keepPending(bucket, resolved.map((r) => r.id), `mark_failed: ${markErr.message}`);
      continue;
    }
    // Броим само СЛЕД доказан запис в базата.
    removed += confirmedRows.length;
    missing += absentRows.length;
    marked += resolved.length;
  }

  return {
    examined: rows.length,
    removed,
    missing,
    marked,
    unresolved,
    skipped_not_request: skipped,
    errors,
  };
}

