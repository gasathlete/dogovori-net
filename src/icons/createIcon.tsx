import { forwardRef, memo, type SVGProps } from "react";

/**
 * Lucide-compatible icon factory for the Dogovori icon set.
 * API mirrors lucide-react: { size, color, strokeWidth, absoluteStrokeWidth, className, ...svgProps }
 * Default stroke width 1.75 for a slightly finer, more legal/premium feel than Lucide's 2.
 */
export interface IconProps extends Omit<SVGProps<SVGSVGElement>, "stroke"> {
  size?: number | string;
  color?: string;
  strokeWidth?: number | string;
  absoluteStrokeWidth?: boolean;
}

export const DEFAULT_STROKE_WIDTH = 1.75;

export function createIcon(name: string, children: React.ReactNode) {
  const Component = forwardRef<SVGSVGElement, IconProps>(
    (
      {
        size = 24,
        color = "currentColor",
        strokeWidth = DEFAULT_STROKE_WIDTH,
        absoluteStrokeWidth = false,
        className,
        children: extra,
        ...rest
      },
      ref,
    ) => {
      const sw = absoluteStrokeWidth
        ? (Number(strokeWidth) * 24) / Number(size)
        : strokeWidth;
      return (
        <svg
          ref={ref}
          xmlns="http://www.w3.org/2000/svg"
          width={size}
          height={size}
          viewBox="0 0 24 24"
          fill="none"
          stroke={color}
          strokeWidth={sw}
          strokeLinecap="round"
          strokeLinejoin="round"
          className={["lucide", `lucide-${name}`, className].filter(Boolean).join(" ")}
          {...rest}
        >
          {children}
          {extra}
        </svg>
      );
    },
  );
  Component.displayName = name;
  return memo(Component);
}
