/**
 * Ранен продуктов ред в hero-а — трите продукта се виждат при първия кратък
 * скрол на 360/390/430 px. Всеки елемент е истинска връзка към собствената си
 * страница (обхождаема от търсачките). Без автоматичен въртележка и без popup.
 */
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight } from "@/icons";
import { trackFunnelEvent } from "@/lib/funnel";
import { ProductPrice } from "@/components/products/ProductPrice";

import { Button } from "@/components/ui/button";
import {
  ONE_TIME_PRODUCTS,
  ONE_TIME_SCOPE_NOTE,
  PRODUCT_EVENTS,
  productPath,
  ONE_TIME_PURCHASES_AVAILABLE,
} from "@/lib/products";

export function HeroProductRail() {
  return (
    <section aria-labelledby="hero-product-rail-title" data-testid="hero-product-rail" className="w-full">
      <div className="flex flex-col gap-1 border-b border-foreground/80 pb-3 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 id="hero-product-rail-title" className="font-serif text-xl font-bold text-foreground">
          Еднократни продукти
        </h2>
        <p className="text-sm text-muted-foreground">
          {ONE_TIME_SCOPE_NOTE} Разгледайте примерите преди покупка.
        </p>
      </div>

      <ul className="hero-commerce-products mt-4 grid gap-3 lg:grid-cols-3">
        {ONE_TIME_PRODUCTS.map((product) => (
          <li key={product.id} className="hero-commerce-product flex min-w-0 flex-col border border-border p-4 sm:p-5">
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
              className="group flex min-h-11 flex-col gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="min-w-0">
                <span className="block font-serif text-xl font-bold leading-tight text-foreground underline-offset-4 group-hover:underline">{product.name}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">{product.shortOutcome}</span>
              </span>
              <ProductPrice id={product.id} size="md" />
              <span className="inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-foreground">
                Примерен резултат <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            </Link>
            
            
            <Button asChild variant="outline" className="mt-3 h-auto min-h-11 whitespace-normal text-left">
              <Link to={ONE_TIME_PURCHASES_AVAILABLE ? product.ctaHref : productPath(product)}>
                {ONE_TIME_PURCHASES_AVAILABLE ? product.ctaLabel : "Вижте продукта"}<ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
