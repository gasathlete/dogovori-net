import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { Sparkles, ArrowRight, Download, FileText, TrendingUp, CheckCircle2 } from "@/icons";
import { FEATURED_BLANKS } from "@/data/featuredBlanks";
import { allTemplates } from "@/lib/templateIndex";
import { useMemo } from "react";
import { ExpandableCard } from "@/components/ui/ExpandableCard";

/**
 * Per-blank expandable details — short factual bullets that build trust
 * without forcing a navigation away from the homepage.
 */
const BLANK_DETAILS: Record<string, { when: string; signer: string; term: string }> = {
  "Молба за напускане (чл. 326, ал. 1 КТ)": {
    when: "При едностранно прекратяване на безсрочен трудов договор от служителя.",
    signer: "Служителят — адресирана до работодателя.",
    term: "30 дни предизвестие по подразбиране (или както е в договора).",
  },
  "Молба за платен годишен отпуск": {
    when: "Преди ползване на годишен отпуск — обикновено 7 дни предварително.",
    signer: "Служителят — одобрява се от прекия ръководител.",
    term: "Минимум 20 работни дни годишно по чл. 155 КТ.",
  },
  "Запис на заповед (образец)": {
    when: "Като обезпечение по търговски и граждански сделки.",
    signer: "Издателят (длъжникът) — пред поемателя или на заповед.",
    term: "Падеж: на предявяване, на определена дата или след предявяване.",
  },
  "Нотариално заверено пълномощно (универсално)": {
    when: "За действия пред банки, нотариуси, държавни институции.",
    signer: "Упълномощителят, с нотариална заверка на подписа.",
    term: "Срок по преценка; препоръчително до 12 месеца.",
  },
  "Разписка за получена сума": {
    when: "При получаване на парична сума в брой — заем, наем, авансово плащане.",
    signer: "Получателят на сумата.",
    term: "Безсрочна — служи като доказателство за получаване.",
  },
};

export function FeaturedBlanks() {
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
      className="container py-12 sm:py-16 md:py-20"
    >
      <div className="mb-10 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between md:mb-12">
        <div className="max-w-2xl">
          <div className="eyebrow mb-3">
            <span className="section-number font-serif text-base font-normal tracking-normal text-gold/60">02</span>
            <span className="h-px w-6 bg-gold/40" />
            <Sparkles className="h-3 w-3" />
            <span className="whitespace-pre-line text-left leading-tight">ИЗБРАНИ ОТ ДОГОВОРИ НЕТ</span>
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
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {items.map((item) => {
          const href = `/shablon/${item.slug}`;
          const details = BLANK_DETAILS[item.docName];
          return (
            <article
              key={item.docName}
              className="group relative flex flex-col overflow-hidden rounded-xl surface-elevated p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/45"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/0 to-transparent transition-all duration-300 group-hover:via-gold/70" />

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

              {details && (
                <ExpandableCard
                  className="mt-1"
                  triggerLabel="Виж детайли"
                  triggerLabelOpen="Скрий детайли"
                  expandedContent={
                    <ul className="space-y-1.5 rounded-md border border-hairline bg-card/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
                      <li className="flex gap-1.5">
                        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-gold/80" />
                        <span><span className="text-foreground/80 font-semibold">Кога: </span>{details.when}</span>
                      </li>
                      <li className="flex gap-1.5">
                        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-gold/80" />
                        <span><span className="text-foreground/80 font-semibold">Кой подписва: </span>{details.signer}</span>
                      </li>
                      <li className="flex gap-1.5">
                        <CheckCircle2 className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-gold/80" />
                        <span><span className="text-foreground/80 font-semibold">Срок: </span>{details.term}</span>
                      </li>
                    </ul>
                  }
                >
                  <span className="sr-only">Допълнителна информация за {item.shortLabel}</span>
                </ExpandableCard>
              )}

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

      {/* Strong CTA below the top-5 grid */}
      <div className="mt-10 flex flex-col items-center gap-3 sm:mt-12">
        <Link
          to="/catalog"
          className="group inline-flex items-center justify-center gap-2 rounded-md bg-gradient-gold px-8 py-4 text-sm font-bold uppercase tracking-[0.16em] text-navy shadow-gold transition-transform hover:-translate-y-0.5"
        >
          Виж пълния каталог
          <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </Link>
        <p className="text-[11px] text-muted-foreground">
          Над 600 документа, бланки и шаблони — категоризирани по сектор и закон.
        </p>
      </div>
    </section>
  );
}
