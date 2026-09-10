/**
 * Кратък списък с трите продукта — без JavaScript взаимодействие.
 *
 * Стои под витрината на /produkti, за да са налични и индексируеми имената,
 * каноничните връзки, цените и един ред резултат за всеки продукт.
 */
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight } from "@/icons";
import { ProductPrice } from "@/components/products/ProductPrice";
import { ONE_TIME_PRODUCTS, productPath } from "@/lib/products";

export function ProductComparisonList() {
  return (
    <ul
      role="list"
      data-testid="product-comparison-list"
      className="mx-auto grid max-w-4xl gap-3"
    >
      {ONE_TIME_PRODUCTS.map((p) => (
        <li key={p.id}>
          <Link
            to={productPath(p)}
            className="flex min-h-[64px] flex-wrap items-center justify-between gap-x-6 gap-y-2 rounded-xl border border-border/70 bg-card/50 px-4 py-3 transition-colors hover:border-gold/40"
          >
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-foreground">
                {p.name}
              </span>
              <span className="mt-0.5 block text-[13px] leading-snug text-muted-foreground">
                {p.shortOutcome}
              </span>
            </span>
            <span className="flex items-center gap-3">
              <ProductPrice id={p.id} size="sm" />
              <ArrowRight className="size-4 shrink-0 text-gold" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
