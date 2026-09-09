/**
 * Ранен продуктов ред в hero-а — трите продукта се виждат при първия кратък
 * скрол на 360/390/430 px. Всеки елемент е истинска връзка към собствената си
 * страница (обхождаема от търсачките). Без автоматичен въртележка и без popup.
 */
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { trackFunnelEvent } from "@/lib/funnel";
import {
  ONE_TIME_PRODUCTS,
  PRODUCT_EVENTS,
  productPath,
  productPriceLabel,
} from "@/lib/products";

export function HeroProductRail() {
  return (
    <section
      aria-labelledby="hero-product-rail-title"
      data-testid="hero-product-rail"
      className="mx-auto mt-6 w-full max-w-[640px]"
    >
      <div className="flex items-baseline justify-between gap-3 px-0.5">
        <h2
          id="hero-product-rail-title"
          className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
        >
          Изберете резултат
        </h2>
        <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
          еднократно
        </span>
      </div>

      <ul className="mt-2 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-3 sm:overflow-visible">
        {ONE_TIME_PRODUCTS.map((product) => (
          <li
            key={product.id}
            className="min-w-[62%] shrink-0 snap-start sm:min-w-0 sm:shrink"
          >
            <Link
              to={productPath(product)}
              data-product-id={product.id}
              onClick={() =>
                trackFunnelEvent(PRODUCT_EVENTS.productSelected, {
                  product: product.id,
                  source: "hero_rail",
                  variant: "rail",
                })
              }
              className="group flex min-h-[64px] flex-col justify-center gap-1 rounded-xl border border-gold/25 bg-card/70 px-3.5 py-2.5 text-left transition-colors hover:border-gold/60 focus-visible:border-gold focus-visible:outline-none aria-[current=page]:border-gold"
            >
              <span className="text-[13px] font-semibold leading-snug text-foreground">
                {product.name}
              </span>
              <span className="font-serif text-[16px] font-bold tabular-nums text-gold">
                {productPriceLabel(product.id)}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
