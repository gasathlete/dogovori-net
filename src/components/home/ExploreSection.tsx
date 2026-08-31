/**
 * ExploreSection — разгъващ се панел за началната страница.
 *
 * Прогресивно разгръщане: човек вижда само заглавие + едно изречение и
 * отваря само това, което го интересува. Съдържанието остава в DOM-а
 * (скрито с `hidden`), за да не се губи текст за търсачките.
 *
 * Дълбочина на преживяването:
 *  - `ExploreAccordion` държи един отворен панел (фокус върху една тема);
 *  - при отваряне панелът се позиционира точно под хедъра и заема един екран;
 *  - вътре в панела има лепкава лента с „Затвори" и „Следващо";
 *  - състоянието се синхронизира с URL хеша (deep link и споделяне);
 *  - клавиатурна навигация със стрелки между заглавията на панелите.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { ChevronDown, ChevronRight, X } from "@/icons";
import { cn } from "@/lib/utils";
import { trackMetric } from "@/lib/metrics";

/* ------------------------------------------------------------------ */
/* Контекст: един отворен панел + регистър за навигация               */
/* ------------------------------------------------------------------ */

interface AccordionCtx {
  openId: string | null;
  setOpenId: (id: string | null) => void;
  register: (id: string, el: HTMLButtonElement | null) => void;
  order: string[];
  focusRelative: (id: string, dir: 1 | -1) => void;
}

const AccordionContext = createContext<AccordionCtx | null>(null);

/** Обвивка около групата панели — гарантира, че е отворен само един. */
export function ExploreAccordion({
  children,
  defaultOpenId = null,
}: {
  children: ReactNode;
  /** Панел, отворен при първо зареждане (ако няма хеш в URL). */
  defaultOpenId?: string | null;
}) {
  const [openId, setOpenId] = useState<string | null>(defaultOpenId);
  const triggers = useRef(new Map<string, HTMLButtonElement>());
  const [order, setOrder] = useState<string[]>([]);

  const register = useCallback((id: string, el: HTMLButtonElement | null) => {
    if (el) {
      triggers.current.set(id, el);
    } else {
      triggers.current.delete(id);
    }
    setOrder(Array.from(triggers.current.keys()));
  }, []);

  const focusRelative = useCallback(
    (id: string, dir: 1 | -1) => {
      const ids = Array.from(triggers.current.keys());
      const idx = ids.indexOf(id);
      if (idx === -1) return;
      const next = ids[(idx + dir + ids.length) % ids.length];
      triggers.current.get(next)?.focus();
    },
    [],
  );

  // Deep link: #capabilities отваря съответния панел.
  useEffect(() => {
    const applyHash = () => {
      const hash = window.location.hash.replace("#", "");
      if (hash && triggers.current.has(hash)) setOpenId(hash);
    };
    applyHash();
    window.addEventListener("hashchange", applyHash);
    return () => window.removeEventListener("hashchange", applyHash);
  }, [order]);

  const value = useMemo(
    () => ({ openId, setOpenId, register, order, focusRelative }),
    [openId, setOpenId, register, order, focusRelative],
  );

  return <AccordionContext.Provider value={value}>{children}</AccordionContext.Provider>;
}

/* ------------------------------------------------------------------ */

