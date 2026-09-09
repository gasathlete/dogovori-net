import { useEffect, useState } from "react";

/** Синхронно първоначално четене — без „проблясък" и без скок на layout. */
function readMatch(query: string): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return false;
  }
  try {
    return window.matchMedia(query).matches === true;
  } catch {
    return false;
  }
}

/**
 * Стабилен matchMedia hook: инициализира се синхронно (без flash) и се
 * почиства коректно както със `addEventListener`, така и със стария
 * `addListener` API.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState<boolean>(() => readMatch(query));

  useEffect(() => {
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return;
    }
    let mq: MediaQueryList;
    try {
      mq = window.matchMedia(query);
    } catch {
      return;
    }
    const onChange = () => setMatches(readMatch(query));
    onChange();
    if (typeof mq.addEventListener === "function") {
      mq.addEventListener("change", onChange);
      return () => mq.removeEventListener("change", onChange);
    }
    if (typeof (mq as any).addListener === "function") {
      (mq as any).addListener(onChange);
      return () => (mq as any).removeListener(onChange);
    }
    return;
  }, [query]);

  return matches;
}

/** Телефонният праг на дизайн системата (< md). */
export const MOBILE_MEDIA_QUERY = "(max-width: 767px)";

/** `true` само на телефон — мобилният интерфейс е отделно преживяване. */
export function useIsMobileViewport(): boolean {
  return useMediaQuery(MOBILE_MEDIA_QUERY);
}
