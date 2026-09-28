import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Mounts children only once the wrapper enters (or nears) the viewport.
 * Reserves space via `minHeight` to avoid layout shift while idle.
 *
 * Uses a generous rootMargin so chunks mount well before the user reaches
 * them — this prevents the "jump" that happens when a placeholder swaps
 * for taller real content.
 */
export function LazyOnVisible({
  children,
  rootMargin = "300px",
  minHeight = 400,
  fallback = null,
  idleMount = false,
}: {
  children: ReactNode;
  rootMargin?: string;
  /** Reserved height; `[phone, desktop(>=1024px)]` to match real section size and avoid scroll jumps. */
  minHeight?: number | readonly [number, number];
  fallback?: ReactNode;
  /** Hydrate during idle time even if never scrolled into view. */
  idleMount?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  // A deep link (/#produkti) must find its target: mount everything at once
  // instead of relying on scrolling past lazy placeholders.
  const [visible, setVisible] = useState(
    () => typeof window !== "undefined" && window.location.hash.length > 1,
  );
  const reserved = typeof minHeight === "number"
    ? minHeight
    : typeof window !== "undefined" && window.matchMedia?.("(min-width: 1024px)").matches
      ? minHeight[1]
      : minHeight[0];

  useEffect(() => {
    if (visible) return;
    const node = ref.current;
    if (!node) return;
    if (typeof IntersectionObserver === "undefined") {
      setVisible(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { rootMargin },
    );
    io.observe(node);

    if (!idleMount) return () => io.disconnect();

    const ric =
      (window as any).requestIdleCallback ??
      ((cb: () => void) => setTimeout(cb, 1200));
    const handle = ric(() => setVisible(true), { timeout: 2500 });

    return () => {
      io.disconnect();
      const cic = (window as any).cancelIdleCallback;
      if (cic) cic(handle);
      else clearTimeout(handle as any);
    };
  }, [rootMargin, visible, idleMount]);

  return (
    <div
      ref={ref}
      className="cv-auto"
      style={{
        // `contain-intrinsic-size` via .cv-auto reserves space; we still set
        // minHeight for browsers without content-visibility support.
        ...(visible ? null : { minHeight: reserved, containIntrinsicSize: `1px ${reserved}px` }),
      }}
    >
      {visible ? children : fallback}
    </div>
  );
}
