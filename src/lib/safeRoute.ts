/**
 * Безопасни маршрути за връщане след вход / потвърждение на имейл / OAuth.
 *
 * Едно място за правилото „само относителен път в същия origin“, което се
 * използва от указателя на черновата, страницата за вход, инлайн диалога за
 * вход, `post_login_redirect` и абсолютните `emailRedirectTo` адреси.
 *
 * Защо не само regex: браузърите премахват табулации/нови редове от URL и
 * нормализират `\` до `/`, така че „/\tevil.com“ или „/\\evil.com“ могат да се
 * превърнат в протокол-относителен адрес. Затова, освен формата, проверяваме и
 * резултата от истинския URL парсер спрямо доверения origin.
 */

const DEFAULT_ORIGIN = "https://dogovori.net";

/** Технически параметри, които не бива да „пътуват“ с маршрута след вход. */
const STRIPPED_PARAM_RE = /^(ab_|utm_|debug$|gclid$|fbclid$)/i;

/** Управляващи символи (вкл. таб/нов ред), които URL парсерът би „изял“. */
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS_RE = /[\u0000-\u001f\u007f]/;

/**
 * Само относителни пътища — предпазва от open redirect след вход.
 * Началната страница („/") е допустима: тя е резервният маршрут, когато
 * подаденият път е бил отхвърлен.
 */
export function isSafeRoute(route: unknown): route is string {
  if (typeof route !== "string") return false;
  if (route.length > 2000) return false;
  if (CONTROL_CHARS_RE.test(route)) return false;
  return route === "/" || /^\/[^/\\]/.test(route);
}

/** Довереният origin на приложението (в браузъра — текущият). */
export function trustedOrigin(): string {
  if (typeof window === "undefined" || !window.location?.origin) return DEFAULT_ORIGIN;
  return window.location.origin;
}

/**
 * Изчиства query низ от технически параметри; връща само параметрите на
 * документа. Не проверява безопасността на пътя — за това е `sanitizeReturnPath`.
 */
export function sanitizeDraftRoute(pathname: string, search: string): string {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    return pathname;
  }
  for (const key of [...params.keys()]) {
    if (STRIPPED_PARAM_RE.test(key)) params.delete(key);
  }
  const rest = params.toString();
  return rest ? `${pathname}?${rest}` : pathname;
}

/**
 * Връща безопасен относителен път (`/път?параметри`) или `null`, ако входът
 * би извел потребителя извън приложението или е повреден.
 *
 * Гаранции:
 *  - резултатът винаги започва с единичен `/` и е в същия origin;
 *  - hash, credentials и абсолютни адреси се отхвърлят/изпускат;
 *  - технически параметри (ab_*, utm_*, debug, gclid, fbclid) се премахват.
 */
export function sanitizeReturnPath(
  raw: unknown,
  opts: { origin?: string } = {},
): string | null {
  if (typeof raw !== "string") return null;
  const candidate = raw.trim();
  if (!isSafeRoute(candidate)) return null;

  const origin = opts.origin ?? trustedOrigin();
  let url: URL;
  try {
    url = new URL(candidate, origin);
  } catch {
    return null;
  }
  // Истинският парсер е последната дума: каквото и да е нормализирал, трябва
  // да остане в доверения origin без вградени идентификационни данни.
  if (url.origin !== origin || url.username || url.password) return null;
  if (!url.pathname.startsWith("/")) return null;

  const path = sanitizeDraftRoute(url.pathname, url.search);
  return isSafeRoute(path) ? path : null;
}

/** Като `sanitizeReturnPath`, но с резервен маршрут вместо `null`. */
export function safeReturnPath(raw: unknown, fallback = "/", opts: { origin?: string } = {}): string {
  return sanitizeReturnPath(raw, opts) ?? sanitizeReturnPath(fallback, opts) ?? "/";
}

/**
 * Абсолютен адрес за `emailRedirectTo` / OAuth: доверен origin + безопасен
 * относителен път. Никога не се строи от суров вход.
 */
export function buildAuthRedirectUrl(raw: unknown, fallback = "/"): string {
  const origin = trustedOrigin();
  return origin + safeReturnPath(raw, fallback, { origin });
}

/** Текущият маршрут на страницата, изчистен от технически параметри. */
export function currentReturnPath(): string {
  if (typeof window === "undefined") return "/";
  return safeReturnPath(window.location.pathname + window.location.search, "/");
}
