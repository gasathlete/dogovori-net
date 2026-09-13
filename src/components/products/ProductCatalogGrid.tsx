import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight, FileSearch, FilePen, Handshake } from "@/icons";
import type { LucideIcon } from "@/icons";
import { ProductPrice } from "@/components/products/ProductPrice";
import { ProductResultPreview } from "@/components/products/ProductResultPreview";
import { trackFunnelEvent } from "@/lib/funnel";
import {
  ONE_TIME_PRODUCTS,
  ONE_TIME_TERMS,
  PRODUCT_EVENTS,
  productPath,
  type OneTimeProductId,
} from "@/lib/products";
import { cn } from "@/lib/utils";

const PRODUCT_ICON: Record<OneTimeProductId, LucideIcon> = {
  contract_check: FileSearch,
  contract_improve: FilePen,
  negotiation_package: Handshake,
};

const RECEIVE_COPY: Record<OneTimeProductId, string> = {
  contract_check: "Разбор с находки, точни извадки и следващи стъпки.",
  contract_improve: "Проверка и готов текст за поправка в три варианта.",
  negotiation_package: "Проверка, поправки, план, срокове и две писма.",
};

export function ProductCatalogGrid({ source }: { source: string }) {
  return (
    <div
      data-testid="product-catalog-grid"
      className="grid grid-cols-2 gap-3 lg:grid-cols-3 lg:gap-5"
    >
      {ONE_TIME_PRODUCTS.map((product, index) => {
        const Icon = PRODUCT_ICON[product.id];
        const featured = product.id === "contract_improve";
        const packageProduct = product.id === "negotiation_package";

        return (
          <article
            key={product.id}
            data-testid={`catalog-product-${product.id}`}
            className={cn(
              "group flex min-w-0 flex-col overflow-hidden rounded-2xl border bg-card/45 transition-[border-color,box-shadow,transform] duration-300 motion-reduce:transition-none",
              "hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-elegant motion-reduce:hover:translate-y-0",
              featured ? "border-gold/45 ring-1 ring-gold/15" : "border-border/70",
              packageProduct && "col-span-2 lg:col-span-1",
            )}
          >
            <div className="flex flex-1 flex-col p-3 sm:p-4">
              <div className="flex items-start justify-between gap-2">
                <span className="inline-flex size-11 shrink-0 items-center justify-center rounded-xl border border-gold/30 bg-gold/[0.08] text-gold">
                  <Icon className="size-5" aria-hidden="true" />
                </span>
                <span className="pt-1 font-serif text-xs tabular-nums text-muted-foreground">
                  0{index + 1}
                </span>
              </div>

              <div className="mt-4 min-h-[7.5rem] sm:min-h-[6.75rem]">
                {product.badge && (
                  <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-gold">
                    {product.badge}
                  </p>
                )}
                <h3 className="font-serif text-lg font-bold leading-tight text-foreground sm:text-xl">
                  <Link
                    to={productPath(product)}
                    className="rounded-sm outline-none transition-colors hover:text-gold focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    {product.name}
                  </Link>
                </h3>

                {/* Запазено за бъдещи проверени оценки; не се показва без реален източник. */}
                <div data-testid={`product-rating-slot-${product.id}`} hidden />

                <p className="mt-2 text-base leading-snug text-muted-foreground">
                  {product.shortOutcome}
                </p>
              </div>

              <ProductPrice id={product.id} size="sm" className="mt-3" />

              <div className="mt-4 border-t border-border/60 pt-3">
                <p className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                  Какво получавате
                </p>
                <p className="mt-1 text-base leading-snug text-foreground">
                  {RECEIVE_COPY[product.id]}
                </p>
              </div>
            </div>

            <div
              className="relative mx-3 h-48 overflow-hidden rounded-xl border border-border/70 bg-background/70 sm:mx-4 sm:h-56"
              aria-label={`Примерен резултат за ${product.name}`}
            >
              <div className="pointer-events-none origin-top scale-[0.72] select-none [width:138.89%] [&_button]:hidden" aria-hidden="true">
                <ProductResultPreview productId={product.id} size="compact" className="rounded-none border-0 shadow-none" />
              </div>
              <div className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent" />
            </div>

            <div className="mt-auto p-3 pt-4 sm:p-4 sm:pt-4">
              <Link
                to={product.ctaHref}
                onClick={() =>
                  trackFunnelEvent(PRODUCT_EVENTS.productSelected, {
                    product: product.id,
                    source,
                    variant: "catalog_grid",
                  })
                }
                className="btn-gold btn-press inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-3 text-center text-sm font-bold"
              >
                <span>{product.ctaLabel}</span>
                <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
              </Link>
              <Link
                to={productPath(product)}
                onClick={() =>
                  trackFunnelEvent(PRODUCT_EVENTS.detailsOpened, {
                    product: product.id,
                    source,
                  })
                }
                className="mt-2 inline-flex min-h-11 w-full items-center justify-center text-center text-sm font-semibold text-muted-foreground underline decoration-border underline-offset-4 hover:text-gold"
              >
                Вижте примерния резултат
              </Link>
            </div>
          </article>
        );
      })}

      <p className="col-span-2 text-center text-sm text-muted-foreground lg:col-span-3">
        {ONE_TIME_TERMS}
      </p>
    </div>
  );
}