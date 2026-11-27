import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

/** Event that makes every LazyOnVisible mount (used before scrolling to a #hash). */
export const LAZY_MOUNT_ALL_EVENT = "dogovori:lazy-mount-all";

type Reserve = number | readonly [phone: number, tablet: number, desktop: number];

/**
 * Mounts children only once the wrapper enters (or nears) the viewport.
 *
 * Space is reserved with CSS breakpoints (phone / >=768 / >=1024), so the
 * reservation follows rotation and resize. It is kept until the lazy content
 * has replaced its Suspense skeleton, so the swap does not shrink the page.
 * A #hash in the URL, a same-page hashchange or LAZY_MOUNT_ALL_EVENT mounts
 * everything at once so anchor targets exist.
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
  minHeight?: Reserve;
  fallback?: ReactNode;
  /** Hydrate during idle time even if never scrolled into view. */
  idleMount?: boolean;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [visible, setVisible] = useState(
    () => typeof window !== "undefined" && window.location.hash.length > 1,
  );
  const [settled, setSettled] = useState(false);

  useEffect(() => {
    if (visible) return;
    const mountAll = () => setVisible(true);
    window.addEventListener("hashchange", mountAll);
    window.addEventListener(LAZY_MOUNT_ALL_EVENT, mountAll);
    const node = ref.current;
    let io: IntersectionObserver | null = null;
    if (typeof IntersectionObserver === "undefined") setVisible(true);
    else if (node) {
      io = new IntersectionObserver((entries) => {
        if (entries.some((e) => e.isIntersecting)) setVisible(true);
      }, { rootMargin });
      io.observe(node);
    }
    const w = window as Window & {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      cancelIdleCallback?: (h: number) => void;
    };
    let idle: number | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    if (idleMount) {
      if (w.requestIdleCallback) idle = w.requestIdleCallback(mountAll, { timeout: 2500 });
      else timer = setTimeout(mountAll, 1200);
    }
    return () => {
      io?.disconnect();
      window.removeEventListener("hashchange", mountAll);
      window.removeEventListener(LAZY_MOUNT_ALL_EVENT, mountAll);
      if (idle !== undefined) w.cancelIdleCallback?.(idle);
      if (timer !== undefined) clearTimeout(timer);
    };
  }, [rootMargin, visible, idleMount]);

  // Keep the reservation until the real section (not its skeleton) is in the DOM.
  useEffect(() => {
    if (!visible || settled) return;
    const node = ref.current;
    if (!node) return;
    const check = () => {
      if (node.childElementCount > 0 && !node.querySelector("[data-section-skeleton]")) setSettled(true);
    };
    check();
    const mo = new MutationObserver(check);
    mo.observe(node, { childList: true, subtree: true });
    return () => mo.disconnect();
  }, [visible, settled]);

  const [phone, tablet, desktop] = typeof minHeight === "number" ? [minHeight, minHeight, minHeight] : minHeight;
  const style = settled
    ? undefined
    : ({ "--lov-phone": `${phone}px`, "--lov-tablet": `${tablet}px`, "--lov-desktop": `${desktop}px` } as CSSProperties);

  return (
    <div ref={ref} className={settled ? undefined : "lov-reserve"} style={style} data-lazy-section={visible ? "mounted" : "pending"}>
      {visible ? children : fallback}
    </div>
  );
}
