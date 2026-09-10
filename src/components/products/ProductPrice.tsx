/**
 * Едно място, което показва цената на еднократен продукт: стара цена
 * задраскана, текуща цена и точният процент намаление.
 *
 * Числата и процентите идват единствено от `@/lib/products` — тук няма
 * литерали, брояч, краен срок или измислена икономия.
 */
import {
  PRICE_INTRO_LABEL,
  productDiscountLabel,
  productPreviousPriceLabel,
  productPriceLabel,
  type OneTimeProductId,
} from "@/lib/products";
import { cn } from "@/lib/utils";

export type ProductPriceSize = "sm" | "md" | "lg";

const CURRENT: Record<ProductPriceSize, string> = {
  sm: "text-[17px]",
  md: "text-[22px] sm:text-[24px]",
  lg: "text-[30px] sm:text-[34px]",
};

export function ProductPrice({
  id,
  size = "md",
  showLabel = false,
  className,
}: {
  id: OneTimeProductId;
  size?: ProductPriceSize;
  /** Показва тихия етикет „Въвеждаща цена“ под сумите. */
  showLabel?: boolean;
  className?: string;
}) {
  const discount = productDiscountLabel(id);

  return (
    <span
      data-testid={`product-price-${id}`}
      className={cn("flex flex-col items-start gap-0.5", className)}
    >
      <span className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span
          className={cn(
            "font-serif font-bold tabular-nums text-gold",
            CURRENT[size],
          )}
        >
          {productPriceLabel(id)}
        </span>
        <s
          data-testid={`product-previous-price-${id}`}
          className="text-[13px] font-medium tabular-nums text-muted-foreground"
        >
          {productPreviousPriceLabel(id)}
        </s>
        {discount && (
          <span
            data-testid={`product-discount-${id}`}
            className="rounded-full border border-gold/40 bg-gold/[0.1] px-2 py-0.5 text-[12px] font-semibold tabular-nums text-gold"
          >
            {discount}
          </span>
        )}
      </span>
      {showLabel && (
        <span className="text-[12px] font-medium text-muted-foreground">
          {PRICE_INTRO_LABEL}
        </span>
      )}
    </span>
  );
}
