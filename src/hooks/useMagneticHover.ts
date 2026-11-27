import { useEffect, useRef } from "react";

/**
 * Magnetic hover: element follows the cursor by up to `strength` px while it
 * stays inside its hitbox. rAF-throttled, desktop-only, respects
 * prefers-reduced-motion. Returns a ref to attach to the element.
 */
export function useMagneticHover<T extends HTMLElement = HTMLElement>(strength = 8) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    // Skip on touch / coarse pointer devices and when motion is reduced.
    const canHover = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (!canHover || reduced) return;

    let raf = 0;
    let tx = 0;
    let ty = 0;

    const onMove = (e: MouseEvent) => {
      const r = el.getBoundingClientRect();
      const cx = r.left + r.width / 2;
      const cy = r.top + r.height / 2;
      const dx = (e.clientX - cx) / (r.width / 2);
      const dy = (e.clientY - cy) / (r.height / 2);
      tx = Math.max(-1, Math.min(1, dx)) * strength;
      ty = Math.max(-1, Math.min(1, dy)) * strength;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          el.style.transform = `translate3d(${tx}px, ${ty}px, 0)`;
          raf = 0;
        });
      }
    };

    const onLeave = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = 0;
      el.style.transform = "translate3d(0, 0, 0)";
    };

    el.addEventListener("mousemove", onMove);
    el.addEventListener("mouseleave", onLeave);
    return () => {
      el.removeEventListener("mousemove", onMove);
      el.removeEventListener("mouseleave", onLeave);
      if (raf) cancelAnimationFrame(raf);
      el.style.transform = "";
    };
  }, [strength]);

  return ref;
}
