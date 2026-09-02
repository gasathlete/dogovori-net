// i18next runtime for Dogovori.net. Loaded lazily (see src/i18n/locale.ts) so
// the default Bulgarian critical path stays free of the i18next bundle.
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import bgCommon from "./locales/bg/common.json";
import {
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  detectLocaleFromPath,
  getStoredLocale,
  type Locale,
} from "./locale";

const initial =
  (typeof window !== "undefined" &&
    (detectLocaleFromPath(window.location.pathname) || getStoredLocale())) ||
  DEFAULT_LOCALE;

if (!i18n.isInitialized) {
  void i18n
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
        lookupLocalStorage: LOCALE_STORAGE_KEY,
        caches: ["localStorage"],
      },
      returnNull: false,
    });
}

let enLoaded = false;
async function ensureEnLoaded() {
  if (enLoaded) return;
  enLoaded = true;
  const mod = await import("./locales/en/common.json");
  i18n.addResourceBundle("en", "common", (mod as any).default ?? mod, true, true);
}

/** Apply a locale to the live i18next instance (loading /en resources on demand). */
export async function applyLocale(locale: Locale) {
  if (locale === "en") await ensureEnLoaded();
  await i18n.changeLanguage(locale);
}

if (initial === "en") void ensureEnLoaded();

export default i18n;
