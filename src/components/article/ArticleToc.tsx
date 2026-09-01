/**
 * ArticleToc — мобилно съдържание на статията.
 * Хоризонтални чипове за бърз скок към секция, за да не се скролва цялата статия.
 */
import { ListChecks as List } from "@/icons";

export interface TocItem {
  id: string;
  label: string;
}

export function ArticleToc({ items }: { items: TocItem[] }) {
  if (items.length < 2) return null;

  const jump = (id: string) => {
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - 72;
    window.scrollTo({ top, behavior: "smooth" });
  };

  return (
    <nav
      aria-label="Съдържание на статията"
      className="-mx-4 mb-8 border-y border-border/50 bg-card/40 px-4 py-3 md:hidden"
    >
      <div className="mb-2 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
        <List className="h-3.5 w-3.5" />
        Съдържание
      </div>
      <ul className="flex snap-x gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {items.map((it, i) => (
          <li key={it.id} className="shrink-0 snap-start">
            <button
              type="button"
              onClick={() => jump(it.id)}
              className="flex max-w-[15rem] items-center gap-1.5 whitespace-nowrap rounded-full border border-border/70 bg-background/60 px-3 py-1.5 text-xs text-foreground/85 active:scale-[0.98]"
            >
              <span className="font-serif text-gold/70">{String(i + 1).padStart(2, "0")}</span>
              <span className="truncate">{it.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  );
}
