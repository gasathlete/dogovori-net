/**
 * Q2e — избран документен контекст за DogovaryAI (само метаданни).
 *
 * В това състояние НИКОГА не влиза текст на документ, payload или съдържание
 * на анализ. Съхранява се само в паметта на страницата — без localStorage, без
 * URL параметри, без analytics и без логове. Сървърът е единственият източник
 * на заглавие и версия; `displayTitle` е чисто UI етикет.
 */
import { useSyncExternalStore } from "react";

export const ASSISTANT_CONTEXT_KINDS = [
  "saved_document",
  "uploaded_contract",
  "analysis",
] as const;

export type AssistantContextKind = (typeof ASSISTANT_CONTEXT_KINDS)[number];

export interface AssistantDocumentContext {
  kind: AssistantContextKind;
  entityId: string;
  /** Ограничен UI етикет — не е достоверен източник, само за показване. */
  displayTitle: string;
}

export const DISPLAY_TITLE_MAX = 120;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isAssistantContextKind(value: unknown): value is AssistantContextKind {
  return typeof value === "string" &&
    (ASSISTANT_CONTEXT_KINDS as readonly string[]).includes(value);
}

export function kindLabel(kind: AssistantContextKind): string {
  switch (kind) {
    case "analysis": return "Риск анализ";
    case "uploaded_contract": return "Качен документ";
    default: return "Запазен документ";
  }
}

/** Строга валидация; при нередовен вход връща null (никакви частични обекти). */
export function makeAssistantDocumentContext(input: unknown): AssistantDocumentContext | null {
  if (!input || typeof input !== "object" || Array.isArray(input)) return null;
  const o = input as Record<string, unknown>;
  if (!isAssistantContextKind(o.kind)) return null;
  if (typeof o.entityId !== "string" || !UUID_RE.test(o.entityId.trim())) return null;
  const rawTitle = typeof o.displayTitle === "string" ? o.displayTitle.trim().replace(/\s+/g, " ") : "";
  return {
    kind: o.kind,
    entityId: o.entityId.trim().toLowerCase(),
    displayTitle: (rawTitle || kindLabel(o.kind)).slice(0, DISPLAY_TITLE_MAX),
  };
}

/** Заявката към сървъра носи САМО {kind, entityId}. */
export function toRequestContext(
  ctx: AssistantDocumentContext | null,
): { kind: AssistantContextKind; entityId: string } | null {
  if (!ctx) return null;
  return { kind: ctx.kind, entityId: ctx.entityId };
}

export function sameContextTarget(
  a: AssistantDocumentContext | null,
  b: AssistantDocumentContext | null,
): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  return a.kind === b.kind && a.entityId === b.entityId;
}

/** Ключ за идентичност на обхвата (в паметта; не се записва никъде). */
export function contextIdentityKey(ctx: AssistantDocumentContext | null): string {
  return ctx ? `${ctx.kind}:${ctx.entityId}` : "general";
}

// ---------------------------------------------------------------- store

let current: AssistantDocumentContext | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const l of Array.from(listeners)) l();
}

export function getAssistantDocumentContext(): AssistantDocumentContext | null {
  return current;
}

export function setAssistantDocumentContext(input: unknown): AssistantDocumentContext | null {
  const next = makeAssistantDocumentContext(input);
  if (sameContextTarget(next, current) && next?.displayTitle === current?.displayTitle) {
    return current;
  }
  current = next;
  emit();
  return current;
}

export function clearAssistantDocumentContext(): void {
  if (current === null) return;
  current = null;
  emit();
}

export function subscribeAssistantDocumentContext(listener: () => void): () => void {
  listeners.add(listener);
  return () => { listeners.delete(listener); };
}

export function useAssistantDocumentContext(): AssistantDocumentContext | null {
  return useSyncExternalStore(
    subscribeAssistantDocumentContext,
    getAssistantDocumentContext,
    getAssistantDocumentContext,
  );
}
