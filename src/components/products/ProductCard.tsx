/**
 * Една карта за продукт — споделя се между /produkti и началната страница.
 * Бизнес копието идва изцяло от `@/lib/products`, за да няма дублиране.
 */
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight, Check } from "@/icons";
import { ProductDemo } from "@/components/products/ProductDemo";
import {
  isFeaturedProduct,
  ONE_TIME_TERMS,
  PRODUCT_EVENTS,
  productPriceLabel,
  type OneTimeProduct,
} from "@/lib/products";
import { trackFunnelEvent } from "@/lib/funnel";

export type ProductCardVariant = "full" | "compact";

export function ProductCard({
  product,
  variant = "full",
  source,
}: {
  product: OneTimeProduct;
  variant?: ProductCardVariant;
  source: string;
}) {
  const compact = variant === "compact";
  const outcomes = compact ? product.outcomes.slice(0, 3) : product.outcomes;
  const headingId = `product-${product.id}-title`;
  // Контролирано подчертаване — по-плътна рамка и дълбочина, без скок в размера.
  const featured = isFeaturedProduct(product.id);

  return (
    <li>
      <article
        aria-labelledby={headingId}
        data-product-id={product.id}
        data-variant={variant}
        data-featured={featured ? "true" : undefined}
        className={
          "group relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl bg-card/60 p-4 transition-all duration-200 hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-elegant sm:p-5 " +
          (featured
            ? "border-2 border-gold/45 shadow-elegant ring-1 ring-gold/15"
            : "border border-border/70 shadow-soft")
        }
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent opacity-60 transition-opacity duration-300 group-hover:opacity-100"
        />

        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {product.badge && (
              <span className="mb-1.5 inline-block rounded-full border border-gold/30 bg-gold/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gold">
                {product.badge}
              </span>
            )}
            <h3
              id={headingId}
              className="font-serif text-[17px] font-bold leading-tight text-foreground sm:text-lg"
            >
              {product.name}
            </h3>
          </div>
          <p className="shrink-0 text-right font-serif text-xl font-bold tabular-nums text-gold sm:text-2xl">
            {productPriceLabel(product.id)}
          </p>
        </header>

        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {product.promise}
        </p>

        <ProductDemo kind={product.demo} />

        <ul className="space-y-1.5">
          {outcomes.map((o) => (
            <li key={o} className="flex items-start gap-2 text-[12.5px] leading-snug text-foreground/85">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
              <span>{o}</span>
            </li>
          ))}
        </ul>

        <p className="mt-auto text-[11px] font-medium text-muted-foreground">
          {ONE_TIME_TERMS}
        </p>

        <Link
          to={product.ctaHref}
          onClick={() =>
            trackFunnelEvent(PRODUCT_EVENTS.productSelected, {
              product: product.id,
              source,
              variant,
            })
          }
          className="btn-gold btn-press inline-flex items-center justify-center gap-2 rounded-xl px-5 py-3 text-[14px] font-bold tracking-tight transition-transform duration-200"
        >
          {product.ctaLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </article>
    </li>
  );
}
