import { lazy, Suspense, useEffect, useState } from "react";
import { markFunnelStep } from "@/lib/funnel";
import { Link } from "react-router-dom";
import { prefetchHandlers } from "@/components/PrefetchLink";
import { ShieldCheck, Bird, FileText, Search, FileSignature, ArrowRight, FileUp, Wand2 } from "@/icons";
const logoImg = "/logo-dogovori-hero.webp";
import { HeroVideoBackdrop } from "@/components/HeroVideoBackdrop";
import { First100Counter } from "@/components/funnel/First100Counter";
import { useAuth } from "@/hooks/useAuth";

const TeaserDialog = lazy(() => import("@/components/TeaserDialog").then((m) => ({ default: m.TeaserDialog })));

export function Hero({ onStart: _onStart }: { onStart: () => void }) {
  const { user } = useAuth();
  const [teaserOpen, setTeaserOpen] = useState(false);

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
            Документи и договори, които търсят и{" "}
            <em className="not-italic font-serif italic text-gold">намират</em>{" "}
            Вашите интереси
          </h1>

          {/* Eyebrow chips — one line of trust cues */}
          <div className="mt-4">
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 text-[10px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:text-[11px]">
              <span className="inline-flex items-center gap-1.5 text-gold"><ShieldCheck className="h-3.5 w-3.5" /> ЗЗД · ТЗ · ЗУТ</span>
              <span className="h-3 w-px bg-gold/30" />
              <span className="inline-flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-gold" /> &gt;600 ШАБЛОНА</span>
              <span className="h-3 w-px bg-gold/30" />
              <span className="inline-flex items-center gap-1.5"><Bird className="h-3.5 w-3.5 text-gold" /> АНАЛИЗ НА РИСКА</span>
              <span className="h-3 w-px bg-gold/30" />
              <span className="inline-flex items-center gap-1.5"><FileSignature className="h-3.5 w-3.5 text-gold" /> Е-ПОДПИС</span>
            </div>
          </div>

          {/* Single primary CTA */}
          <div className="mt-7 flex flex-col items-center gap-3">
            {user ? (
              // Three equal action tiles for signed-in users
              <div className="mx-auto grid w-full max-w-[560px] grid-cols-1 gap-2.5 sm:grid-cols-3">
                <Link
                  to="/catalog"
                  {...prefetchHandlers("/catalog")}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-gold/50 bg-card/60 px-4 py-3 text-[14px] font-semibold text-gold transition-colors hover:bg-gold/10"
                >
                  <Search className="h-[16px] w-[16px]" />
                  Намери
                </Link>
                <Link
                  to="/build"
                  {...prefetchHandlers("/build")}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-gold/50 bg-card/60 px-4 py-3 text-[14px] font-semibold text-gold transition-colors hover:bg-gold/10"
                >
                  <Wand2 className="h-[16px] w-[16px]" />
                  Изготви
                </Link>
                <Link
                  to="/account?tab=documents&action=upload"
                  {...prefetchHandlers("/account")}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-md border border-gold/50 bg-card/60 px-4 py-3 text-[14px] font-semibold text-gold transition-colors hover:bg-gold/10"
                >
                  <FileUp className="h-[16px] w-[16px]" />
                  Качи за анализ
                </Link>
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

            {!user && (
              <p className="flex items-center justify-center gap-2 text-[11px] text-muted-foreground">
                <ShieldCheck className="h-3 w-3 text-emerald-500" />
                Без карта · 5 безплатни операции · GDPR
              </p>
            )}
          </div>

          {/* Process steps — clickable chips ending the Hero */}
          <nav
            aria-label="Четирите стъпки на процеса"
            className="mt-9"
          >
            <ul
              role="list"
              className="mx-auto flex max-w-2xl flex-wrap items-center justify-center gap-x-1.5 gap-y-2 sm:gap-x-2"
            >
              {[
                { slug: "dogovaryay", label: "Договаряй" },
                { slug: "sazday", label: "Създай" },
                { slug: "pretsiziray", label: "Прецизирай" },
                { slug: "podpishi", label: "Подпиши" },
              ].map((s, i, arr) => (
                <li key={s.slug} className="inline-flex items-center gap-1.5 sm:gap-2">
                  <Link
                    to={`/proces/${s.slug}`}
                    className="inline-flex items-center rounded-full border border-gold/30 bg-card/40 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.16em] text-gold/90 shadow-sm backdrop-blur-sm transition-colors hover:border-gold/60 hover:bg-gold/10 hover:text-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60 sm:text-[12px]"
                  >
                    {s.label}
                  </Link>
                  {i < arr.length - 1 && (
                    <span aria-hidden="true" className="text-gold/40">·</span>
                  )}
                </li>
              ))}
            </ul>
          </nav>


          {/* Promo + counter in one restrained row */}
          <div className="mt-6 flex flex-col items-center gap-1.5">
            <p className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Промокод <span className="font-semibold text-gold">FIRST100</span> → −20% за нови клиенти · без карта
            </p>
            <First100Counter />
          </div>
        </div>
      </div>

      <div className="absolute inset-x-0 bottom-0 hairline-x opacity-60" />
      {teaserOpen && (
        <Suspense fallback={null}>
          <TeaserDialog open={teaserOpen} onOpenChange={setTeaserOpen} />
        </Suspense>
      )}
    </section>
  );
}

