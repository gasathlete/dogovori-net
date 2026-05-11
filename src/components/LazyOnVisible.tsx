import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Mounts children only once the wrapper enters (or nears) the viewport.
 * Reserves space via `minHeight` to avoid layout shift while idle.
 */
export function LazyOnVisible({
  children,
  rootMargin = "200px",
  minHeight = 400,
  fallback = null,
}: {
  children: ReactNode;
  rootMargin?: string;
  minHeight?: number;
  fallback?: ReactNode;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(false);

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
    return () => io.disconnect();
  }, [rootMargin, visible]);

  return (
    <div ref={ref} style={visible ? undefined : { minHeight }}>
      {visible ? children : fallback}
    </div>
  );
}
