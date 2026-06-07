import { useEffect, useRef, useState } from "react";

/**
 * Animates a number from 0 → target when the host element scrolls into view.
 * Returns a ref to attach to the element and the current numeric value.
 *
 * Honors `prefers-reduced-motion` — jumps directly to the target value.
 */
export function useCountUp(
  target: number,
  { duration = 1200, decimals = 0 }: { duration?: number; decimals?: number } = {},
) {
  const ref = useRef<HTMLElement | null>(null);
  const [value, setValue] = useState(0);
  const startedRef = useRef(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduced) {
      setValue(target);
      return;
    }

    if (typeof IntersectionObserver === "undefined") {
      setValue(target);
      return;
    }

    const factor = Math.pow(10, decimals);

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !startedRef.current) {
            startedRef.current = true;
            const start = performance.now();
            const tick = (now: number) => {
              const t = Math.min(1, (now - start) / duration);
              // ease-out cubic
              const eased = 1 - Math.pow(1 - t, 3);
              setValue(Math.round(target * eased * factor) / factor);
              if (t < 1) requestAnimationFrame(tick);
            };
            requestAnimationFrame(tick);
            observer.disconnect();
          }
        });
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [target, duration, decimals]);

  return { ref, value };
}
