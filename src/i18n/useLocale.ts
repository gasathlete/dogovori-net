// Hook + helpers for locale-aware navigation. Wrap RR Link/navigate so callers
// don't have to know about /en prefix logic.
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { DEFAULT_LOCALE, type Locale, detectLocaleFromPath, getStoredLocale, setLocale, withLocalePrefix } from "@/i18n/locale";

export function useLocale() {
  const { pathname } = useLocation();
  const navigate = useNavigate();

  // Derive from the URL first (canonical), then from the stored preference.
  const current: Locale = detectLocaleFromPath(pathname) === DEFAULT_LOCALE
    ? (getStoredLocale() ?? DEFAULT_LOCALE)
    : detectLocaleFromPath(pathname);

  const localized = useCallback(
    (to: string) => withLocalePrefix(to, current),
    [current],
  );

  const changeLocale = useCallback(
    (next: Locale) => {
      setLocale(next);
      navigate(withLocalePrefix(pathname, next));
    },
    [pathname, navigate],
  );

  return { locale: current, defaultLocale: DEFAULT_LOCALE, localized, changeLocale };
}
