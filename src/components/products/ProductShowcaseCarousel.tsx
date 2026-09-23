/**
 * ProductShowcaseCarousel — една спокойна витрина, изградена от истинския
 * интерфейс на продуктовия резултат.
 *
 * Няма картинки, няма стокови илюстрации и няма фалшиви екранни снимки: всеки
 * панел е `ProductResultPreview` с данни само от `previewData`, обозначени като
 * демонстрация. Цените и връзките идват от `@/lib/products`.
 *
 * Ротацията е бавна и се спира при всяко човешко взаимодействие, при скрита
 * страница и при заявено намалено движение. Автоматичната смяна НЕ се обявява
 * на екранен четец — обявяваме само след изрично човешко действие.
 */
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowLeft, ArrowRight } from "@/icons";
import { Pause, Play } from "lucide-react";
import { cn } from "@/lib/utils";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { ProductPrice } from "@/components/products/ProductPrice";
import { ProductResultPreview } from "@/components/products/ProductResultPreview";
import { trackFunnelEvent } from "@/lib/funnel";
import {
  ONE_TIME_PRODUCTS,
  ONE_TIME_TERMS,
  PRODUCT_EVENTS,
  ONE_TIME_PURCHASES_AVAILABLE,
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
  /** Обявява се само след човешко действие; при автоматична смяна е празно. */
  const [announcement, setAnnouncement] = useState("");

  const active = slides[index];
  const touch = useRef<{ x: number; y: number } | null>(null);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

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
    const t = setTimeout(
      () => setIndex((n) => (n + 1) % slides.length),
      SHOWCASE_INTERVAL_MS,
    );
    return () => clearTimeout(t);
  }, [running, index, slides.length]);

  /** Човешки избор: спира ротацията и обявява кратко кой продукт е активен. */
  const select = useCallback(
    (i: number, opts?: { focusTab?: boolean }) => {
      const next = (i + slides.length) % slides.length;
      holdForInteraction();
      setIndex(next);
      setAnnouncement(
        `Продукт ${next + 1} от ${slides.length}: ${slides[next].name}`,
      );
      if (opts?.focusTab) tabRefs.current[next]?.focus();
    },
    [holdForInteraction, slides],
  );

  /** Клавиатурна навигация през трите селектора, с местене на фокуса. */
  const onTabsKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const map: Record<string, number | undefined> = {
      ArrowRight: index + 1,
      ArrowDown: index + 1,
      ArrowLeft: index - 1,
      ArrowUp: index - 1,
      Home: 0,
      End: slides.length - 1,
    };
    const next = map[e.key];
    if (next === undefined) return;
    e.preventDefault();
    e.stopPropagation();
    select(next, { focusTab: true });
  };

  return (
    <div
      data-testid="product-showcase"
      data-running={running ? "true" : "false"}
      data-active-product={active.id}
      role="group"
      aria-roledescription="въртележка"
      aria-label="Примерни резултати по продукт"
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
        "rounded-2xl border border-border/70 bg-card/40 p-3 sm:p-5",
        className,
      )}
    >
      {/* Кой продукт е активен — име, цена, отстъпка, един ред резултат. */}
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div className="min-w-0">
          <h3 className="font-serif text-[22px] font-bold leading-tight tracking-tight text-foreground sm:text-[26px]">
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
            onKeyDown={onTabsKeyDown}
            className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0"
          >
            {slides.map((p, i) => (
              <button
                key={p.id}
                type="button"
                role="tab"
                ref={(el) => {
                  tabRefs.current[i] = el;
                }}
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
              onClick={() => select(index - 1)}
              aria-label="Предишен продукт"
              className="inline-flex size-11 items-center justify-center rounded-xl border border-border/70 text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowLeft className="size-4" />
            </button>
            {!reduced && (
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
            )}
            <button
              type="button"
              onClick={() => select(index + 1)}
              aria-label="Следващ продукт"
              className="inline-flex size-11 items-center justify-center rounded-xl border border-border/70 text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <ArrowRight className="size-4" />
            </button>
          </div>

          <p
            data-testid="showcase-rotation-note"
            className="text-[11.5px] leading-snug text-muted-foreground"
          >
            {reduced
              ? "Автоматичната смяна е изключена."
              : "Продуктите се сменят сами и спират, докато разглеждате."}
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
          to={ONE_TIME_PURCHASES_AVAILABLE ? active.ctaHref : productPath(active)}
          onClick={() =>
            trackFunnelEvent(ONE_TIME_PURCHASES_AVAILABLE ? PRODUCT_EVENTS.productSelected : PRODUCT_EVENTS.detailsOpened, {
              product: active.id,
              source,
              variant: "showcase",
            })
          }
          className="btn-gold btn-press inline-flex min-h-[48px] items-center justify-center gap-2 rounded-xl px-5 text-[15px] font-bold tracking-tight"
        >
          {ONE_TIME_PURCHASES_AVAILABLE ? active.ctaLabel : "Вижте продукта"}
          <ArrowRight className="size-4" />
        </Link>
        {ONE_TIME_PURCHASES_AVAILABLE && <Link
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
        </Link>}
        <span className="text-[11.5px] font-medium text-muted-foreground">
          {ONE_TIME_TERMS}
        </span>
      </div>

      <p aria-live="polite" data-testid="showcase-live" className="sr-only">
        {announcement}
      </p>
    </div>
  );
}
