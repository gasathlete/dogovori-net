import { cn } from "@/lib/utils";
import {
  BRAND_FRAME_PATHS,
  BRAND_LOGO_VIEWBOX,
  BRAND_MARK_VIEWBOX,
  BRAND_MONOGRAM_PATHS,
  BRAND_SCALE_PATHS,
  BRAND_WORDMARK_GOLD_START,
  BRAND_WORDMARK_PATHS,
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
export function BrandMark({ className, variant = "auto", decorative = false }: BrandMarkProps) {
  return (
    <svg
      viewBox={BRAND_MARK_VIEWBOX}
      width="320"
      height="270"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : "Договори.нет"}
      className={cn("block shrink-0 text-gold", variantClass[variant], className)}
    >
      {BRAND_FRAME_PATHS.map((path) => <path key={path} fill="currentColor" d={path} />)}
      {BRAND_MONOGRAM_PATHS.map((path) => <path key={path} fill="currentColor" d={path} />)}
      {BRAND_SCALE_PATHS.map((path) => <path key={path} fill="currentColor" d={path} />)}
    </svg>
  );
}

/** Хоризонталният знак използва същата геометрия и векторизиран кирилски надпис. */
export function BrandLogo({ className, variant = "auto", compact = false }: BrandLogoProps) {
  return (
    <svg
      viewBox={BRAND_LOGO_VIEWBOX}
      width="1880"
      height="280"
      role="img"
      aria-label="Договори.нет"
      className={cn("block shrink-0", compact ? "h-8 w-[215px]" : "h-10 w-[269px]", variantClass[variant], className)}
    >
      <g className="text-gold">
        {BRAND_FRAME_PATHS.map((path) => <path key={path} fill="currentColor" d={path} />)}
        {BRAND_MONOGRAM_PATHS.map((path) => <path key={path} fill="currentColor" d={path} />)}
        {BRAND_SCALE_PATHS.map((path) => <path key={path} fill="currentColor" d={path} />)}
      </g>
      <g transform="translate(380 0)">
        {BRAND_WORDMARK_PATHS.map((path, index) => (
          <path
            key={path}
            fill={index >= BRAND_WORDMARK_GOLD_START ? "hsl(var(--gold))" : "currentColor"}
            d={path}
          />
        ))}
      </g>
    </svg>
  );
}
