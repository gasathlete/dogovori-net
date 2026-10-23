/**
 * Трите продукта като статични, индексируеми записи — без JavaScript.
 *
 * Всеки запис носи резултата, какво получавате, точната цена и една връзка към
 * продуктовата страница. Йерархията е визуална:
 * най-лесно начало, препоръчано и пълен пакет. Цените идват от @/lib/products.
 */
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight, Check } from "@/icons";
import { ProductPrice } from "@/components/products/ProductPrice";
import { ProductOutputVisual } from "@/components/products/ProductOutputVisual";
import {
  ONE_TIME_PRODUCTS,
  productPath,
  type OneTimeProductId,
} from "@/lib/products";
import { cn } from "@/lib/utils";


const CARD_TONE: Record<OneTimeProductId, string> = {
  contract_check: "border-border/70 bg-card/50",
  contract_improve: "border-gold/45 bg-gold/[0.05] ring-1 ring-gold/25",
  negotiation_package: "border-gold/30 bg-navy/[0.06]",
};

/** Колко реда от резултата се показват — пакетът е материално по-силен. */
const RECEIVE_LINES: Record<OneTimeProductId, number> = {
  contract_check: 3,
  contract_improve: 3,
  negotiation_package: 5,
};

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
            data-testid={`product-entry-${p.id}`}
            className={cn(
              "brand-product block rounded-2xl border px-4 py-4 transition-colors hover:border-gold/60 sm:px-5",
              CARD_TONE[p.id],
            )}
          >
            <span className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
              <span className="min-w-0 flex-1">
                <span className="mt-1 block font-serif text-xl font-bold leading-snug text-foreground">
                  {p.name}
                </span>
                <span className="mt-1 block text-[13.5px] leading-snug text-muted-foreground">
                  {p.shortOutcome}
                </span>
              </span>
              <span className="flex shrink-0 flex-col items-start gap-1">
                <ProductPrice id={p.id} size="sm" />
                <span className="text-sm font-medium text-muted-foreground">
                  еднократно
                </span>
              </span>
            </span>

            <ProductOutputVisual productId={p.id} />
            <span
              className="mt-3 block border-t border-border/60 pt-3"
              data-testid={`product-entry-receive-${p.id}`}
            >
              <span className="block text-sm font-semibold text-muted-foreground">
                Получавате
              </span>
              <span className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                {p.outcomes.slice(0, RECEIVE_LINES[p.id]).map((item) => (
                  <span
                    key={item}
                    className="flex items-start gap-2 text-[13px] leading-snug text-foreground/85"
                  >
                    <Check className="mt-0.5 size-3.5 shrink-0 text-success" aria-hidden="true" />
                    <span className="min-w-0">{item}</span>
                  </span>
                ))}
              </span>
            </span>

            <span className="mt-3 flex min-h-[44px] items-center gap-1.5 text-[13.5px] font-semibold text-gold">
              Вижте продукта
              <ArrowRight className="size-4 shrink-0" aria-hidden="true" />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
