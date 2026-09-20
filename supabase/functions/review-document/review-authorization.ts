/**
 * ОТОРИЗАЦИЯ НА РЕВИЗИЯТА.
 *
 * Платено повикване към модел се допуска САМО по един от два пътя:
 *  (а) ПРОВЕРЕН СОБСТВЕНИК на точно този запазен документ/версия — сървърът
 *      сам чете съдържанието и сам преизчислява отпечатъка; „влязъл в профила"
 *      НЕ е достатъчно;
 *  (б) ВАЛИДЕН ЕДНОКРАТЕН ПРОПУСК, издаден от сървъра след успешно оторизирано
 *      генериране.
 *
 * Манифестът за качество доказва произход, но НИКОГА не е оторизация.
 */

export type PersistedFailure =
  | "invalid_request"
  | "unavailable"
  | "not_found"
  | "not_owner"
  | "content_mismatch";

export interface PersistedDocument {
  readonly ownerId: string | null;
  readonly text: string | null;
}

export type PersistedLoad =
  | { readonly error: true }
  | { readonly found: false }
  | { readonly found: true; readonly doc: PersistedDocument };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface DocumentRef {
  readonly documentId: string;
  readonly versionNo: number | null;
}

/** Разчита точния идентификатор на документа и (по избор) версията. */
export function normalizeDocumentRef(
  rawId: unknown,
  rawVersion: unknown,
): DocumentRef | null {
  if (typeof rawId !== "string" || !UUID_RE.test(rawId.trim())) return null;
  let versionNo: number | null = null;
  if (rawVersion !== undefined && rawVersion !== null && rawVersion !== "") {
    const n = typeof rawVersion === "number" ? rawVersion : Number(rawVersion);
    if (!Number.isInteger(n) || n <= 0 || n > 1_000_000) return null;
    versionNo = n;
  }
  return { documentId: rawId.trim(), versionNo };
}

export type PersistedVerdict =
  | { readonly ok: true; readonly ownerId: string }
  | { readonly ok: false; readonly reason: PersistedFailure };

export async function authorizePersistedReview(input: {
  documentId: unknown;
  versionNo: unknown;
  userId: string | null;
  contentDigest: string;
  load: (documentId: string, versionNo: number | null) => Promise<PersistedLoad>;
  digestOf: (text: string) => Promise<string>;
}): Promise<PersistedVerdict> {
  const ref = normalizeDocumentRef(input.documentId, input.versionNo);
  if (!ref) return { ok: false, reason: "invalid_request" };
  // Без удостоверен потребител няма как да се докаже собственост.
  if (!input.userId) return { ok: false, reason: "not_owner" };

  let loaded: PersistedLoad;
  try {
    loaded = await input.load(ref.documentId, ref.versionNo);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  if ("error" in loaded && loaded.error) return { ok: false, reason: "unavailable" };
  if (!("found" in loaded) || loaded.found !== true) return { ok: false, reason: "not_found" };

  const owner = loaded.doc.ownerId;
  // Собственикът се проверява изрично — чужд документ не се ревизира.
  if (!owner || owner !== input.userId) return { ok: false, reason: "not_owner" };

  const text = typeof loaded.doc.text === "string" ? loaded.doc.text : "";
  if (!text.trim()) return { ok: false, reason: "content_mismatch" };
  let digest: string;
  try {
    digest = await input.digestOf(text);
  } catch {
    return { ok: false, reason: "unavailable" };
  }
  // Отпечатъкът се ПРЕИЗЧИСЛЯВА от съхраненото съдържание: подаден чужд или
  // подменен текст не се ревизира срещу чужда собственост.
  if (digest !== input.contentDigest) return { ok: false, reason: "content_mismatch" };
  return { ok: true, ownerId: owner };
}

export interface DenialResponse {
  readonly status: number;
  readonly code: string;
  readonly message: string;
}

/** Всеки отказ е БЕЗ повикване към модел. */
export function reviewDenial(
  reason: PersistedFailure | "missing_authorization" | "grant_invalid" | "grant_unavailable" | "grant_replayed",
): DenialResponse {
  switch (reason) {
    case "unavailable":
      return {
        status: 503,
        code: "review_unavailable",
        message: "Ревизията е временно недостъпна. Опитайте отново след минута.",
      };
    case "grant_unavailable":
      return {
        status: 503,
        code: "grant_unavailable",
        message: "Проверката на пропуска е временно недостъпна. Опитайте отново.",
      };
    case "grant_replayed":
      return {
        status: 409,
        code: "grant_already_used",
        message: "Този пропуск вече е използван. Стартирайте ревизията отново.",
      };
    case "grant_invalid":
      return {
        status: 403,
        code: "invalid_grant",
        message: "Пропускът за тази ревизия е невалиден или изтекъл.",
      };
    case "not_found":
      return {
        status: 404,
        code: "document_not_found",
        message: "Документът не е намерен.",
      };
    case "content_mismatch":
      return {
        status: 409,
        code: "content_mismatch",
        message:
          "Текстът не съвпада със запазения документ. Отворете документа отново и стартирайте ревизията.",
      };
    case "invalid_request":
      return {
        status: 400,
        code: "invalid_document_ref",
        message: "Идентификаторът на документа не е разчетен.",
      };
    case "not_owner":
    case "missing_authorization":
    default:
      return {
        status: 403,
        code: "unauthorized",
        message:
          "Ревизията е достъпна само за Вашия документ — отворете го от профила си или стартирайте ревизия веднага след изготвянето.",
      };
  }
}
