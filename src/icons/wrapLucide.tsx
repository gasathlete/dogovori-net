import { forwardRef, createElement, type ComponentType, type SVGProps } from "react";
import type { IconProps } from "./createIcon";
import { DEFAULT_STROKE_WIDTH } from "./createIcon";

type LucideLike = ComponentType<SVGProps<SVGSVGElement> & { size?: number | string; absoluteStrokeWidth?: boolean }>;

/**
 * Wraps a lucide-react icon so it inherits the Dogovori defaults:
 * - strokeWidth 1.75 (finer, premium/legal feel)
 * - lucide-{name} className preserved (lucide-react already handles this)
 *
 * Use for icons where a full hand-drawn replacement isn't warranted but we
 * still want consistent stroke weight across the app.
 */
export function wrapLucide(Icon: LucideLike, _name: string) {
  const Component = forwardRef<SVGSVGElement, IconProps>((props, ref) => {
    const { strokeWidth = DEFAULT_STROKE_WIDTH, ...rest } = props;
    return createElement(Icon as any, { ref, strokeWidth, ...rest });
  });
  Component.displayName = (Icon as any).displayName ?? _name;
  return Component;
}
