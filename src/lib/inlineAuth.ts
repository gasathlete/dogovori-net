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
}

/** Пази callback-а извън CustomEvent detail (не се сериализира). */
let pendingSuccess: (() => void) | null = null;

export function openInlineAuth(req: InlineAuthRequest = {}): void {
  pendingSuccess = req.onSuccess ?? null;
  dispatchBuffered(INLINE_AUTH_EVENT, { action: req.action, mode: req.mode ?? "signup" });
}

export function takeInlineAuthSuccess(): (() => void) | null {
  const cb = pendingSuccess;
  pendingSuccess = null;
  return cb;
}
