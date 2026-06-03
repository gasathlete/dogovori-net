// Hook + helpers for locale-aware navigation. Wrap RR Link/navigate so callers
// don't have to know about /en prefix logic.
import { useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { DEFAULT_LOCALE, type Locale, SUPPORTED_LOCALES, detectLocaleFromPath, setLocale, withLocalePrefix } from "@/i18n";

export function useLocale() {
  const { i18n } = useTranslation();
  const { pathname } = useLocation();
  const navigate = useNavigate();

  const current = (SUPPORTED_LOCALES.includes(i18n.language as Locale)
    ? (i18n.language as Locale)
    : detectLocaleFromPath(pathname)) as Locale;

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
