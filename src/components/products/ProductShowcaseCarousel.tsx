/**
 * ProductShowcaseCarousel — една спокойна витрина, изградена от истинския
 * интерфейс на продуктовия резултат.
 *
 * Няма картинки, няма стокови илюстрации и няма фалшиви екранни снимки: всеки
 * панел е `ProductResultPreview` с данни само от `previewData`, обозначени като
 * демонстрация. Цените и връзките идват от `@/lib/products`.
 *
 * Ротацията е бавна и се спира при всяко човешко взаимодействие, при скрита
 * страница и при заявено намалено движение.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowLeft, ArrowRight } from "@/icons";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { ProductPrice } from "@/components/products/ProductPrice";
import { ProductResultPreview } from "@/components/products/ProductResultPreview";
import { PREVIEW_TITLE } from "@/components/products/previewData";
import { trackFunnelEvent } from "@/lib/funnel";
import {
  ONE_TIME_PRODUCTS,
  ONE_TIME_TERMS,
  PRODUCT_EVENTS,
  productPath,
} from "@/lib/products";

/** Едно спокойно завъртане на 7 секунди — без бързо движение. */
export const SHOWCASE_INTERVAL_MS = 7000;
/** Ротацията се връща само след спокойна пауза след взаимодействие. */
export const SHOWCASE_RESUME_MS = 10000;
/** Прагът за плъзгане встрани — вертикалният скрол остава непокътнат. */
const SWIPE_PX = 45;

