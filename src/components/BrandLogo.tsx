import { cn } from "@/lib/utils";
import {
  BRAND_FRAME_PATHS,
  BRAND_LOGO_VIEWBOX,
  BRAND_MARK_VIEWBOX,
  BRAND_MONOGRAM_PATHS,
  BRAND_MONOGRAM_TRANSFORM,
  BRAND_SCALE_PATHS,
  BRAND_WORDMARK_PATHS,
  BRAND_WORDMARK_TRANSFORM,
} from "@/lib/brandGeometry";

type BrandVariant = "auto" | "light" | "dark";

interface BrandMarkProps {
  className?: string;
  variant?: BrandVariant;
  decorative?: boolean;
}

interface BrandLogoProps extends BrandMarkProps {
  compact?: boolean;
}

const variantClass: Record<BrandVariant, string> = {
  auto: "",
  light: "text-navy",
  dark: "text-[hsl(var(--brand-logo-dark))]",
};

/** Одобреният кирилски ДН знак в прекъсната рамка с отделена малка везна. */
export function BrandMark({ className, decorative = false }: BrandMarkProps) {
  return (
    <svg
      viewBox={BRAND_MARK_VIEWBOX}
      width="320"
      height="270"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : "Договори.нет"}
      className={cn("block shrink-0 text-gold", className)}
    >
      {BRAND_FRAME_PATHS.map((path) => <path key={path} fill="currentColor" d={path} />)}
      <g transform={BRAND_MONOGRAM_TRANSFORM}>
        {BRAND_MONOGRAM_PATHS.map((path) => <path key={path} fill="currentColor" d={path} />)}
      </g>
      {BRAND_SCALE_PATHS.map((path) => <path key={path} fill="currentColor" d={path} />)}
    </svg>
  );
}

/** Хоризонталният знак използва същата геометрия и векторизиран кирилски надпис. */
export function BrandLogo({ className, variant = "auto", compact = false }: BrandLogoProps) {
  return (
    <svg
      viewBox={BRAND_LOGO_VIEWBOX}
      width="1408"
      height="280"
      role="img"
      aria-label="Договори.нет"
      className={cn("block shrink-0", compact ? "h-9 w-[181px]" : "h-10 w-[201px]", variantClass[variant], className)}
    >
      <g className="text-gold">
        {BRAND_FRAME_PATHS.map((path) => <path key={path} fill="currentColor" d={path} />)}
        <g transform={BRAND_MONOGRAM_TRANSFORM}>
          {BRAND_MONOGRAM_PATHS.map((path) => <path key={path} fill="currentColor" d={path} />)}
        </g>
        {BRAND_SCALE_PATHS.map((path) => <path key={path} fill="currentColor" d={path} />)}
      </g>
      <g transform={BRAND_WORDMARK_TRANSFORM}>
        {BRAND_WORDMARK_PATHS.map((path) => <path key={path} fill="currentColor" d={path} />)}
      </g>
    </svg>
  );
}
