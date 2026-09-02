// Pure locale helpers — deliberately free of any i18next import so the ~95KB
// i18next runtime stays off the critical path. The runtime is loaded lazily
// only when the user actually switches to a non-default locale.

export const SUPPORTED_LOCALES = ["bg", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "bg";
export const LOCALE_STORAGE_KEY = "dogovori_locale";

/** Read locale from URL prefix (/en/..., /bg/..., otherwise default). */
export function detectLocaleFromPath(pathname: string): Locale {
  const seg = pathname.split("/").filter(Boolean)[0]?.toLowerCase();
  if (seg === "en") return "en";
  if (seg === "bg") return "bg";
  return DEFAULT_LOCALE;
}

/** Strip a /bg or /en prefix; returns the canonical pathname. */
export function stripLocaleFromPath(pathname: string): string {
  return pathname.replace(/^\/(bg|en)(?=\/|$)/i, "") || "/";
}

/** Prepend a locale prefix (omits prefix for default bg). */
export function withLocalePrefix(pathname: string, locale: Locale): string {
  const bare = stripLocaleFromPath(pathname);
  if (locale === DEFAULT_LOCALE) return bare;
  return `/${locale}${bare === "/" ? "" : bare}`;
}

export function getStoredLocale(): Locale | null {
  try {
    const v = localStorage.getItem(LOCALE_STORAGE_KEY);
    return v && (SUPPORTED_LOCALES as readonly string[]).includes(v) ? (v as Locale) : null;
  } catch {
    return null;
  }
}

/**
 * Persist + apply a locale. The i18next runtime is imported on demand, so the
 * default Bulgarian experience never pays for it.
 */
export function setLocale(locale: Locale) {
  if (!(SUPPORTED_LOCALES as readonly string[]).includes(locale)) return;
  try {
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    /* ignore */
  }
  if (typeof document !== "undefined") document.documentElement.lang = locale;
  if (typeof window !== "undefined") {
    void import("./runtime").then((m) => m.applyLocale(locale));
  }
}
