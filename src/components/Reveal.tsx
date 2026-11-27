import { type ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * Reveal — historically faded sections in on scroll. The fade-in caused
 * extra paints and visible flicker on slower devices and made fast
 * scrolling feel "choppy". It now renders children directly (no JS,
 * no IntersectionObserver, no opacity transition) while keeping the
 * same public API so existing call sites don't need changes.
 */
export function Reveal({
  children,
  className,
  as: Tag = "div",
}: {
  children: ReactNode;
  className?: string;
  /** kept for API compatibility — no longer used */
  delay?: number;
  as?: keyof JSX.IntrinsicElements;
}) {
  const Comp = Tag as any;
  return <Comp className={cn(className)}>{children}</Comp>;
}
