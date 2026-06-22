import { useEffect, useState } from "react";

/**
 * Returns true while the bottom UI should be visible.
 * Hides on scroll-down (delta > threshold), shows on scroll-up or near top.
 * rAF-throttled — no layout thrash.
 */
export function useHideOnScroll(threshold = 8) {
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    let lastY = window.scrollY;
    let ticking = false;

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const dy = y - lastY;
        if (y < 80) {
          setVisible(true);
        } else if (Math.abs(dy) > threshold) {
          setVisible(dy < 0);
        }
        lastY = y;
        ticking = false;
      });
    };

    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);

  return visible;
}