export function ProductShowcaseCarousel({
  source,
  className,
}: {
  source: string;
  className?: string;
}) {
  const slides = ONE_TIME_PRODUCTS;
  const base = useId();
  const reduced = useReducedMotion();

  const [index, setIndex] = useState(0);
  const [userPaused, setUserPaused] = useState(false);
  const [held, setHeld] = useState(false);
  const [interacting, setInteracting] = useState(false);
  const [pageHidden, setPageHidden] = useState(false);

  const active = slides[index];
  const touch = useRef<{ x: number; y: number } | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const go = useCallback(
    (next: number) => setIndex((n) => (next + slides.length) % slides.length),
    [slides.length],
  );

  /** Всяко човешко действие спира ротацията и я връща след спокойна пауза. */
  const holdForInteraction = useCallback(() => {
    setInteracting(true);
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => setInteracting(false), SHOWCASE_RESUME_MS);
  }, []);

  useEffect(() => {
    return () => {
      if (resumeTimer.current) clearTimeout(resumeTimer.current);
    };
  }, []);

  // Скрита страница (друг таб) не върти нищо.
  useEffect(() => {
    const onVisibility = () => setPageHidden(document.hidden);
    onVisibility();
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  const running = !reduced && !userPaused && !held && !interacting && !pageHidden;

  useEffect(() => {
    if (!running) return;
    const t = setTimeout(() => go(index + 1), SHOWCASE_INTERVAL_MS);
    return () => clearTimeout(t);
  }, [running, index, go]);

  const select = (i: number) => {
    holdForInteraction();
    setIndex(i);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Стрелките работят само върху самата въртележка и контролите ѝ, за да не
    // отнемат стрелките на радио групата вътре в примерния резултат.
    const target = e.target as HTMLElement;
    if (target.closest("[data-showcase-panel]")) return;
    if (e.key === "ArrowRight") {
      e.preventDefault();
      select(index + 1 >= slides.length ? 0 : index + 1);
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      select(index - 1 < 0 ? slides.length - 1 : index - 1);
    }
  };

  const announcement = useMemo(
    () => `Продукт ${index + 1} от ${slides.length}: ${active.name}`,
    [index, slides.length, active.name],
  );

  return (
    <div
      data-testid="product-showcase"
      data-running={running ? "true" : "false"}
      data-active-product={active.id}
      role="group"
      aria-roledescription="въртележка"
      aria-label="Примерни резултати по продукт"
      tabIndex={0}
      onKeyDown={onKeyDown}
      onMouseEnter={() => setHeld(true)}
      onMouseLeave={() => setHeld(false)}
      onFocus={() => setHeld(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setHeld(false);
      }}
      onPointerDownCapture={holdForInteraction}
      onKeyDownCapture={(e) => {
        if ((e.target as HTMLElement).closest("[data-showcase-panel]")) holdForInteraction();
      }}
      className={cn(
        "rounded-2xl border border-border/70 bg-card/40 p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring sm:p-5",
        className,
      )}
    >
      {/* Кой продукт е активен — име, цена, отстъпка, един ред резултат. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h3 className="font-serif text-[19px] font-bold leading-tight text-foreground sm:text-[22px]">
            <Link to={productPath(active)} className="hover:text-gold">
              {active.name}
            </Link>
          </h3>
          <p className="mt-1 max-w-[46ch] text-[13px] leading-snug text-muted-foreground">
            {active.shortOutcome}
          </p>
        </div>
        <ProductPrice id={active.id} size="md" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,270px)_minmax(0,1fr)]">
        {/* Избор на продукт + контроли */}
        <div className="flex flex-col gap-3">
          <div
            role="tablist"
            aria-label="Изберете продукт"
            aria-orientation="vertical"
            className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
          >
            {slides.map((p, i) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                id={`${base}-tab-${p.id}`}
                aria-controls={`${base}-panel-${p.id}`}
                aria-selected={i === index}
                tabIndex={i === index ? 0 : -1}
                onClick={() => select(i)}
                className={cn(
                  "flex min-h-11 shrink-0 items-center gap-2 rounded-xl border px-3 py-2 text-left text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring lg:w-full",
                  i === index
                    ? "border-gold/60 bg-gold/[0.1] text-gold shadow-soft"
                    : "border-border/70 bg-background/60 text-muted-foreground hover:border-gold/40 hover:text-foreground",
                )}
              >
                <span className="font-serif text-[12px] tabular-nums opacity-70">
                  0{i + 1}
                </span>
                <span className="min-w-0 truncate">{p.shortName}</span>
              </button>
            ))}
          </div>

          <div
            data-showcase-controls
            className="flex items-center gap-2"
            aria-label="Управление на въртележката"
          >
            <button
              type="button"
              onClick={() => select(index - 1 < 0 ? slides.length - 1 : index - 1)}
              aria-label="Предишен продукт"
              className="inline-flex size-11 items-center justify-center rounded-xl border border-border/70 text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="size-4" />
            </button>
            <button
              type="button"
              data-testid="showcase-toggle"
              aria-pressed={userPaused}
              onClick={() => setUserPaused((v) => !v)}
              aria-label={userPaused ? "Пусни смяната на продуктите" : "Спри смяната на продуктите"}
              className="inline-flex size-11 items-center justify-center rounded-xl border border-border/70 text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {userPaused ? (
                <Play className="size-4" aria-hidden="true" />
              ) : (
                <Pause className="size-4" aria-hidden="true" />
              )}
            </button>
            <button
              type="button"
              onClick={() => select(index + 1 >= slides.length ? 0 : index + 1)}
              aria-label="Следващ продукт"
              className="inline-flex size-11 items-center justify-center rounded-xl border border-border/70 text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowRight className="size-4" />
            </button>
          </div>

          <p className="text-[11.5px] leading-snug text-muted-foreground">
            Продуктите се сменят сами и спират, докато разглеждате.
          </p>
        </div>

        {/* Изгледът на работния екран — истински интерфейс, примерни данни. */}
        <div
          data-showcase-panel
          onTouchStart={(e) => {
            const t = e.touches[0];
            touch.current = { x: t.clientX, y: t.clientY };
            holdForInteraction();
          }}
          onTouchEnd={(e) => {
            const start = touch.current;
            touch.current = null;
            if (!start) return;
            const t = e.changedTouches[0];
            const dx = t.clientX - start.x;
            const dy = t.clientY - start.y;
            if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) <= Math.abs(dy)) return;
            select(dx < 0 ? index + 1 : index - 1);
          }}
          className="min-w-0"
        >
          <div className="overflow-hidden rounded-2xl border border-border/70 bg-background/70 shadow-elegant">
            <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-3 py-2">
              <span className="flex gap-1" aria-hidden="true">
                <span className="size-2 rounded-full bg-border" />
                <span className="size-2 rounded-full bg-border" />
                <span className="size-2 rounded-full bg-gold/60" />
              </span>
              <span className="truncate text-[11px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                Dogovori.net · работен изглед
              </span>
              <span className="ml-auto shrink-0 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
                {PREVIEW_TITLE}
              </span>
            </div>
            <div className="min-h-[420px] p-2 sm:min-h-[460px] sm:p-3">
              {slides.map((p, i) => (
                <div
                  key={p.id}
                  role="tabpanel"
                  id={`${base}-panel-${p.id}`}
                  aria-labelledby={`${base}-tab-${p.id}`}
                  hidden={i !== index}
                >
                  <ProductResultPreview
                    productId={p.id}
                    size="compact"
                    className="border-0 shadow-none"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
        <Link
          to={active.ctaHref}
          onClick={() =>
            trackFunnelEvent(PRODUCT_EVENTS.productSelected, {
              product: active.id,
              source,
              variant: "showcase",
            })
          }
          className="btn-gold btn-press inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-bold tracking-tight"
        >
          {active.ctaLabel}
          <ArrowRight className="size-4" />
        </Link>
        <Link
          to={productPath(active)}
          onClick={() =>
            trackFunnelEvent(PRODUCT_EVENTS.detailsOpened, {
              product: active.id,
              source,
            })
          }
          className="inline-flex min-h-[44px] items-center text-[13px] font-semibold text-muted-foreground underline decoration-border underline-offset-4 hover:text-gold"
        >
          Вижте продукта
        </Link>
        <span className="text-[11.5px] font-medium text-muted-foreground">
          {ONE_TIME_TERMS}
        </span>
      </div>

      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
