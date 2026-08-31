/**
 * ExploreSection — разгъващ се панел за началната страница.
 *
 * Прогресивно разгръщане: човек вижда само заглавие + едно изречение и
 * отваря само това, което го интересува. Съдържанието остава в DOM-а
 * (скрито с `hidden`), за да не се губи текст за търсачките.
 */
import { useId, useState, type ReactNode } from "react";
import { ChevronDown } from "@/icons";
import { cn } from "@/lib/utils";
import { trackMetric } from "@/lib/metrics";

interface ExploreSectionProps {
  /** Кратък технически идентификатор за метрики (slug). */
  id: string;
  title: string;
  summary: string;
  defaultOpen?: boolean;
  children: ReactNode;
}

export function ExploreSection({
  id,
  title,
  summary,
  defaultOpen = false,
  children,
}: ExploreSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const panelId = `${useId()}-panel`;

  return (
    <section
      aria-labelledby={`${panelId}-title`}
      className="overflow-hidden rounded-xl border border-border/70 bg-card/40"
    >
      <h2 id={`${panelId}-title`} className="m-0">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => {
            setOpen((v) => {
              if (!v) trackMetric("home_section_expand", { section: id });
              return !v;
            });
          }}
          className="flex w-full items-center gap-3 px-4 py-4 text-left transition-colors hover:bg-gold/[0.04] sm:px-5 sm:py-5"
        >
          <span className="min-w-0 flex-1">
            <span className="block font-serif text-[17px] font-bold leading-snug text-foreground sm:text-lg">
              {title}
            </span>
            <span className="mt-0.5 block text-[13px] leading-relaxed text-muted-foreground">
              {summary}
            </span>
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
        className={cn("border-t border-border/60", open && "animate-fade-in")}
      >
        {children}
      </div>
    </section>
  );
}
