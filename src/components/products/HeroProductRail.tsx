/**
 * Ранен продуктов ред в hero-а — трите продукта се виждат при първия кратък
 * скрол на 360/390/430 px. Всеки елемент е истинска връзка към собствената си
 * страница (обхождаема от търсачките). Без автоматичен въртележка и без popup.
 */
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight } from "@/icons";
import { trackFunnelEvent } from "@/lib/funnel";
import { ProductPrice } from "@/components/products/ProductPrice";
import {
  ONE_TIME_PRODUCTS,
  ONE_TIME_SCOPE_NOTE,
  PRODUCT_EVENTS,
  productPath,
} from "@/lib/products";

export function HeroProductRail() {
  return (
    <section
      aria-labelledby="hero-product-rail-title"
      data-testid="hero-product-rail"
      className="mx-auto mt-8 w-full max-w-5xl"
    >
      <div className="px-0.5 text-center">
        <h2
          id="hero-product-rail-title"
          className="text-[13px] font-semibold uppercase tracking-[0.2em] text-gold/80"
        >
          Еднократни продукти
        </h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {ONE_TIME_SCOPE_NOTE}
        </p>
      </div>

      <ul className="mt-4 flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-3 sm:gap-4 sm:overflow-visible">
        {ONE_TIME_PRODUCTS.map((product) => (
          <li
            key={product.id}
            className="w-[80%] shrink-0 snap-start sm:w-auto sm:min-w-0 sm:shrink"
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
              className="group relative flex min-h-[168px] flex-col justify-between gap-3 overflow-hidden rounded-2xl border border-gold/30 bg-card/80 px-5 py-5 text-left shadow-lg transition-all duration-300 hover:-translate-y-1 hover:border-gold/70 hover:shadow-xl focus-visible:border-gold focus-visible:outline-none aria-[current=page]:border-gold motion-reduce:transition-none motion-reduce:hover:translate-y-0 sm:min-h-[188px] sm:px-6"
            >
              {/* Златен акцент като при рекламния банер */}
              <span
                aria-hidden="true"
                className="absolute inset-x-0 top-0 h-1 bg-gold"
              />
              <span
                aria-hidden="true"
                className="pointer-events-none absolute -right-10 -top-10 h-28 w-28 rounded-full bg-gold/10 blur-2xl transition-opacity duration-300 group-hover:bg-gold/20"
              />

              <span className="flex min-w-0 flex-col gap-2">
                <span className="text-[16px] font-bold leading-snug text-foreground sm:text-[17px]">
                  {product.name}
                </span>
                <span className="text-[13.5px] leading-relaxed text-muted-foreground">
                  {product.shortOutcome}
                </span>
              </span>

              <span className="flex items-end justify-between gap-2">
                <ProductPrice id={product.id} size="md" />
                <span
                  aria-hidden="true"
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold transition-all duration-300 group-hover:translate-x-0.5 group-hover:bg-gold group-hover:text-primary-foreground motion-reduce:transition-none"
                >
                  <ArrowRight className="size-5" />
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
