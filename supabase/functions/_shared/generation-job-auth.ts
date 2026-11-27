/**
 * generate-job: собственост и идемпотентност.
 *
 * Сървърният ключ свързва ПРОВЕРЕНИЯ собственик, каноничния пълен payload и
 * клиентския ключ. Същият клиентски ключ от друг собственик или с друг
 * payload дава различен ключ → няма споделяне на задачи/резултати.
 * Стари ключове (без префикс) никога не съвпадат с новите.
 */
import { canonicalize, sha256Hex } from "./canonical-digest.ts";

export const GENERATION_JOB_KEY_PREFIX = "gj1:";

export function canonicalGenerationPayload(payload: Record<string, unknown>): string {
  return canonicalize(payload);
}

export async function generationJobServerKey(
  ownerId: string,
  payload: Record<string, unknown>,
  clientKey: string,
): Promise<string> {
  const material = `generate-job\u0000v1\u0000${ownerId}\u0000${clientKey}\u0000${canonicalGenerationPayload(payload)}`;
  return `${GENERATION_JOB_KEY_PREFIX}${await sha256Hex(material)}`;
}

interface ViewRow {
  status: string;
  created_at?: string;
  error: string | null;
  error_code: string | null;
}

/** Само четене: „висящ" running job се показва като job_timeout, без запис. */
export function readOnlyJobView<T extends ViewRow>(row: T, now: number, maxRuntimeMs: number): T {
  if (row.status !== "running" || !row.created_at) return row;
  const age = now - Date.parse(row.created_at);
  if (!Number.isFinite(age) || age <= maxRuntimeMs) return row;
  return {
    ...row,
    status: "error",
    error: "Генерирането надхвърли максималното време.",
    error_code: "job_timeout",
  };
}
