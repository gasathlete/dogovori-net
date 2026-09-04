/**
 * Решение „накъде след вход“ — една чиста функция за двата пътя, по които
 * сесията се появява: `SIGNED_IN` (нов вход/OAuth връщане) и първоначалното
 * прочитане на сесията (`getSession`, вече влязъл потребител).
 *
 * Правила:
 *  - изрична цел (`post_login_redirect`) има предимство и се ИЗРАЗХОДВА винаги,
 *    щом е прочетена — включително когато съвпада с текущия маршрут или е
 *    отхвърлена като небезопасна, за да не „залепва“ за следващи входове;
 *  - без изрична цел: ако има недовършен документ, връщаме потребителя точно
 *    при него вместо в празен акаунт;
 *  - само относителен път в същия origin (иначе open redirect);
 *  - никога не пренасочваме към текущия маршрут (предпазва от цикъл).
 */
import { sanitizeReturnPath } from "@/lib/safeRoute";

export interface PostAuthRedirectDecision {
  /** Маршрут за пренасочване или `null`, ако оставаме на място. */
  target: string | null;
  /** Трябва ли `post_login_redirect` да се изтрие сега. */
  consumeDestination: boolean;
}

export function resolvePostAuthRedirect(input: {
  /** Стойността на `post_login_redirect` (или null, ако липсва). */
  destination: string | null | undefined;
  /** Текущият маршрут (pathname + search). */
  here: string;
  /** Маршрут на недовършен документ, ако има такъв. */
  draftRoute?: string | null;
}): PostAuthRedirectDecision {
  const raw = typeof input.destination === "string" ? input.destination : null;
  if (raw !== null) {
    const safe = sanitizeReturnPath(raw);
    return {
      // Изразходва се дори при отхвърлена/съвпадаща цел — иначе остава завинаги.
      consumeDestination: true,
      target: safe && safe !== input.here ? safe : null,
    };
  }
  const draft = sanitizeReturnPath(input.draftRoute ?? null);
  return {
    consumeDestination: false,
    target: draft && draft !== input.here ? draft : null,
  };
}
