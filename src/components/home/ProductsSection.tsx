/**
 * Началната страница — продуктите се показват като един работен изглед, който
 * се сменя спокойно, вместо три текстови карти.
 *
 * Цените, връзките и примерните данни идват от общата конфигурация; тук няма
 * литерали.
 */
import { useEffect } from "react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight } from "@/icons";
import { useInView } from "@/hooks/useInView";
import { ProductCatalogGrid } from "@/components/products/ProductCatalogGrid";
import { ONE_TIME_PRODUCTS, PRODUCT_EVENTS } from "@/lib/products";
import { trackFunnelEvent } from "@/lib/funnel";

export function ProductsSection() {
  const { ref, inView } = useInView<HTMLDivElement>({ threshold: 0.3 });

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
      <div className="eyebrow mb-3 justify-center">
        <span className="h-px w-8 bg-gold/40" />
        Три продукта, еднократно плащане
      </div>
      <h2
        id="home-products-title"
        className="mb-2 text-center font-serif text-2xl font-bold text-foreground sm:text-3xl"
      >
        Разгледайте нашите продукти
      </h2>
      <p className="mx-auto mb-6 max-w-xl text-center text-sm text-muted-foreground">
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
