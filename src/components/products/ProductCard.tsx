/**
 * Една карта за продукт — споделя се между /produkti и началната страница.
 * Бизнес копието идва изцяло от `@/lib/products`, за да няма дублиране.
 */
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight, Check } from "@/icons";
import { ProductResultPreview } from "@/components/products/ProductResultPreview";
import { ProductPrice } from "@/components/products/ProductPrice";
import {
  isFeaturedProduct,
  isPremiumProduct,
  ONE_TIME_TERMS,
  PRODUCT_EVENTS,
  ONE_TIME_PURCHASES_AVAILABLE,
  productPath,
  type OneTimeProduct,
} from "@/lib/products";
import { trackFunnelEvent } from "@/lib/funnel";
import { LaunchPurchaseBanner } from "@/components/prelaunch/LaunchPurchaseBanner";

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
  // Три ясни резултата на картата — пълният списък живее на страницата на продукта.
  const outcomes = product.outcomes.slice(0, 3);
  const headingId = `product-${product.id}-title`;
  // Контролирано подчертаване — по-плътна рамка и дълбочина, без скок в размера.
  const featured = isFeaturedProduct(product.id);
  // Пакетът за професионалисти — по-плътен тъмносин фон, същият размер.
  const premium = isPremiumProduct(product.id);

  return (
    <li>
      <article
        aria-labelledby={headingId}
        data-product-id={product.id}
        data-variant={variant}
        data-featured={featured ? "true" : undefined}
        className={
          "brand-product group relative flex h-full flex-col gap-3 overflow-hidden rounded-2xl p-4 transition-colors duration-200 hover:border-gold/50 sm:p-5 " +
          (premium ? "bg-navy/[0.04] " : "bg-card/60 ") +
          (featured || premium
            ? "border-2 border-gold/45 shadow-elegant ring-1 ring-gold/15"
            : "border border-border/70 shadow-soft")
        }
      >

        <header className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            {product.badge && (
              <span className="mb-2 block text-sm font-medium text-muted-foreground">
                {product.badge}
              </span>
            )}
            <h3
              id={headingId}
              className="font-serif text-[17px] font-bold leading-tight text-foreground sm:text-lg"
            >
              <Link
                to={productPath(product)}
                className="rounded-sm outline-none transition-colors hover:text-gold focus-visible:ring-2 focus-visible:ring-gold/60"
              >
                {product.name}
              </Link>
            </h3>
          </div>
          <ProductPrice
            id={product.id}
            size={compact ? "sm" : "md"}
            className="shrink-0 items-end text-right"
          />
        </header>

        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {product.promise}
        </p>

        {!compact && (
          <ProductResultPreview productId={product.id} size="compact" />
        )}

        <ul className="space-y-1.5">
          {outcomes.map((o) => (
            <li key={o} className="flex items-start gap-2 text-[12.5px] leading-snug text-foreground/85">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-success" />
              <span>{o}</span>
            </li>
          ))}
        </ul>

        <p className="mt-auto text-[11px] font-medium text-muted-foreground">
          {ONE_TIME_TERMS}
        </p>

        {!ONE_TIME_PURCHASES_AVAILABLE && (
          <LaunchPurchaseBanner compact source="product_card" productId={product.id} />
        )}

        <Link
          to={productPath(product)}
          onClick={() =>
            trackFunnelEvent(ONE_TIME_PURCHASES_AVAILABLE ? PRODUCT_EVENTS.productSelected : PRODUCT_EVENTS.detailsOpened, {
              product: product.id,
              source,
              variant,
            })
          }
          className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl border border-gold/40 px-5 py-3 text-[14px] font-bold text-gold transition-colors hover:bg-gold/10"
        >
          {ONE_TIME_PURCHASES_AVAILABLE ? product.ctaLabel : "Вижте продукта"}
          <ArrowRight className="h-4 w-4" />
        </Link>
      </article>
    </li>
  );
}
