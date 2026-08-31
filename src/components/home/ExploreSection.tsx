/**
 * ExploreSection — разгъващ се панел за началната страница.
 *
 * Прогресивно разгръщане: човек вижда само заглавие + едно изречение и
 * отваря само това, което го интересува. Съдържанието остава в DOM-а
 * (скрито с `hidden`), за да не се губи текст за търсачките.
 */
import { useCallback, useId, useRef, useState, type ReactNode } from "react";
import { ChevronDown } from "@/icons";
import { cn } from "@/lib/utils";
import { trackMetric } from "@/lib/metrics";

interface ExploreSectionProps {
  /** Кратък технически идентификатор за метрики (slug). */
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
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `${useId()}-panel`;
  const sectionRef = useRef<HTMLElement>(null);

  // Изчистен скрол: при отваряне секцията се позиционира точно под хедъра,
  // за да заеме целия екран и потребителят да не губи контекст.
  const toggle = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next) {
        trackMetric("home_section_expand", { section: id });
        requestAnimationFrame(() => {
          const el = sectionRef.current;
          if (!el) return;
          const header = document.querySelector("header");
          const offset = (header?.getBoundingClientRect().height ?? 64) + 12;
          const top = el.getBoundingClientRect().top + window.scrollY - offset;
          window.scrollTo({
            top: Math.max(top, 0),
            behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
              ? "auto"
              : "smooth",
          });
        });
      }
      return next;
    });
  }, [id]);

  return (
    <section
      ref={sectionRef}
      aria-labelledby={`${panelId}-title`}
      className={cn(
        "group/panel relative scroll-mt-24 overflow-hidden rounded-xl border bg-card/40 transition-colors duration-300",
        open ? "border-gold/40 bg-card/60" : "border-border/70 hover:border-gold/30",
      )}
    >
      <h2 id={`${panelId}-title`} className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={toggle}
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
      <div
        id={panelId}
        hidden={!open}
        className={cn(
          "overflow-y-auto overscroll-contain border-t border-border/60",
          "max-h-[calc(100svh-9rem)]",
          open && "animate-fade-in",
        )}
      >
        {children}
      </div>
    </section>
  );
}
