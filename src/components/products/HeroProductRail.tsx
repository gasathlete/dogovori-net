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
    <section aria-labelledby="hero-product-rail-title" data-testid="hero-product-rail" className="w-full">
      <div className="flex flex-col gap-1 border-b border-foreground/80 pb-3 sm:flex-row sm:items-baseline sm:justify-between">
        <h2 id="hero-product-rail-title" className="font-serif text-xl font-bold text-foreground">
          Еднократни продукти
        </h2>
        <p className="text-sm text-muted-foreground">
          {ONE_TIME_SCOPE_NOTE} Покупките още не са активни. Разгледайте примерите.
        </p>
      </div>

      <ul>
        {ONE_TIME_PRODUCTS.map((product) => (
          <li key={product.id} className="border-b border-border">
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
              className="group grid min-h-11 gap-x-6 gap-y-2 py-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-center"
            >
              <span className="min-w-0">
                <span className="block font-semibold text-foreground underline-offset-4 group-hover:underline">{product.name}</span>
                <span className="mt-0.5 block text-sm leading-relaxed text-muted-foreground">{product.shortOutcome}</span>
              </span>
              <ProductPrice id={product.id} size="sm" />
              <span className="hidden items-center gap-1 text-sm font-semibold text-foreground sm:inline-flex">
                Примерен резултат <ArrowRight className="size-4" aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
