import { lazy, Suspense, useEffect, useState } from "react";
import { markFunnelStep } from "@/lib/funnel";
import { Link } from "react-router-dom";
import { prefetchHandlers } from "@/components/PrefetchLink";
import { ShieldCheck, Bird, FileText, Search, FileSignature, ArrowRight, FileUp } from "@/icons";
const logoImg = "/logo-dogovori-hero.webp";
import { HeroVideoBackdrop } from "@/components/HeroVideoBackdrop";
import { SEPTEMBER_PROMO } from "@/lib/pricing";
import { useAuth } from "@/hooks/useAuth";
import { useAudience } from "@/hooks/useAudience";
import { AudienceToggle } from "@/components/funnel/AudienceToggle";
import { trackEvent } from "@/lib/analytics";

const RoiDialog = lazy(() => import("@/components/funnel/RoiDialog").then((m) => ({ default: m.RoiDialog })));

const TeaserDialog = lazy(() => import("@/components/TeaserDialog").then((m) => ({ default: m.TeaserDialog })));

export function Hero({ onStart: _onStart }: { onStart: () => void }) {
  const { user } = useAuth();
  const { audience, copy } = useAudience();
  const [teaserOpen, setTeaserOpen] = useState(false);
  const [roiOpen, setRoiOpen] = useState(false);

  useEffect(() => { markFunnelStep(1); }, []);

  return (
    <section className="relative overflow-hidden lg:flex lg:min-h-[min(calc(100svh-4rem),580px)] lg:items-center">
      <HeroVideoBackdrop />
      <div className="pointer-events-none absolute inset-0 bg-gradient-hero opacity-25" />

      {/* Corner filigree — only two diagonally opposite corners, not four */}
      <svg aria-hidden="true" width="0" height="0" className="absolute" style={{ position: "absolute" }}>
        <defs>
          <symbol id="hero-corner" viewBox="0 0 60 60">
            <g fill="none" stroke="currentColor" strokeWidth="0.7">
              <path d="M0 22 L0 0 L22 0" />
              <path d="M0 32 L9 32" />
              <path d="M32 0 L32 9" />
            </g>
            <circle cx="14" cy="14" r="1.1" fill="currentColor" />
          </symbol>
        </defs>
      </svg>
      {["top-5 left-5 rotate-0", "bottom-5 right-5 rotate-180"].map((cls) => (
        <svg
          key={cls}
          aria-hidden="true"
          className={`pointer-events-none absolute hidden h-10 w-10 text-gold/40 sm:block ${cls}`}
        >
          <use href="#hero-corner" />
        </svg>
      ))}

      <div className="absolute inset-x-0 top-0 hairline-x" />

      <div className="container relative w-full py-10 sm:py-14 lg:py-16">
        <div className="relative mx-auto max-w-3xl text-center">
          {/* Clean logo — no rotating rings or tick marks */}
          <div className="mb-4 hidden justify-center sm:flex">
            <div className="flex h-14 w-14 items-center justify-center rounded-full border border-gold/40 bg-card/60 md:h-16 md:w-16">
              <img
                src={logoImg}
                alt="Dogovori.net лого"
                width={96}
                height={96}
                loading="eager"
                {...({ fetchpriority: "high" } as any)}
                decoding="async"
                className="h-[64%] w-[64%] object-contain"
              />
            </div>
          </div>

          <h1
            className="mx-auto max-w-3xl font-serif text-[28px] font-bold leading-[1.1] text-balance sm:text-3xl md:text-4xl lg:text-[44px] lg:leading-[1.05] [text-shadow:0_1px_0_hsl(var(--background)/0.5)]"
          >
            {copy.heroHeadline.lead}{" "}
            <em className="not-italic font-serif italic text-gold">
              {copy.heroHeadline.accent}
            </em>
            {copy.heroHeadline.tail}
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            {copy.heroSub}
          </p>

          <div className="mt-4 flex justify-center">
            <AudienceToggle size="sm" />
          </div>




          {/* Single primary CTA */}
          <div className="mt-7 flex flex-col items-center gap-3">
            {user ? (
              // One primary action; everything else is a secondary text link.
              <div className="mx-auto flex w-full max-w-[560px] flex-col items-center gap-3">
                <Link
                  to="/start"
                  {...prefetchHandlers("/start")}
                  className="btn-gold btn-press inline-flex items-center gap-2 rounded-xl px-8 py-4 text-[16px] font-bold normal-case tracking-normal sm:text-[17px] sm:px-10"
                >
                  Започни документ
                  <ArrowRight className="h-[16px] w-[16px]" />
                </Link>
                <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-[12px] text-muted-foreground">
                  <Link to="/catalog" {...prefetchHandlers("/catalog")} className="inline-flex items-center gap-1.5 hover:text-gold">
                    <Search className="h-3.5 w-3.5" /> Разгледай шаблоните
                  </Link>
                  <span className="hidden h-3 w-px bg-border sm:inline-block" />
                  <Link to="/account?tab=documents&action=upload" {...prefetchHandlers("/account")} className="inline-flex items-center gap-1.5 hover:text-gold">
                    <FileUp className="h-3.5 w-3.5" /> Качи за анализ
                  </Link>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => {
                  try { (window as any).plausible?.("funnel_cta_click", { props: { step: 1, label: "Започни безплатно", trigger: "story" } }); } catch {}
                  import("@/components/funnel/StartStoryOverlay").then((m) => m.openStartStory());
                }}
                className="btn-gold btn-press inline-flex items-center gap-2 rounded-xl px-8 py-4 text-[16px] font-bold normal-case tracking-normal sm:text-[17px] sm:px-10"
              >
                Започни безплатно
                <ArrowRight className="h-[16px] w-[16px]" />
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                trackEvent("roi_dialog_opened", { audience, source: "hero" });
                setRoiOpen(true);
              }}
              className="story-link text-[12px] font-semibold text-muted-foreground transition-colors hover:text-gold"
            >
              Виж колко спестяваш
            </button>

            {!user && (
              <p className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3 w-3 text-emerald-500" />
                Без карта · 5 безплатни операции · GDPR
              </p>
            )}
          </div>

          {/* Септемврийска промоция −20% — един дискретен ред */}
          <p className="mt-6 text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
            −20% с код <span className="font-semibold text-gold">{SEPTEMBER_PROMO.code}</span> до 30.09
          </p>

        </div>
      </div>

      
      {roiOpen && (
        <Suspense fallback={null}>
          <RoiDialog open={roiOpen} onOpenChange={setRoiOpen} />
        </Suspense>
      )}

      {teaserOpen && (
        <Suspense fallback={null}>
          <TeaserDialog open={teaserOpen} onOpenChange={setTeaserOpen} />
        </Suspense>
      )}
    </section>
  );
}

