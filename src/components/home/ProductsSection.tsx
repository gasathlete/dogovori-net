/**
 * Началната страница — витрина, която следва избрания сегмент:
 * „Частно лице“ → трите еднократни продукта, „Фирма“ → абонаментите.
 */
import { useEffect } from "react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight } from "@/icons";
import { useInView } from "@/hooks/useInView";
import { ProductCatalogGrid } from "@/components/products/ProductCatalogGrid";
import { SubscriptionShowcase } from "@/components/plans/SubscriptionShowcase";
import { AudienceToggle } from "@/components/funnel/AudienceToggle";
import { useAudience } from "@/hooks/useAudience";
import { ONE_TIME_PRODUCTS, PRODUCT_EVENTS } from "@/lib/products";
import { trackFunnelEvent } from "@/lib/funnel";

export function ProductsSection() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.3 });
  const { audience } = useAudience();
  const business = audience === "business";

  useEffect(() => {
    if (!inView) return;
    trackFunnelEvent(
      PRODUCT_EVENTS.sectionViewed,
      { source: "home", variant: "showcase", products: ONE_TIME_PRODUCTS.length },
      { dedupKey: "home|showcase" },
    );
  }, [inView]);

  return (
    <section
      id="produkti"
      aria-labelledby="home-products-title"
      className="container py-10 sm:py-14"
    >
      <div className="eyebrow mb-3 justify-start sm:justify-center">
        <span className="h-px w-8 bg-gold/40" />
        Три продукта, еднократно плащане
      </div>
      <h2
        id="home-products-title"
        className="mb-2 max-w-md text-left font-serif text-3xl font-bold leading-tight text-foreground sm:mx-auto sm:text-center sm:text-4xl"
      >
        Разгледайте нашите продукти
      </h2>
      <p className="mb-7 max-w-xl text-left text-base text-muted-foreground sm:mx-auto sm:text-center">
        Ето как изглежда резултатът при всеки от трите продукта.
      </p>

      <div ref={ref} className="mx-auto max-w-6xl">
        <ProductCatalogGrid source="home" />
      </div>

      <div className="mt-6 text-center">
        <Link
          to="/produkti"
          className="inline-flex min-h-[44px] items-center gap-1.5 text-[13px] font-semibold text-muted-foreground transition-colors hover:text-gold"
        >
          Вижте подробно всеки продукт
          <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>
    </section>
  );
}
