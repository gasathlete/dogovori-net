import { Link, type LinkProps } from "react-router-dom";
import { forwardRef, type MouseEvent, type FocusEvent } from "react";

/**
 * Map of route prefix -> dynamic import factory for the lazy route module.
 * Prefetching warms the chunk so the navigation feels instant after click.
 * Keep entries aligned with the lazy() calls in src/App.tsx.
 */
const PREFETCHERS: Array<[RegExp, () => Promise<unknown>]> = [
  [/^\/wizard\b/, () => import("@/pages/Wizard.tsx")],
  [/^\/catalog\b/, () => import("@/pages/Catalog.tsx")],
  [/^\/shablon\b/, () => import("@/pages/Template.tsx")],
  [/^\/kategoria\b/, () => import("@/pages/Category.tsx")],
  [/^\/sektor\b/, () => import("@/pages/Sector.tsx")],
  [/^\/build\b/, () => import("@/pages/BuildContract.tsx")],
  [/^\/auth\b/, () => import("@/pages/Auth.tsx")],
  [/^\/account\b/, () => import("@/pages/Account.tsx")],
  [/^\/blog\/[^/]+/, () => import("@/pages/BlogPost.tsx")],
  [/^\/blog\b/, () => import("@/pages/Blog.tsx")],
];

const fired = new WeakSet<() => Promise<unknown>>();

/** Mirrors src/lib/routePrefetch — skip speculation on slow/limited devices. */
function prefetchAllowed(): boolean {
  const conn = (navigator as any).connection;
  if (conn?.saveData) return false;
  if (/(^|-)(2g|slow-2g|3g)$/.test(String(conn?.effectiveType ?? ""))) return false;
  const mem = (navigator as any).deviceMemory;
  if (typeof mem === "number" && mem > 0 && mem < 4) return false;
  return true;
}

function prefetchFor(href: string) {
  if (!prefetchAllowed()) return;
  const match = PREFETCHERS.find(([re]) => re.test(href));
  if (!match) return;
  const fn = match[1];
  if (fired.has(fn)) return;
  fired.add(fn);
  // Fire and forget — chunk lands in the cache.
  fn().catch(() => {});
}

export const PrefetchLink = forwardRef<HTMLAnchorElement, LinkProps>(
  ({ to, onMouseEnter, onFocus, ...rest }, ref) => {
    const href = typeof to === "string" ? to : (to as { pathname?: string })?.pathname ?? "";
    const handleEnter = (e: MouseEvent<HTMLAnchorElement>) => {
      prefetchFor(href);
      onMouseEnter?.(e);
    };
    const handleFocus = (e: FocusEvent<HTMLAnchorElement>) => {
      prefetchFor(href);
      onFocus?.(e);
    };
    return <Link ref={ref} to={to} onMouseEnter={handleEnter} onFocus={handleFocus} {...rest} />;
  },
);

PrefetchLink.displayName = "PrefetchLink";

/**
 * Handlers for non-Link CTAs (e.g. `<button onClick={() => navigate(...)}>`).
 * Safe to call inside loops — it's a plain function, not a hook.
 *
 * Usage:
 *   <button {...prefetchHandlers("/sektor/finance")} onClick={...}>...</button>
 */
export function prefetchHandlers(href: string) {
  return {
    onMouseEnter: () => prefetchFor(href),
    onFocus: () => prefetchFor(href),
  };
}
