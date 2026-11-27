/**
 * Отговорната витрина с трите еднократни продукта.
 *
 * Едно и също съдържание на телефон и на десктоп — трите карти винаги са в
 * DOM (изискване за еднакво основно съдържание при двата размера). На телефон
 * подредбата е в една колона и по-компактна, на десктоп — три карти.
 */
import { useEffect } from "react";
import { ProductCard, type ProductCardVariant } from "@/components/products/ProductCard";
import { useIsMobileViewport } from "@/hooks/useMediaQuery";
import { useInView } from "@/hooks/useInView";
import { ONE_TIME_PRODUCTS, PRODUCT_EVENTS } from "@/lib/products";
import { trackFunnelEvent } from "@/lib/funnel";

export function ProductCards({
  variant = "full",
  source,
}: {
  variant?: ProductCardVariant;
  source: string;
}) {
  const isMobile = useIsMobileViewport();
  const layout = isMobile ? "mobile" : variant;
  // Фактът „секцията е видяна" е верен само когато наистина влезе в изгледа.
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.4 });

  useEffect(() => {
    if (!inView) return;
    trackFunnelEvent(
      PRODUCT_EVENTS.sectionViewed,
      { source, variant: layout, products: ONE_TIME_PRODUCTS.length },
      { dedupKey: `${source}|${layout}` },
    );
  }, [inView, source, layout]);

  return (
    <div ref={ref} data-testid="product-cards" data-layout={layout}>
      <ul
        role="list"
        data-testid="product-card-grid"
        className="mx-auto grid max-w-5xl gap-4 sm:grid-cols-2 lg:grid-cols-3"
      >
        {ONE_TIME_PRODUCTS.map((p) => (
          <ProductCard
            key={p.id}
            product={p}
            variant={isMobile ? "compact" : variant}
            source={source}
          />
        ))}
      </ul>
    </div>
  );
}
