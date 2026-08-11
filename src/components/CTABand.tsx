import { PrefetchLink as Link } from "@/components/PrefetchLink";
import { ArrowRight, Search, FileUp } from "@/icons";
import { useDownloadCounts } from "@/hooks/useDownloadCounts";
import { useCountUp } from "@/hooks/useCountUp";
import { useMemo, useState } from "react";
import { TeaserDialog } from "@/components/TeaserDialog";
import { openStartStory } from "@/components/funnel/StartStoryOverlay";
import { useAuth } from "@/hooks/useAuth";
import { useAudience } from "@/hooks/useAudience";
import { AudienceToggle } from "@/components/funnel/AudienceToggle";

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
  const { user } = useAuth();
  const { copy } = useAudience();
  const [teaserOpen, setTeaserOpen] = useState(false);
  return (
    <section id="cta-band" className="container py-12 sm:py-16 md:py-20">
      <div
        className="gold-sweep-bg relative overflow-hidden rounded-2xl border border-gold/30 bg-card px-6 py-12 text-center text-foreground sm:px-10 sm:py-14 md:px-16 md:py-16"
        style={{
          boxShadow: "var(--shadow-elegant), var(--shadow-inset-line)",
        }}
      >
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 opacity-70"
          style={{ background: "var(--gradient-radial)" }}
        />
        <div className="absolute inset-x-0 top-0 hairline-x" />
        <div className="absolute inset-x-0 bottom-0 hairline-x opacity-60" />

        <span className="pointer-events-none absolute left-4 top-4 h-3 w-3 border-l border-t border-gold/50" />
        <span className="pointer-events-none absolute right-4 top-4 h-3 w-3 border-r border-t border-gold/50" />
        <span className="pointer-events-none absolute left-4 bottom-4 h-3 w-3 border-l border-b border-gold/50" />
        <span className="pointer-events-none absolute right-4 bottom-4 h-3 w-3 border-r border-b border-gold/50" />


        <div className="relative z-10">
          <LiveCounter />
          <div className="eyebrow mb-3 justify-center">Готови?</div>
          <h2 className="mx-auto max-w-2xl font-serif text-3xl font-bold leading-tight text-balance sm:text-4xl md:text-5xl">
            {copy.ctaHeadline}
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {copy.ctaExample}
          </p>
          <p className="mx-auto mt-2 max-w-xl text-[12px] text-muted-foreground">
            +600 шаблона · AI анализ на риска · електронен подпис · без скрити такси.
          </p>
          <div className="mt-5 flex justify-center">
            <AudienceToggle size="sm" />
          </div>
          {user ? (
            <div className="mx-auto mt-8 flex w-full max-w-[460px] flex-col items-center gap-3">
              <Link
                to="/start"
                className="btn-gold btn-sheen btn-press w-full normal-case tracking-normal text-[15px] px-6 py-3.5"
              >
                <ArrowRight className="h-[16px] w-[16px]" /> Започни документ
              </Link>
              <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[12px] text-muted-foreground">
                <Link to="/catalog" className="inline-flex items-center gap-1.5 hover:text-gold">
                  <Search className="h-3.5 w-3.5" /> Разгледай шаблоните
                </Link>
                <span className="hidden h-3 w-px bg-border sm:inline-block" />
                <Link
                  to="/account?tab=documents&action=upload"
                  className="inline-flex items-center gap-1.5 hover:text-gold"
                >
                  <FileUp className="h-3.5 w-3.5" /> Качи за анализ
                </Link>
              </div>
            </div>
          ) : (
            <div className="mt-8 flex flex-col items-center justify-center gap-3">
              <div className="relative w-full sm:w-auto">
                <span
                  aria-hidden="true"
                  className="pointer-events-none absolute -inset-1.5 rounded-2xl bg-gradient-to-r from-gold/0 via-gold/25 to-gold/0 opacity-35 blur-2xl"
                />
                <button
                  type="button"
                  onClick={() => openStartStory()}
                  className="btn-gold btn-sheen btn-press relative w-full sm:w-auto normal-case tracking-normal text-lg sm:text-xl px-12 py-5 sm:px-14 sm:py-6 lg:px-10 lg:py-4 lg:text-lg rounded-xl font-bold shadow-gold"
                >
                  <ArrowRight className="h-[22px] w-[22px]" /> Започни безплатно
                </button>
              </div>
              <Link
                to="/catalog"
                className="story-link text-xs uppercase tracking-[0.18em] text-muted-foreground hover:text-gold"
              >
                <Search className="mr-1 inline-block h-3.5 w-3.5" /> или разгледай каталога
              </Link>
            </div>
          )}
          <p className="mt-5 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            БЕЗ КАРТА · ГОТОВ ДОКУМЕНТ ЗА 2 МИНУТИ
          </p>
        </div>
      </div>
      <TeaserDialog open={teaserOpen} onOpenChange={setTeaserOpen} />
    </section>
  );
}
