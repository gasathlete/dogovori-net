/**
 * Решетката с трите еднократни продукта. Използва се и на /produkti, и на
 * началната страница — само `variant` се различава.
 */
import { useEffect } from "react";
import { ProductCard, type ProductCardVariant } from "@/components/products/ProductCard";
import { ONE_TIME_PRODUCTS, PRODUCT_EVENTS } from "@/lib/products";
import { trackFunnelEvent } from "@/lib/funnel";

export function ProductCards({
  variant = "full",
  source,
}: {
  variant?: ProductCardVariant;
  source: string;
}) {
  // Събитието описва завършен UI факт: секцията е рендирана и видима.
  useEffect(() => {
    trackFunnelEvent(
      PRODUCT_EVENTS.sectionViewed,
      { source, variant, products: ONE_TIME_PRODUCTS.length },
      { dedupKey: `${source}|${variant}` },
    );
  }, [source, variant]);

  return (
    <ul
      role="list"
      data-testid="product-cards"
      className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      {ONE_TIME_PRODUCTS.map((p) => (
        <ProductCard key={p.id} product={p} variant={variant} source={source} />
      ))}
    </ul>
  );
}
