/**
 * Решение „накъде след вход“ — една чиста функция за двата пътя, по които
 * сесията се появява: `SIGNED_IN` (нов вход/OAuth връщане) и първоначалното
 * прочитане на сесията (`getSession`, вече влязъл потребител).
 *
 * Правила:
 *  - изрична цел (`post_login_redirect`) има предимство и се ИЗРАЗХОДВА винаги,
 *    щом е прочетена — включително когато съвпада с текущия маршрут или е
 *    отхвърлена като небезопасна, за да не „залепва“ за следващи входове;
 *  - без изрична цел резервният маршрут на недовършен документ важи САМО когато
 *    страницата е място за кацане след вход (голият „/“ или самата страница за
 *    вход / връщане от доставчик). Влязъл потребител, който презарежда
 *    /plans или /account, не бива да бъде отвеждан другаде;
 *  - само относителен път в същия origin (иначе open redirect);
 *  - никога не пренасочваме към текущия маршрут (предпазва от цикъл).
 */
import { sanitizeReturnPath } from "@/lib/safeRoute";

/** Маршрути, на които потребителят „каца“ след вход/OAuth връщане. */
const AUTH_LANDING_PATHS: ReadonlySet<string> = new Set(["/", "/auth", "/auth/callback", "/reset-password"]);

export function isAuthLandingPath(pathname: string): boolean {
  const clean = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
  return AUTH_LANDING_PATHS.has(clean || "/");
}

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
  /** Текуща страница ли е място за кацане след вход (виж описанието). */
  isAuthLanding?: boolean;
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
  if (!input.isAuthLanding) return { consumeDestination: false, target: null };
  const draft = sanitizeReturnPath(input.draftRoute ?? null);
  return {
    consumeDestination: false,
    target: draft && draft !== input.here ? draft : null,
  };
}

