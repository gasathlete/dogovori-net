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
      className="mx-auto mt-6 w-full max-w-[640px]"
    >
      <div className="px-0.5">
        <h2
          id="hero-product-rail-title"
          className="text-[12px] font-semibold uppercase tracking-[0.18em] text-muted-foreground"
        >
          Еднократни продукти
        </h2>
        <p className="mt-0.5 text-[13px] text-muted-foreground">
          {ONE_TIME_SCOPE_NOTE}
        </p>
      </div>

      <ul className="mt-2 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden sm:grid sm:grid-cols-3 sm:overflow-visible">
        {ONE_TIME_PRODUCTS.map((product) => (
          <li
            key={product.id}
            className="w-[72%] shrink-0 snap-start sm:w-auto sm:min-w-0 sm:shrink"
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
              className="group flex min-h-[92px] flex-row items-center justify-between gap-2 rounded-xl border border-gold/25 bg-card/70 px-3.5 py-3 text-left transition-colors hover:border-gold/60 focus-visible:border-gold focus-visible:outline-none aria-[current=page]:border-gold"
            >
              <span className="flex min-w-0 flex-col gap-1.5">
                <span className="text-[14px] font-semibold leading-snug text-foreground">
                  {product.name}
                </span>
                <span className="text-[12.5px] leading-snug text-muted-foreground">
                  {product.shortOutcome}
                </span>
                <ProductPrice id={product.id} size="sm" />
              </span>
              <ArrowRight
                className="size-5 shrink-0 text-muted-foreground transition-colors group-hover:text-gold"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
