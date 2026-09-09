/**
 * Мобилната витрина: един екран = едно решение.
 *
 * Три опции в стабилен сегментен превключвател (без хоризонтален скрол) и
 * САМО един отворен панел. Останалите резултати и условията живеят в native
 * `<details>`, за да не се получава стена от текст.
 *
 * Цени и копие идват единствено от `@/lib/products`.
 */
import { useId, useRef, useState } from "react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight, Check } from "@/icons";
import { ProductDemo } from "@/components/products/ProductDemo";
import { useInView } from "@/hooks/useInView";
import {
  ONE_TIME_PRODUCTS,
  ONE_TIME_TERMS,
  PRODUCT_EVENTS,
  productPriceLabel,
  type OneTimeProductId,
} from "@/lib/products";
import { trackFunnelEvent } from "@/lib/funnel";

/** Най-лесната конверсия е първа и е избрана по подразбиране. */
export const DEFAULT_MOBILE_PRODUCT: OneTimeProductId = "contract_check";

export function MobileProductSwitcher({ source }: { source: string }) {
  const [selected, setSelected] = useState<OneTimeProductId>(DEFAULT_MOBILE_PRODUCT);
  const baseId = useId();
  const tabRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const { ref: panelRef, inView } = useInView<HTMLDivElement>();

  const product = ONE_TIME_PRODUCTS.find((p) => p.id === selected)!;
  const [firstOutcome, secondOutcome, ...restOutcomes] = product.outcomes;
  const tabId = (id: string) => `${baseId}-tab-${id}`;
  const panelId = (id: string) => `${baseId}-panel-${id}`;

  const select = (id: OneTimeProductId) => {
    if (id === selected) return;
    setSelected(id);
    trackFunnelEvent(PRODUCT_EVENTS.productSelected, {
      product: id,
      source,
      variant: "mobile",
      interaction: "tab",
    });
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const idx = ONE_TIME_PRODUCTS.findIndex((p) => p.id === selected);
    let next = -1;
    if (e.key === "ArrowRight") next = (idx + 1) % ONE_TIME_PRODUCTS.length;
    if (e.key === "ArrowLeft") next = (idx - 1 + ONE_TIME_PRODUCTS.length) % ONE_TIME_PRODUCTS.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = ONE_TIME_PRODUCTS.length - 1;
    if (next < 0) return;
    e.preventDefault();
    const id = ONE_TIME_PRODUCTS[next].id;
    select(id);
    tabRefs.current[id]?.focus();
  };

  return (
    <div data-testid="mobile-product-switcher" className="mx-auto w-full max-w-md">
      <div
        role="tablist"
        aria-label="Изберете продукт"
        onKeyDown={onKeyDown}
        className="grid grid-cols-3 gap-1 rounded-xl border border-border/70 bg-card/50 p-1"
      >
        {ONE_TIME_PRODUCTS.map((p) => {
          const active = p.id === selected;
          return (
            <button
              key={p.id}
              ref={(el) => {
                tabRefs.current[p.id] = el;
              }}
              type="button"
              role="tab"
              id={tabId(p.id)}
              aria-selected={active}
              aria-controls={panelId(p.id)}
              tabIndex={active ? 0 : -1}
              onClick={() => select(p.id)}
              className={
                "flex min-h-[52px] flex-col items-center justify-center gap-0.5 rounded-lg px-1 text-center transition-all duration-200 active:scale-[0.98] " +
                (active
                  ? "bg-gold/[0.14] text-gold ring-1 ring-gold/50"
                  : "text-muted-foreground hover:text-foreground")
              }
            >
              <span className="text-[11.5px] font-semibold leading-tight">{p.shortName}</span>
              <span className="text-[11px] font-bold tabular-nums">
                {productPriceLabel(p.id)}
              </span>
            </button>
          );
        })}
      </div>

      <div
        ref={panelRef}
        role="tabpanel"
        id={panelId(product.id)}
        aria-labelledby={tabId(product.id)}
        data-testid="mobile-product-panel"
        data-product-id={product.id}
        key={product.id}
        className="mt-3 flex flex-col gap-3 rounded-2xl border border-gold/25 bg-card/70 p-4 shadow-elegant motion-safe:animate-panel-pop"
      >
        {product.badge && (
          <span className="inline-block w-fit rounded-full border border-gold/30 bg-gold/[0.08] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-gold">
            {product.badge}
          </span>
        )}

        <div className="flex items-end justify-between gap-3">
          <h3 className="min-w-0 font-serif text-[19px] font-bold leading-tight text-foreground">
            {product.name}
          </h3>
          <p
            data-testid="mobile-product-price"
            className="shrink-0 font-serif text-[30px] font-bold leading-none tabular-nums text-gold"
          >
            {productPriceLabel(product.id)}
          </p>
        </div>

        <p className="text-[13px] leading-relaxed text-muted-foreground">
          {product.promise}
        </p>

        <ProductDemo kind={product.demo} active={inView} />

        <ul data-testid="mobile-product-outcomes" className="space-y-1.5">
          {[firstOutcome, secondOutcome].filter(Boolean).map((o) => (
            <li
              key={o}
              className="flex items-start gap-2 text-[13px] leading-snug text-foreground/90"
            >
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" />
              <span>{o}</span>
            </li>
          ))}
        </ul>

        <Link
          to={product.ctaHref}
          onClick={() =>
            trackFunnelEvent(PRODUCT_EVENTS.productSelected, {
              product: product.id,
              source,
              variant: "mobile",
              interaction: "cta",
            })
          }
          className="btn-gold btn-press inline-flex min-h-[54px] items-center justify-center gap-2 rounded-xl px-5 text-[16px] font-bold tracking-tight transition-transform duration-200"
        >
          {product.ctaLabel}
          <ArrowRight className="h-4 w-4" />
        </Link>

        <details
          data-testid="mobile-product-details"
          className="group rounded-lg border border-border/60 bg-background/40"
          onToggle={(e) => {
            if ((e.currentTarget as HTMLDetailsElement).open) {
              trackFunnelEvent(
                PRODUCT_EVENTS.detailsOpened,
                { product: product.id, source, variant: "mobile" },
                // Отварянето е факт веднъж за (източник, продукт).
                { dedupKey: `${source}|${product.id}` },
              );
            }
          }}
        >
          <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between px-3 text-[13px] font-semibold text-foreground/85">
            Какво получавам
            <span aria-hidden="true" className="text-gold transition-transform group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="border-t border-border/50 px-3 py-2.5">
            {restOutcomes.length > 0 && (
              <ul className="space-y-1.5">
                {restOutcomes.map((o) => (
                  <li
                    key={o}
                    className="flex items-start gap-2 text-[12.5px] leading-snug text-muted-foreground"
                  >
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold/70" />
                    <span>{o}</span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-2.5 text-[11.5px] font-medium text-muted-foreground">
              {ONE_TIME_TERMS}
            </p>
          </div>
        </details>
      </div>
    </div>
  );
}
