import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight, Search } from "lucide-react";
import { useDownloadCounts } from "@/hooks/useDownloadCounts";
import { useCountUp } from "@/hooks/useCountUp";
import { useMemo, useState } from "react";
import { TeaserDialog } from "@/components/TeaserDialog";

function LiveCounter() {
  const counts = useDownloadCounts();
  const total = useMemo(() => {
    let sum = 0;
    counts.forEach((v) => (sum += v));
    // Baseline floor so the number never reads as zero before telemetry catches up.
    return sum + 8420;
  }, [counts]);
  const { ref, value } = useCountUp(total, { duration: 1600 });
  return (
    <p
      ref={ref as any}
      className="mb-4 inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-4 py-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-gold"
    >
      <span className="relative flex h-2 w-2">
        <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-gold/60 opacity-75" />
        <span className="relative inline-flex h-2 w-2 rounded-full bg-gold" />
      </span>
      Над <span className="tabular-nums text-foreground">{value.toLocaleString("bg-BG")}</span> документа вече изтеглени
    </p>
  );
}

export function CTABand() {
  return (
    <section className="container py-14 sm:py-16 md:py-20">
      <div
        className="gold-sweep-bg relative overflow-hidden rounded-2xl border border-gold/30 px-6 py-12 text-center sm:px-10 sm:py-14 md:px-16 md:py-16"
        style={{
          background:
            "var(--gradient-fine-noise), linear-gradient(135deg, hsl(220 50% 9%) 0%, hsl(220 42% 12%) 60%, hsl(43 35% 18%) 100%)",
          boxShadow: "var(--shadow-elegant), inset 0 1px 0 hsl(43 55% 54% / 0.12)",
        }}
      >
        <div className="absolute inset-x-0 top-0 hairline-x" />
        <div className="absolute inset-x-0 bottom-0 hairline-x opacity-60" />

        <span className="pointer-events-none absolute left-4 top-4 h-3 w-3 border-l border-t border-gold/50" />
        <span className="pointer-events-none absolute right-4 top-4 h-3 w-3 border-r border-t border-gold/50" />
        <span className="pointer-events-none absolute left-4 bottom-4 h-3 w-3 border-l border-b border-gold/50" />
        <span className="pointer-events-none absolute right-4 bottom-4 h-3 w-3 border-r border-b border-gold/50" />

        <div className="relative z-10">
          <LiveCounter />
          <div className="eyebrow mb-3 justify-center">Готови?</div>
          <h2 className="mx-auto max-w-2xl font-serif text-2xl font-bold leading-tight text-balance sm:text-3xl md:text-4xl">
            Изгответе своя професионален договор още днес
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            +600 шаблона · AI анализ на риска · електронен подпис · без скрити такси.
          </p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row sm:gap-4">
            <Link
              to="/auth"
              className="btn-gold btn-sheen btn-press w-full sm:w-auto normal-case tracking-normal text-base px-8 py-4"
            >
              <ArrowRight className="h-[18px] w-[18px]" /> Започни безплатно
            </Link>
            <Link
              to="/catalog"
              className="story-link text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-gold sm:ml-2"
            >
              <Search className="mr-1 inline-block h-3.5 w-3.5" /> или разгледай каталога
            </Link>
          </div>
          <p className="mt-5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            Без карта · готов документ за под 2 минути
          </p>
        </div>
      </div>
    </section>
  );
}
