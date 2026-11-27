// Q2e/Q2f — канонична версия на документния контекст на DogovaryAI.
//
// Изнесено тук БЕЗ промяна на логиката, за да го използват едновременно
// `assistant-chat` (обвързване на разговора) и `assistant-edit` (пре-обвързване
// след приложена редакция). Един и същ код → една и съща версия.

export const ASSISTANT_CONTEXT_SOURCE_VERSION = "q2e-assistant-context-1";

export const ASSISTANT_CONTEXT_KINDS = [
  "saved_document",
  "uploaded_contract",
  "analysis",
] as const;

export type AssistantContextKind = (typeof ASSISTANT_CONTEXT_KINDS)[number];

/** Детерминистичен JSON: рекурсивно сортирани ключове, без зависимост от реда. */
export function canonicalJson(value: unknown): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value) ?? "null";
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const obj = value as Record<string, unknown>;
  const keys = Object.keys(obj).sort();
  return "{" +
    keys.map((k) => JSON.stringify(k) + ":" + canonicalJson(obj[k])).join(",") +
    "}";
}

export interface ContextRow {
  kind: AssistantContextKind;
  entityId: string;
  /** Пълните полета на реда, използвани и за версията, и за заглавието. */
  fields: Record<string, unknown>;
}

/**
 * Канонична форма на контекста — структурирани полета (без разделители в
 * низовете), затова колизии от вида `label=value` са невъзможни.
 */
export function canonicalContextPayload(row: ContextRow): string {
  return canonicalJson({
    v: ASSISTANT_CONTEXT_SOURCE_VERSION,
    kind: row.kind,
    entity_id: row.entityId,
    fields: row.fields,
  });
}

export async function computeContextVersion(row: ContextRow): Promise<string> {
  const data = new TextEncoder().encode(canonicalContextPayload(row));
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
