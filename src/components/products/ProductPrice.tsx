/** Canonical one-off price, payment cadence and verified reference-price saving. */
import {
  getProduct,
  productPreviousPriceLabel,
  type OneTimeProductId,
} from "@/lib/products";
import { fmtEur } from "@/lib/pricing";
import { offerSaving } from "@/lib/offerPresentation";
import { OfferAmount, type OfferSize } from "./OfferPresentation";
import { cn } from "@/lib/utils";

export type ProductPriceSize = OfferSize;

export function ProductPrice({
  id,
  size = "md",
  showLabel = false,
  className,
}: {
  id: OneTimeProductId;
  size?: ProductPriceSize;
  /** Adds tax/subscription terms in detailed contexts. */
  showLabel?: boolean;
  className?: string;
}) {
  const product = getProduct(id);
  const saving = offerSaving(product.priceEur, product.previousPriceEur);

  return (
    <span
      data-testid={`product-price-${id}`}
      className={cn("flex flex-col items-start gap-3", className)}
    >
      <OfferAmount amount={product.priceEur} size={size} period="еднократно" />
      {saving > 0 && <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-xs">
        <s
          data-testid={`product-previous-price-${id}`}
          className="font-medium tabular-nums text-muted-foreground"
        >
          {productPreviousPriceLabel(id)}
        </s>
        <span data-testid={`product-saving-${id}`} className="font-medium tabular-nums text-success">
          Спестявате {fmtEur(saving)}
        </span>
      </span>}
      {showLabel && (
        <span className="text-[12px] font-medium text-muted-foreground">
          С включен ДДС · без абонамент
        </span>
      )}
    </span>
  );
}
