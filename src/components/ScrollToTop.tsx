import { useEffect } from "react";
import { useLocation } from "react-router-dom";

/**
 * Scrolls to top of the page on every route change, except when the URL has a hash
 * (in which case the target element should be scrolled into view by the page itself).
 */
export function ScrollToTop() {
  const { pathname, hash } = useLocation();

  useEffect(() => {
    if (hash) return;
    window.scrollTo({ top: 0, left: 0, behavior: "instant" as ScrollBehavior });
  }, [pathname, hash]);

  return null;
}
