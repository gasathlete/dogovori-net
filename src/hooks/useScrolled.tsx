import { useEffect, useState } from "react";

/**
 * Tracks whether the user has scrolled past `threshold` pixels.
 * Uses requestAnimationFrame to coalesce scroll events — avoids running
 * the comparison on every wheel tick, which is the main cause of scroll jank.
 */
export function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    let ticking = false;
    let raf = 0;
    const compute = () => {
      ticking = false;
      setScrolled((prev) => {
        const next = window.scrollY > threshold;
        return next === prev ? prev : next;
      });
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      raf = requestAnimationFrame(compute);
    };
    compute();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
    };
  }, [threshold]);
  return scrolled;
}
