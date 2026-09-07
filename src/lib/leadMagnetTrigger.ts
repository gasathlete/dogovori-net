/**
 * Чиста (без DOM зависимости при импорт) логика за показване на lead magnet-а.
 *
 *  - Allow-list на маршрутите: показваме САМО на началната страница, каталога /
 *    категориите / секторите, публичните шаблони (/shablon/…) и публичния блог.
 *    Всичко останало (/start, /auth, /build, /wizard*, /analiz, /document*,
 *    /share, /sign*, /uploaded, checkout, /account, /admin, /console, /reset*,
 *    /plans, всички правни страници, 404 …) е ОТКАЗАНО по подразбиране.
 *  - В аналитиката пътува единствено грубата група („home“ / „catalog“ /
 *    „template“ / „blog“) — никога суровият pathname.
 *  - Времеви правила: desktop — поне 12 s престой на разрешен маршрут преди
 *    exit-intent; мобилно — 35 s престой + над 50 % скрол.
 *  - Не прекъсваме потребител, който пише във форма или има отворен диалог.
 */

import { stripLocaleFromPath } from "@/i18n/locale";
import { getCookiePrefs } from "@/lib/analytics";

export const LEAD_MAGNET_SOURCE_GROUPS = ["home", "catalog", "template", "blog"] as const;
export type LeadMagnetSourceGroup = (typeof LEAD_MAGNET_SOURCE_GROUPS)[number];

/** Причини за показване — единствените стойности, които пътуват в `reason`. */
export type LeadMagnetShowReason = "exit_intent" | "mobile_engaged";

/** Причини за затваряне без сваляне. */
export type LeadMagnetDismissReason = "close" | "not_now" | "dont_show_again";

/** Desktop: минимален престой на разрешен маршрут преди exit-intent. */
export const LEAD_MAGNET_DESKTOP_DWELL_MS = 12_000;
/** Мобилно: престой преди проверката за дълбочина на скрола. */
export const LEAD_MAGNET_MOBILE_DWELL_MS = 35_000;
/** Мобилно: изисквана дълбочина на скрола (дял от цялата височина). */
export const LEAD_MAGNET_MOBILE_SCROLL_DEPTH = 0.5;
/** Максимална ширина на viewport-а, която броим за „мобилно“. */
export const LEAD_MAGNET_MOBILE_MEDIA_QUERY = "(max-width: 768px)";

/** localStorage — „Не показвай повече“ (и след сваляне/абонамент). */
export const LEAD_MAGNET_DISMISS_KEY = "lead_magnet_dismissed_v1";
/**
 * sessionStorage — едно показване на сесия. Стойността се чете и от
 * SocialProofToast, за да не се струпват два overlay-а в една сесия.
 */
export const LEAD_MAGNET_SHOWN_KEY = "lead_magnet_shown_v1";

/** Разрешени символи в сегмент от URL (slug / id). Всичко друго → отказ. */
const SEGMENT_RE = /^[a-z0-9][a-z0-9._~-]{0,159}$/;

/** Управляващи символи, backslash и подобни — URL парсерът би ги „изял“. */
// eslint-disable-next-line no-control-regex
const UNSAFE_PATH_RE = /[\u0000-\u001f\u007f\\]/;

