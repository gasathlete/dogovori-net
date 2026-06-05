import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { TOP_DOCUMENTS } from "@/data/catalog";
import { ArrowRight, Bird, Crown } from "lucide-react";
import { useDownloadCounts } from "@/hooks/useDownloadCounts";
import { slugify } from "@/lib/slugify";

// Baseline floor per top-5 slot (early social proof while real telemetry ramps up).
// Real downloads from `template_download_counts` are added on top of this baseline.
const DOWNLOAD_BASELINE = [19, 17, 15, 13, 12];

export function TopDocuments() {
  const counts = useDownloadCounts();
  return (
    <section id="top-documents" className="container py-14 sm:py-16 md:py-24">
      <div className="mb-10 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between md:mb-12">
        <div className="max-w-2xl">
          <div className="eyebrow mb-3">
            <span className="font-serif text-base font-normal tracking-normal text-gold/60">01</span>
            <span className="h-px w-6 bg-gold/40" />
            <Bird className="h-3 w-3" />
            Топ 5 най-търсени
          </div>
          <h2 className="font-serif text-2xl font-bold leading-[1.15] text-balance sm:text-3xl md:text-4xl lg:text-[44px]">
            Най-използваните договори в България
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            Бърз достъп до петте най-често търсени документа — готови за персонализиране.
          </p>
        </div>
        <Link
          to="/catalog"
          className="hidden shrink-0 items-center gap-1.5 self-start text-[11px] font-semibold uppercase tracking-[0.18em] text-gold transition-opacity hover:opacity-80 sm:inline-flex sm:self-end"
        >
          Виж 600+ ШАБЛОНА <ArrowRight className="h-3.5 w-3.5" />
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {TOP_DOCUMENTS.map((doc, i) => {
          const featured = i === 0;
          const real = counts.get(slugify(doc.name)) ?? 0;
          const total = (DOWNLOAD_BASELINE[i] ?? 0) + real;
          return (
            <Link
              key={doc.name}
              to={`/wizard/${doc.sectorId}`}
              className={`group relative flex flex-col overflow-hidden rounded-xl surface-elevated p-5 transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/45 ${
                featured ? "ring-1 ring-gold/40 shadow-[0_10px_40px_-15px_hsl(43_55%_54%/0.4)]" : ""
              }`}
            >
              {featured && (
                <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-gold">
                  <Crown className="h-2.5 w-2.5" /> Най-търсен
                </span>
              )}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/0 to-transparent transition-all duration-300 group-hover:via-gold/70" />
              <div className="mb-4 flex h-9 w-9 items-center justify-center rounded-md border border-gold/30 bg-gold/10 font-serif text-sm font-bold text-gold">
                {i + 1}
              </div>
              <h3 className="font-serif text-base font-bold leading-snug text-foreground">
                {doc.name}
              </h3>
              <p className="mt-2 flex-1 text-xs leading-relaxed text-muted-foreground">
                {doc.description}
              </p>
              <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3">
                <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  {total.toLocaleString("bg-BG")} изтегляния
                </span>
                <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold opacity-70 transition-opacity duration-200 group-hover:opacity-100">
                  Виж <ArrowRight className="h-3 w-3" />
                </span>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="mt-10 text-center">
        <Link to="/catalog" className="btn-ghost-gold normal-case tracking-normal">
          Виж целия каталог (600+ ШАБЛОНА) <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </section>
  );
}
