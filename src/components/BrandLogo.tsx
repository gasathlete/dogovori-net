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
  auto: "text-foreground",
  light: "text-navy",
  dark: "text-primary-foreground",
};

/** Одобреният DN знак: D контур, N диагонал и архитектурна везна. */
export function BrandMark({ className, variant = "auto", decorative = false }: BrandMarkProps) {
  return (
    <svg
      viewBox="0 0 128 112"
      width="128"
      height="112"
      role={decorative ? undefined : "img"}
      aria-hidden={decorative || undefined}
      aria-label={decorative ? undefined : "Договори.нет"}
      className={cn("block shrink-0", variantClass[variant], className)}
    >
      <path
        fill="currentColor"
        fillRule="evenodd"
        d="M25 11h37c31 0 48 18 48 45S93 101 62 101H25V11Zm19 17v56h17c19 0 29-10 29-28S80 28 61 28H44Z"
      />
      <path fill="hsl(var(--gold))" d="M47 34v47h15V58l24 23V59L47 34Z" />
      <g fill="none" stroke="hsl(var(--gold))" strokeLinecap="round" strokeLinejoin="round">
        <path strokeWidth="6" d="M8 35h112" />
        <path strokeWidth="4" d="M15 39 5 68m10-29 13 29M111 39 98 68m13-29 12 29" />
        <path strokeWidth="5" d="M3 69h27c-2 9-7 13-14 13S5 78 3 69Zm93 0h29c-2 9-7 13-15 13s-12-4-14-13Z" />
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
      <BrandMark decorative variant={variant} className={compact ? "h-9 w-[41px]" : "h-11 w-[50px]"} />
      <span className={cn("whitespace-nowrap font-sans font-extrabold leading-none", compact ? "text-[19px]" : "text-[22px]")}> 
        Договори<span className="text-gold">.нет</span>
      </span>
    </span>
  );
}