function normalizePathname(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (raw.length === 0 || raw.length > 2000) return null;
  if (UNSAFE_PATH_RE.test(raw)) return null;
  let path = raw;
  const cut = path.search(/[?#]/);
  if (cut >= 0) path = path.slice(0, cut);
  if (!path.startsWith("/")) return null;
  try {
    path = decodeURIComponent(path);
  } catch {
    return null;
  }
  path = stripLocaleFromPath(path).toLowerCase();
  // Свиваме повторени и крайни наклонени черти („/catalog/“ ≡ „/catalog“).
  path = path.replace(/\/{2,}/g, "/");
  if (path.length > 1) path = path.replace(/\/+$/, "");
  return path || "/";
}

/**
 * Класифицира маршрут към груба група или връща `null`, когато lead magnet-ът
 * НЕ бива да се показва. Всичко, което не е изрично изброено, е отказано.
 */
export function classifyLeadMagnetRoute(pathname: unknown): LeadMagnetSourceGroup | null {
  const path = normalizePathname(pathname);
  if (path === null) return null;
  if (path === "/") return "home";

  const segments = path.split("/").filter(Boolean);
  const [head, second, third] = segments;
  const validSegment = (s: string | undefined): s is string => typeof s === "string" && SEGMENT_RE.test(s);

  switch (head) {
    case "catalog":
      return segments.length === 1 ? "catalog" : null;
    case "kategoria":
    case "sektor":
      return segments.length === 2 && validSegment(second) ? "catalog" : null;
    case "shablon":
      return segments.length === 2 && validSegment(second) ? "template" : null;
    case "blog": {
      if (segments.length === 1) return "blog";
      if (segments.length === 2) {
        // /blog/submit е форма за изпращане на статия — не е публична статия;
        // /blog/u без slug не е статия (префикс на потребителските публикации).
        if (second === "submit" || second === "u") return null;
        return validSegment(second) ? "blog" : null;
      }
      if (segments.length === 3 && second === "u") return validSegment(third) ? "blog" : null;
      return null;
    }
    default:
      return null;
  }
}

export function isLeadMagnetSourceGroup(value: unknown): value is LeadMagnetSourceGroup {
  return typeof value === "string" && (LEAD_MAGNET_SOURCE_GROUPS as readonly string[]).includes(value);
}

/* -------------------------------------------------------------------------- */
/*  Сигнали за „зает потребител“ — стандартни API-та, без крехки селектори     */
/* -------------------------------------------------------------------------- */

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);

/** Фокусиран елемент за писане (в ход е форма). */
export function isEditableElement(el: Element | null | undefined): boolean {
  if (!el) return false;
  if (EDITABLE_TAGS.has(el.tagName)) {
    if (el.tagName === "INPUT") {
      const type = (el as HTMLInputElement).type;
      if (type === "button" || type === "submit" || type === "reset" || type === "checkbox" || type === "radio") {
        return false;
      }
    }
    return true;
  }
  return (el as HTMLElement).isContentEditable === true;
}

/**
 * Има ли в момента отворен диалог / активна форма?
 *  - фокус върху поле за писане (стандартен `document.activeElement`);
 *  - фокус вътре в елемент с ARIA роля dialog/alertdialog/menu (focus-trap на
 *    отворен модал държи фокуса вътре);
 *  - отворен Radix диалог (примитивите в `components/ui` маркират съдържанието
 *    с `role="dialog"` + `data-state="open"` и го демонтират при затваряне);
 *  - собствените модални overlay-и на проекта носят `aria-modal="true"` и се
 *    рендират само когато са отворени.
 * При каквато и да е грешка връща `false` (fail-open към нормалното поведение).
 */
export function isUserBusy(doc: Document | null | undefined): boolean {
  if (!doc) return false;
  try {
    const active = doc.activeElement;
    if (active && active !== doc.body && active !== doc.documentElement) {
      if (isEditableElement(active)) return true;
      if (active.closest('[role="dialog"], [role="alertdialog"], [role="menu"]')) return true;
    }
    if (
      doc.querySelector(
        '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"], [role="dialog"][aria-modal="true"]',
      )
    ) {
      return true;
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * Банерът за бисквитки още не е решен → не струпваме втори overlay върху него.
 * Използва съществуващия сигнал `getCookiePrefs()` (null = няма решение).
 */
export function isCookieDecisionPending(): boolean {
  try {
    return getCookiePrefs() === null;
  } catch {
    return false;
  }
}

/* -------------------------------------------------------------------------- */
/*  Viewport / скрол                                                           */
/* -------------------------------------------------------------------------- */

export function isMobileViewport(win: Window | null | undefined): boolean {
  if (!win || typeof win.matchMedia !== "function") return false;
  try {
    return win.matchMedia(LEAD_MAGNET_MOBILE_MEDIA_QUERY).matches === true;
  } catch {
    return false;
  }
}

/** Достигната ли е изискваната дълбочина на скрола (дял от цялата страница)? */
export function hasScrolledPast(
  win: Window | null | undefined,
  doc: Document | null | undefined,
  depth: number = LEAD_MAGNET_MOBILE_SCROLL_DEPTH,
): boolean {
  if (!win || !doc?.documentElement) return false;
  const total = doc.documentElement.scrollHeight;
  if (!Number.isFinite(total) || total <= 0) return false;
  const seen = (win.scrollY || 0) + (win.innerHeight || 0);
  return seen >= total * depth;
}

/* -------------------------------------------------------------------------- */
/*  Съхранение                                                                 */
/* -------------------------------------------------------------------------- */

export function isLeadMagnetDismissed(): boolean {
  try {
    return localStorage.getItem(LEAD_MAGNET_DISMISS_KEY) === "1";
  } catch {
    return false;
  }
}

export function wasLeadMagnetShownThisSession(): boolean {
  try {
    return sessionStorage.getItem(LEAD_MAGNET_SHOWN_KEY) === "1";
  } catch {
    return false;
  }
}

export function markLeadMagnetShown(): void {
  try {
    sessionStorage.setItem(LEAD_MAGNET_SHOWN_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function markLeadMagnetDismissed(): void {
  try {
    localStorage.setItem(LEAD_MAGNET_DISMISS_KEY, "1");
  } catch {
    /* ignore */
  }
}

/* -------------------------------------------------------------------------- */
/*  Имейл — клиентска проверка, огледална на сървърната (RPC)                  */
/* -------------------------------------------------------------------------- */

export const LEAD_MAGNET_EMAIL_MAX_LEN = 254;

/**
 * Строг, но практичен формат: локална част от ASCII букви/цифри и ._%+-
 * без две последователни точки; домейн от етикети и TLD от 2–63 букви.
 * Сървърът прилага същото правило — клиентът само пести излишни заявки.
 */
const EMAIL_RE = /^[a-z0-9_%+-]+(\.[a-z0-9_%+-]+)*@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

export function normalizeLeadEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > LEAD_MAGNET_EMAIL_MAX_LEN) return null;
  return EMAIL_RE.test(email) ? email : null;
}

export function isValidLeadEmail(raw: unknown): boolean {
  return normalizeLeadEmail(raw) !== null;
}
