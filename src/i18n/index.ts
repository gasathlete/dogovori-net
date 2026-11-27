// Re-export surface kept for backwards compatibility. Pure helpers live in
// ./locale (no i18next), the runtime lives in ./runtime and loads lazily.
export {
  SUPPORTED_LOCALES,
  DEFAULT_LOCALE,
  LOCALE_STORAGE_KEY,
  detectLocaleFromPath,
  stripLocaleFromPath,
  withLocalePrefix,
  getStoredLocale,
  setLocale,
  type Locale,
} from "./locale";
