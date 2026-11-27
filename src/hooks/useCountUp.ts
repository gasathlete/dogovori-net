import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Animates a number towards `target` when the host element scrolls into view.
 * Returns a ref to attach to the element and the current numeric value.
 *
 * - Handles targets that arrive asynchronously (restarts on a real change).
 * - Continues from the previously visible value on refetch (no jump to 0).
 * - Cancels the RAF loop and the IntersectionObserver on cleanup.
 * - Honors `prefers-reduced-motion` — jumps directly to the target value.
 */
export function useCountUp(
  target: number,
  { duration = 1200, decimals = 0 }: { duration?: number; decimals?: number } = {},
) {
  const ref = useRef<HTMLElement | null>(null);
  const [value, setValue] = useState(0);
  const valueRef = useRef(0);
  const [inView, setInView] = useState(false);

  const commit = useCallback((v: number) => {
    valueRef.current = v;
    setValue(v);
  }, []);

  // Visibility gate — resolved once, then the observer is disconnected.
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      setInView(true);
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setInView(true);
          observer.disconnect();
        }
      },
      { threshold: 0.25 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!inView) return;
    if (!Number.isFinite(target)) return;

    const from = valueRef.current;
    if (from === target) return;

    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    if (reduced || duration <= 0 || typeof requestAnimationFrame === "undefined") {
      commit(target);
      return;
    }

    const factor = Math.pow(10, decimals);
    let raf = 0;
    const start = performance.now();

    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      // ease-out cubic
      const eased = 1 - Math.pow(1 - t, 3);
      if (t < 1) {
        commit(Math.round((from + (target - from) * eased) * factor) / factor);
        raf = requestAnimationFrame(tick);
      } else {
        commit(target);
      }
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, inView, duration, decimals, commit]);

  return { ref, value };
}
