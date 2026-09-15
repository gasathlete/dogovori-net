import { cn } from "@/lib/utils";

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

/** Одобреният DN знак: D контур, N диагонал и архитектурна везна. */
export function BrandMark({ className, variant = "auto", decorative = false }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 400 280"
      width="400"
      height="280"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : "Договори.нет"}
      className={cn("block shrink-0", variantClass[variant], className)}
    >
      <path fill="currentColor" d="M90 0H218C267 0 304 23 328 69H290C274 46 253 35 220 35H126V69H90Z" />
      <path fill="currentColor" d="M90 94H126V239H215C249 239 274 229 290 210H328C302 255 265 275 218 275H90Z" />
      <path fill="currentColor" d="M234 93H270V227L234 239Z" />
      <g fill="hsl(var(--gold))">
        <path d="M140 64V128L228 215V151Z" />
        <path d="M30 78H134V92H30Z" />
        <path d="M234 78H365V92H234Z" />
        <path d="M0 173H92L76 201H17Z" />
        <path d="M298 173H390L374 201H315Z" />
      </g>
      <g fill="none" stroke="hsl(var(--gold))" strokeWidth="10" strokeLinecap="butt" strokeLinejoin="miter">
        <path d="M45 90L9 173M45 90L81 173" />
        <path d="M343 90L307 173M343 90L379 173" />
      </g>
    </svg>
  );
}

/** Хоризонтален бранд знак без слоган; текстът остава четим и достъпен. */
export function BrandLogo({ className, variant = "auto", compact = false }: BrandLogoProps) {
  return (
    <span
      className={cn("inline-flex min-w-0 items-center", compact ? "gap-2" : "gap-3", variantClass[variant], className)}
      aria-label="Договори.нет"
    >
      <BrandMark decorative variant={variant} className={compact ? "h-9 w-[52px]" : "h-11 w-[63px]"} />
      <span className={cn("whitespace-nowrap font-sans font-extrabold leading-none", compact ? "text-[19px]" : "text-[22px]")}> 
        Договори<span className="text-gold">.нет</span>
      </span>
    </span>
  );
}
