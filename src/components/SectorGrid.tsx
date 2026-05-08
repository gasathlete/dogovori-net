import { useState } from "react";
import { SECTORS } from "@/data/sectors";
import * as Icons from "lucide-react";
import { ArrowRight, ChevronDown, ChevronUp } from "lucide-react";

const INITIAL_VISIBLE = 9;

export function SectorGrid({ onPick }: { onPick: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? SECTORS : SECTORS.slice(0, INITIAL_VISIBLE);
  const remaining = SECTORS.length - INITIAL_VISIBLE;
  return (
    <section id="sectors" className="container py-8 sm:py-10 md:py-14">
      <div className="mb-6 sm:mb-8 max-w-2xl">
        <div className="mb-2 sm:mb-3 text-xs uppercase tracking-[0.2em] text-gold">01 · Сектори</div>
        <h2 className="font-serif text-2xl font-bold leading-tight sm:text-3xl md:text-4xl">
          Изберете правен сектор
        </h2>
        <p className="mt-2 sm:mt-3 text-sm sm:text-base text-muted-foreground">
          Всеки сектор има индивидуален стратегически въпросник, изграден от експертите ни.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
        {visible.map((s, i) => {
          const Icon = (Icons as any)[s.icon] ?? Icons.FileText;
          return (
            <button
              key={s.id}
              onClick={() => onPick(s.id)}
              style={{ animationDelay: `${i * 60}ms` }}
              className="group relative overflow-hidden rounded-xl border border-border/60 bg-gradient-card p-6 text-left shadow-soft transition-all duration-300 hover:-translate-y-1 hover:border-gold/50 hover:shadow-elegant animate-fade-in-up"
            >
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold/0 to-transparent transition-all group-hover:via-gold/60" />
              <div className="mb-5 inline-flex h-12 w-12 items-center justify-center rounded-lg border border-gold/20 bg-gold/5 text-gold transition-all group-hover:bg-gold/10 group-hover:scale-105">
                <Icon className="h-6 w-6" strokeWidth={1.6} />
              </div>
              <h3 className="font-serif text-xl font-bold text-foreground">{s.title}</h3>
              <p className="mt-1 text-xs uppercase tracking-wider text-gold/80">{s.subtitle}</p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                {s.description}
              </p>
              <div className="mt-5 flex items-center gap-2 text-sm font-medium text-gold opacity-100 transition-opacity md:opacity-60 md:group-hover:opacity-100">
                НАМЕРИ ДОГОВОР
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </div>
            </button>
          );
        })}
      </div>

      {remaining > 0 && (
        <div className="mt-6 flex justify-center">
          <button
            onClick={() => setExpanded((e) => !e)}
            className="inline-flex items-center gap-2 rounded-lg border border-gold/40 bg-gold/5 px-5 py-2.5 text-sm font-medium text-gold transition-all hover:bg-gold/10 hover:shadow-gold"
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
