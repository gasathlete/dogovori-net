/**
 * Клиентска преграда за НОВО/ПРОМЕНЕНО съдържание в `saved_documents.payload`
 * (аналог на 0044 за `uploaded_contracts`). Докато няма контролиран бекенд за
 * нов суров текст, браузърът не записва ново съдържание. Разрешени остават:
 * четене, експорт, изтриване, възстановяване на вече записана версия и
 * организация само по метаданни (име, папка, етикети, контакт, екип).
 *
 * Това е клиентски слой. Сървърната страна е в staged SQL
 * `docs/migrations/stage_saved_documents_client_payload_gate.sql` (НЕ приложен).
 */
import { CLIENT_RAW_TEXT_WRITE_ALLOWED, CLIENT_RAW_TEXT_WRITE_BLOCKED_MESSAGE } from "@/lib/privacyGate";

export const SAVED_DOCUMENT_CONTENT_WRITE_ALLOWED: boolean = CLIENT_RAW_TEXT_WRITE_ALLOWED;
export const SAVED_DOCUMENT_CONTENT_BLOCKED_MESSAGE = CLIENT_RAW_TEXT_WRITE_BLOCKED_MESSAGE;

export class SavedDocumentContentBlockedError extends Error {
  readonly code = "saved_document_content_blocked" as const;
  constructor() {
    super(SAVED_DOCUMENT_CONTENT_BLOCKED_MESSAGE);
    this.name = "SavedDocumentContentBlockedError";
  }
}

/** Стабилно сравнение на JSON стойности (редът на ключовете не е промяна). */
function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    return `{${Object.keys(o).sort().map((k) => `${JSON.stringify(k)}:${stable(o[k])}`).join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function payloadChanged(previous: unknown, next: unknown): boolean {
  return stable(previous) !== stable(next);
}

/** Може ли да се запише НОВО съдържание? (вмъкване с payload / промяна на payload) */
export function canWriteSavedDocumentContent(): boolean {
  return SAVED_DOCUMENT_CONTENT_WRITE_ALLOWED === true;
}

/** Хвърля ПРЕДИ мрежата, ако записът носи ново/променено съдържание. */
export function assertSavedDocumentContentWrite(
  patch: Record<string, unknown>,
  previousPayload?: unknown,
): void {
  if (canWriteSavedDocumentContent()) return;
  if (!("payload" in patch)) return;
  if (previousPayload !== undefined && !payloadChanged(previousPayload, patch.payload)) return;
  throw new SavedDocumentContentBlockedError();
}

/** Връща само метаданните (без payload) — за организация без ново съдържание. */
export function metadataOnly<T extends Record<string, unknown>>(patch: T): Omit<T, "payload"> {
  const { payload: _p, ...rest } = patch;
  return rest;
}
