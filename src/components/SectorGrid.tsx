import { useState } from "react";
import { SECTOR_META as SECTORS } from "@/data/sectorsMeta";
import * as Icons from "lucide-react";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";
import { SECTOR_IMAGES } from "@/lib/sectorImages";

const INITIAL_VISIBLE = 9;

export function SectorGrid({ onPick }: { onPick: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? SECTORS : SECTORS.slice(0, INITIAL_VISIBLE);
  const remaining = SECTORS.length - INITIAL_VISIBLE;
  return (
    <section id="sectors" className="container py-14 sm:py-16 md:py-24">
      <div className="mb-10 max-w-2xl md:mb-12">
        <div className="eyebrow mb-3">
          <span className="font-serif text-base font-normal tracking-normal text-gold/60">01</span>
          <span className="h-px w-6 bg-gold/40" />
          Сектори
        </div>
        <h2 className="font-serif text-2xl font-bold leading-[1.15] text-balance sm:text-3xl md:text-4xl lg:text-[44px]">
          Изберете правен сектор
        </h2>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
          Всеки сектор има индивидуален стратегически въпросник, изграден от експертите ни.
        </p>
        <div className="mt-4 inline-flex items-center gap-2 rounded-full border border-gold/25 bg-gold/5 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
          <span>{SECTORS.length} сектора</span>
          <span className="h-2.5 w-px bg-gold/30" />
          <span>590 документа</span>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3 lg:gap-5">
        {visible.map((s) => {
          const Icon = (Icons as any)[s.icon] ?? Icons.FileText;
          const bg = SECTOR_IMAGES[s.id];
          return (
            <button
              key={s.id}
              onClick={() => onPick(s.id)}
              className="group relative isolate overflow-hidden rounded-xl surface-elevated p-6 text-left transition-all duration-300 hover:-translate-y-0.5 hover:border-gold/45 sm:p-7"
            >
              {bg && (
                <>
                  <img
                    src={bg}
                    alt=""
                    aria-hidden="true"
                    loading="lazy"
                    width={1024}
                    height={768}
                    className="pointer-events-none absolute inset-0 -z-10 h-full w-full object-cover opacity-[0.38] transition-opacity duration-500 group-hover:opacity-[0.52]"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 -z-10 bg-gradient-to-br from-card/70 via-card/55 to-card/80"
                  />
                  <div
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_top_right,_hsl(220_42%_8%_/_0.55),_transparent_60%)]"
                  />
                </>
              )}
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/0 to-transparent transition-all duration-300 group-hover:via-gold/70" />
              <div className="mb-5 inline-flex h-11 w-11 items-center justify-center rounded-lg border border-gold/25 bg-gold/5 text-gold transition-all duration-200 group-hover:border-gold/50 group-hover:bg-gold/10">
                <Icon className="h-5 w-5" strokeWidth={1.6} />
              </div>
              <h3 className="font-serif text-lg font-bold leading-snug text-foreground sm:text-xl">{s.title}</h3>
              <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.22em] text-gold/80">{s.subtitle}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {s.description}
              </p>
              <div className="mt-6 inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold opacity-80 transition-opacity duration-200 group-hover:opacity-100">
                Намери договор
                <ArrowRight className="h-3.5 w-3.5 transition-transform duration-200 group-hover:translate-x-0.5" />
              </div>
            </button>
          );
        })}
      </div>

      {remaining > 0 && (
        <div className="mt-8 flex justify-center">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="btn-ghost-gold normal-case tracking-normal"
          >
            {expanded ? (
              <>Покажи по-малко <ChevronUp className="h-4 w-4" /></>
            ) : (
              <>Покажи още {remaining} сектора <ChevronDown className="h-4 w-4" /></>
            )}
          </button>
        </div>
      )}
    </section>
  );
}
