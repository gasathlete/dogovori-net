// i18n bootstrap for Dogovori.net (Sprint 7).
// Locales: bg (default, no URL prefix) and en (under /en/...).
// Resources are static JSON so initial paint stays sync; future namespaces
// can be split & lazy-loaded per route.
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import bgCommon from "./locales/bg/common.json";
// English bundle is loaded on demand only when the user actually visits /en/*.
// Keeps ~10KB of JSON + parsing work off the default Bulgarian critical path.

export const SUPPORTED_LOCALES = ["bg", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "bg";

const STORAGE_KEY = "dogovori_locale";

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

const initial =
  (typeof window !== "undefined" &&
    (detectLocaleFromPath(window.location.pathname) ||
      (localStorage.getItem(STORAGE_KEY) as Locale | null))) ||
  DEFAULT_LOCALE;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      bg: { common: bgCommon },
    },
    lng: initial,
    fallbackLng: DEFAULT_LOCALE,
    defaultNS: "common",
    ns: ["common"],
    interpolation: { escapeValue: false },
    detection: {
      order: ["path", "localStorage", "navigator"],
      lookupLocalStorage: STORAGE_KEY,
      caches: ["localStorage"],
    },
    returnNull: false,
  });

let enLoaded = false;
async function ensureEnLoaded() {
  if (enLoaded) return;
  enLoaded = true;
  const mod = await import("./locales/en/common.json");
  i18n.addResourceBundle("en", "common", mod.default ?? mod, true, true);
}

// If the app booted directly on an /en/* URL, fetch the English bundle now.
if (initial === "en") void ensureEnLoaded();

export function setLocale(locale: Locale) {
  if (!SUPPORTED_LOCALES.includes(locale)) return;
  if (locale === "en") {
    void ensureEnLoaded().then(() => i18n.changeLanguage(locale));
  } else {
    i18n.changeLanguage(locale);
  }
  try { localStorage.setItem(STORAGE_KEY, locale); } catch { /* ignore */ }
  if (typeof document !== "undefined") document.documentElement.lang = locale;
}

export default i18n;
