/**
 * Инлайн вход/регистрация без напускане на текущата страница.
 *
 * Защо: пренасочването към `/auth?redirect=…` по време на попълване в уизарда
 * беше основната точка на отпадане — потребителят губи инерция и не се връща.
 * Тук вместо навигация отваряме модален прозорец, а след успешен вход
 * извикваме подадения `onSuccess`, така че операцията продължава на място.
 */
import { dispatchBuffered } from "@/lib/bufferedEvents";

export const INLINE_AUTH_EVENT = "dogovori:inline-auth";

export interface InlineAuthRequest {
  /** Кратък етикет на операцията, напр. „Свали PDF“. */
  action?: string;
  /** Начален изглед на модала. */
  mode?: "login" | "signup";
  /** Изпълнява се веднага след като сесията е налична. */
  onSuccess?: () => void;
  /** Стабилен ключ на намерението (за аналитика), напр. `generate`, `download_pdf`. */
  intent?: string;
  /** Документ / екран, от който идва подканата — за фунията. */
  docKey?: string;
  source?: string;
  /** true → не отчита `auth_prompt_shown` (подканата вече е отчетена от предходен екран). */
  silent?: boolean;
}

export interface InlineAuthDetail {
  action?: string;
  mode: "login" | "signup";
  intent?: string;
  docKey?: string;
  source?: string;
  silent?: boolean;
}

/** Пази callback-а извън CustomEvent detail (не се сериализира). */
let pendingSuccess: (() => void) | null = null;

export function openInlineAuth(req: InlineAuthRequest = {}): void {
  pendingSuccess = req.onSuccess ?? null;
  const detail: InlineAuthDetail = {
    action: req.action,
    mode: req.mode ?? "signup",
    intent: req.intent,
    docKey: req.docKey,
    source: req.source,
    silent: req.silent,
  };
  dispatchBuffered(INLINE_AUTH_EVENT, detail);
}

export function takeInlineAuthSuccess(): (() => void) | null {
  const cb = pendingSuccess;
  pendingSuccess = null;
  return cb;
}