interface ExploreSectionProps {
  /** Кратък технически идентификатор за метрики и deep link (slug). */
  id: string;
  /** Пореден номер на секцията в началната страница (напр. „03"). */
  number?: string;
  title: string;
  summary: string;
  /** Кратки „тийзър" факти — показват се само докато панелът е затворен. */
  highlights?: string[];
  /** Текст на подканата за отваряне (по подразбиране „Виж повече"). */
  cta?: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

const prefersReducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

function headerOffset() {
  const header = document.querySelector("header");
  return (header?.getBoundingClientRect().height ?? 64) + 12;
}

function scrollToElement(el: HTMLElement) {
  const top = el.getBoundingClientRect().top + window.scrollY - headerOffset();
  window.scrollTo({
    top: Math.max(top, 0),
    behavior: prefersReducedMotion() ? "auto" : "smooth",
  });
}

export function ExploreSection({
  id,
  number,
  title,
  summary,
  highlights,
  cta = "Виж повече",
  defaultOpen = false,
  children,
}: ExploreSectionProps) {
  const ctx = useContext(AccordionContext);
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const open = ctx ? ctx.openId === id : localOpen;

  const uid = useId();
  const panelId = `${uid}-panel`;
  const sectionRef = useRef<HTMLElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [atEnd, setAtEnd] = useState(true);
  const [scrollable, setScrollable] = useState(false);

  useEffect(() => {
    if (!ctx) return;
    ctx.register(id, triggerRef.current);
    return () => ctx.register(id, null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const setOpen = useCallback(
    (next: boolean) => {
      if (ctx) ctx.setOpenId(next ? id : null);
      else setLocalOpen(next);
    },
    [ctx, id],
  );

  // Изчистен скрол: при отваряне секцията се позиционира точно под хедъра,
  // за да заеме целия екран и потребителят да не губи контекст.
  useEffect(() => {
    if (!open) return;
    const el = sectionRef.current;
    if (!el) return;
    const raf = requestAnimationFrame(() => scrollToElement(el));
    return () => cancelAnimationFrame(raf);
  }, [open]);

  // Индикатор „има още надолу" вътре в панела.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !open) return;
    const update = () => {
      const canScroll = el.scrollHeight - el.clientHeight > 8;
      setScrollable(canScroll);
      setAtEnd(!canScroll || el.scrollTop + el.clientHeight >= el.scrollHeight - 24);
    };
    update();
    el.addEventListener("scroll", update, { passive: true });
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => {
      el.removeEventListener("scroll", update);
      ro.disconnect();
    };
  }, [open]);

  const toggle = useCallback(() => {
    const next = !open;
    if (next) trackMetric("home_section_expand", { section: id });
    setOpen(next);
    if (!next) {
      const el = sectionRef.current;
      if (el) requestAnimationFrame(() => scrollToElement(el));
    }
  }, [open, id, setOpen]);

  const nextId = useMemo(() => {
    if (!ctx) return null;
    const idx = ctx.order.indexOf(id);
    if (idx === -1 || idx === ctx.order.length - 1) return null;
    return ctx.order[idx + 1];
  }, [ctx, id]);

  const goNext = useCallback(() => {
    if (!ctx || !nextId) return;
    trackMetric("home_section_expand", { section: nextId });
    ctx.setOpenId(nextId);
  }, [ctx, nextId]);

  return (
    <section
      id={id}
      ref={sectionRef}
      aria-labelledby={`${panelId}-title`}
      className={cn(
        "group/panel relative scroll-mt-24 overflow-hidden rounded-xl border bg-card/40 transition-colors duration-300",
        open ? "border-gold/40 bg-card/60 shadow-sm" : "border-border/70 hover:border-gold/30",
      )}
    >
      <h2 id={`${panelId}-title`} className="m-0">
        <button
          type="button"
          ref={triggerRef}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
          onKeyDown={(e) => {
            if (!ctx) return;
            if (e.key === "ArrowDown") {
              e.preventDefault();
              ctx.focusRelative(id, 1);
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              ctx.focusRelative(id, -1);
            } else if (e.key === "Escape" && open) {
              e.preventDefault();
              setOpen(false);
            }
          }}
          className="flex w-full items-start gap-3 px-4 py-4 text-left transition-colors hover:bg-gold/[0.04] sm:gap-4 sm:px-5 sm:py-5"
        >
          {number && (
            <span
              aria-hidden="true"
              className={cn(
                "mt-0.5 shrink-0 font-serif text-[15px] font-normal leading-none tabular-nums transition-colors",
                open ? "text-gold" : "text-gold/45 group-hover/panel:text-gold/80",
              )}
            >
              {number}
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="block font-serif text-[17px] font-bold leading-snug text-foreground sm:text-lg">
              {title}
            </span>
            <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">
              {summary}
            </span>
            {!open && highlights && highlights.length > 0 && (
              <span className="mt-2.5 flex flex-wrap items-center gap-1.5">
                {highlights.map((h) => (
                  <span
                    key={h}
                    className="rounded-full border border-gold/25 bg-gold/[0.07] px-2.5 py-1 text-[11px] font-medium leading-none text-foreground/80"
                  >
                    {h}
                  </span>
                ))}
              </span>
            )}
            {!open && (
              <span className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold">
                {cta}
                <ChevronDown className="h-3 w-3" />
              </span>
            )}
          </span>
          <span
            aria-hidden="true"
            className={cn(
              "flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/30 text-gold transition-transform duration-200",
              open && "rotate-180 bg-gold/10",
            )}
          >
            <ChevronDown className="h-4 w-4" />
          </span>
        </button>
      </h2>

      <div className="relative">
        <div
          id={panelId}
          ref={scrollRef}
          hidden={!open}
          className={cn(
            "overflow-y-auto overscroll-contain border-t border-border/60",
            "max-h-[calc(100svh-11rem)]",
            open && "animate-fade-in",
          )}
        >
          {children}
        </div>

        {/* Мек преход надолу — подсказва, че има още съдържание. */}
        {open && scrollable && !atEnd && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-11 h-10 bg-gradient-to-t from-card to-transparent"
          />
        )}

        {/* Лепкава лента с изход и преход към следващата секция. */}
        {open && (
          <div className="flex items-center justify-between gap-2 border-t border-border/60 bg-card/80 px-3 py-2 backdrop-blur">
            <button
              type="button"
              onClick={toggle}
              className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-medium text-muted-foreground transition-colors hover:bg-muted/60 hover:text-foreground"
            >
              <X className="h-3.5 w-3.5" />
              Затвори
            </button>
            {nextId && (
              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center gap-1 rounded-md px-2 py-1.5 text-[12px] font-semibold text-gold transition-colors hover:bg-gold/10"
              >
                Следваща секция
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
