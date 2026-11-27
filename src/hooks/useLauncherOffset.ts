import { useEffect, useState } from "react";

const BASE = 24;
const GAP = 12;
const COOKIE_SELECTOR = '[data-cookie-banner="true"]';

export type LauncherOffset = { bottom: number; hidden: boolean };

/**
 * Pure placement rule: keep the floating launcher above the cookie banner and
 * above the visible page footer; hide it only when no free space remains.
 */
export function computeLauncherOffset(input: {
  viewportHeight: number;
  cookieTop: number | null;
  footerTop: number | null;
  launcherHeight: number;
}): LauncherOffset {
  const { viewportHeight, cookieTop, footerTop, launcherHeight } = input;
  let bottom = BASE;
  for (const top of [cookieTop, footerTop]) {
    if (top !== null && top < viewportHeight) bottom = Math.max(bottom, viewportHeight - top + GAP);
  }
  const hidden = viewportHeight - bottom - launcherHeight < 96;
  return { bottom, hidden };
}

export function useLauncherOffset(enabled: boolean, launcherHeight = 48): LauncherOffset {
  const [offset, setOffset] = useState<LauncherOffset>({ bottom: BASE, hidden: false });
  useEffect(() => {
    if (!enabled || typeof window === "undefined") return;
    let frame = 0;
    const measure = () => {
      frame = 0;
      const cookie = document.querySelector(COOKIE_SELECTOR);
      const footer = document.querySelector("footer");
      const next = computeLauncherOffset({
        viewportHeight: window.innerHeight,
        cookieTop: cookie ? cookie.getBoundingClientRect().top : null,
        footerTop: footer ? footer.getBoundingClientRect().top : null,
        launcherHeight,
      });
      setOffset((prev) => (prev.bottom === next.bottom && prev.hidden === next.hidden ? prev : next));
    };
    const schedule = () => { if (!frame) frame = window.requestAnimationFrame(measure); };
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const mo = new MutationObserver(schedule);
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      mo.disconnect();
    };
  }, [enabled, launcherHeight]);
  return offset;
}
