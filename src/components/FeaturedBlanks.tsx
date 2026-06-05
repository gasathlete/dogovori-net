import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Sparkles, ArrowRight, Download, FileText, TrendingUp } from "lucide-react";
import { FEATURED_BLANKS } from "@/data/featuredBlanks";
import { allTemplates } from "@/lib/templateIndex";
import { useMemo } from "react";

/**
 * "Избрани от Договори нет" — homepage section showcasing top-searched
 * HR/admin blanks (молба за напускане, отпуск, запис на заповед, etc.).
 *
 * Each card surfaces the Google monthly search volume as social proof and
 * routes to the existing /shablon/:slug page (where the wizard + DOCX/PDF
 * download already live). Internal-link density boosts SEO crawling of
 * these new high-intent pages.
 */
export function FeaturedBlanks() {
  // Resolve each docName to its SEO slug via templateIndex (handles uniqueness suffix).
  const items = useMemo(() => {
    const index = new Map(allTemplates().map((t) => [t.doc.name, t.slug]));
    return FEATURED_BLANKS.map((b) => ({
      ...b,
      slug: index.get(b.docName) ?? null,
    })).filter((b) => b.slug !== null) as (typeof FEATURED_BLANKS[number] & { slug: string })[];
  }, []);

  if (items.length === 0) return null;

  return (
    <section
      id="featured-blanks"
      aria-labelledby="featured-blanks-title"
      className="container py-14 sm:py-16 md:py-24"
    >
      <div className="mb-10 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between md:mb-12">
        <div className="max-w-2xl">
          <div className="eyebrow mb-3">
            <span className="font-serif text-base font-normal tracking-normal text-gold/60">★</span>
            <span className="h-px w-6 bg-gold/40" />
            <Sparkles className="h-3 w-3" />
            Избрани от Договори нет
          </div>
          <h2
            id="featured-blanks-title"
            className="font-serif text-2xl font-bold leading-[1.15] text-balance sm:text-3xl md:text-4xl lg:text-[44px]"
          >
            Топ 5 най-търсени бланки в България
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Молби, заявления и пълномощни, които българите търсят всеки месец — готови за директно
            попълване или сваляне във Word/PDF.
          </p>
        </div>
        <Link
          to="/kategoria/blanki"
          className="hidden shrink-0 items-center gap-1.5 self-start text-[11px] font-semibold uppercase tracking-[0.18em] text-gold transition-opacity hover:opacity-80 sm:inline-flex sm:self-end"
        >
          Виж всички бланки <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((item, i) => {
          const href = `/shablon/${item.slug}`;
          return (
            <article
              key={item.docName}
              className="group relative flex flex-col overflow-hidden rounded-xl surface-elevated p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/45"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/0 to-transparent transition-all duration-300 group-hover:via-gold/70" />

              {/* Volume badge — social proof */}
              <div className="mb-4 flex items-center justify-between">
                <div className="flex h-9 w-9 items-center justify-center rounded-md border border-gold/30 bg-gold/10">
                  <FileText className="h-4 w-4 text-gold" />
                </div>
                <span
                  className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.14em] text-gold"
                  title={`Месечни търсения в Google: ${item.monthlySearches.toLocaleString("bg-BG")}`}
                >
                  <TrendingUp className="h-2.5 w-2.5" />
                  {item.monthlySearches.toLocaleString("bg-BG")}/мес
                </span>
              </div>

              <h3 className="font-serif text-base font-bold leading-snug text-foreground">
                <Link to={href} className="hover:text-gold transition-colors">
                  {item.shortLabel}
                </Link>
              </h3>
              {item.legalRef && (
                <p className="mt-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
                  {item.legalRef}
                </p>
              )}
              <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">
                {item.snippet}
              </p>

              <div className="mt-4 flex flex-col gap-2 border-t border-hairline pt-3">
                <Link
                  to={href}
                  className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-gold/40 bg-gold/10 px-3 py-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-gold transition-colors hover:bg-gold/20"
                >
                  <Download className="h-3 w-3" /> Свали образец
                </Link>
                <Link
                  to={href}
                  className="inline-flex w-full items-center justify-center gap-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground transition-colors hover:text-foreground"
                >
                  Попълни онлайн <ArrowRight className="h-3 w-3" />
                </Link>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
