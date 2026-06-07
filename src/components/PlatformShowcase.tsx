import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Briefcase,
  Sparkles,
  Library,
  FolderTree,
  ChevronLeft,
  ChevronRight,
  FileText,
  Users,
  Wand2,
  Layers,
  ArrowRight,
} from "lucide-react";

type FeatureSlide = {
  id: string;
  kicker: string;
  title: string;
  description: string;
  Icon: typeof Briefcase;
  visual: "contract" | "ai" | "catalog" | "folders";
};

const SLIDES: FeatureSlide[] = [
  {
    id: "everyday-business",
    kicker: "Бизнес ежедневие",
    title: "Решения за всеки работен ден",
    description:
      "Договори, протоколи, заявления и пълномощни — готови за подпис за минути, не за дни.",
    Icon: Briefcase,
    visual: "contract",
  },
  {
    id: "quality-content",
    kicker: "AI асистент",
    title: "Качествено съдържание, бързо и удобно",
    description:
      "AI препоръки, авто-корекции и интелигентни клаузи. Без излишен правен жаргон.",
    Icon: Sparkles,
    visual: "ai",
  },
  {
    id: "legal-catalog",
    kicker: "Дигитален каталог",
    title: "600+ образци, подредени по сектори",
    description:
      "От наем и труд до NDA, GDPR и пълномощни. Намерете точния шаблон за минути.",
    Icon: Library,
    visual: "catalog",
  },
  {
    id: "storage-parties",
    kicker: "Работно пространство",
    title: "Съхранение, папки и контрагенти",
    description:
      "Подредете файловете си, споделете за подпис и прилагайте към контрагенти на едно място.",
    Icon: FolderTree,
    visual: "folders",
  },
];

const ROTATE_MS = 7000;

function MiniVisual({ kind }: { kind: FeatureSlide["visual"] }) {
  if (kind === "contract") {
    return (
      <div className="relative h-full w-full overflow-hidden rounded-lg border border-hairline bg-navy-light/40 p-4">
        <div className="mb-3 flex items-center gap-2">
          <FileText className="h-3.5 w-3.5 text-gold" strokeWidth={1.6} />
          <div className="h-2 w-20 rounded-full bg-foreground/70" />
        </div>
        <div className="space-y-1.5">
          <div className="h-1.5 w-full rounded-full bg-foreground/15" />
          <div className="h-1.5 w-5/6 rounded-full bg-foreground/15" />
          <div className="h-1.5 w-4/6 rounded-full bg-gold/60" />
          <div className="h-1.5 w-full rounded-full bg-foreground/15" />
          <div className="h-1.5 w-3/5 rounded-full bg-gold/60" />
          <div className="h-1.5 w-5/6 rounded-full bg-foreground/15" />
        </div>
        <div className="mt-4 flex items-center justify-between border-t border-hairline pt-3">
          <div className="h-1.5 w-10 rounded-full bg-foreground/30" />
          <div className="h-6 w-16 rounded-sm border border-gold/50 bg-gold/10" />
        </div>
      </div>
    );
  }
  if (kind === "ai") {
    return (
      <div className="relative h-full w-full overflow-hidden rounded-lg border border-hairline bg-navy-light/40 p-4">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-gold">
          <Wand2 className="h-3 w-3" strokeWidth={1.6} /> AI
        </div>
        <div className="space-y-1.5">
          <div className="h-1.5 w-full rounded-full bg-foreground/15" />
          <div className="relative h-1.5 w-4/5 rounded-full bg-foreground/15">
            <span className="absolute inset-0 rounded-full bg-gradient-to-r from-gold/0 via-gold/80 to-gold/0 animate-[ai-sweep_2.4s_ease-in-out_infinite]" />
          </div>
          <div className="h-1.5 w-5/6 rounded-full bg-foreground/15" />
          <div className="relative h-1.5 w-3/5 rounded-full bg-foreground/15">
            <span className="absolute inset-0 rounded-full bg-gradient-to-r from-gold/0 via-gold/80 to-gold/0 animate-[ai-sweep_2.4s_ease-in-out_0.6s_infinite]" />
          </div>
          <div className="h-1.5 w-full rounded-full bg-foreground/15" />
        </div>
        <div className="mt-4 flex items-center gap-1.5">
          <Sparkles className="h-3 w-3 text-gold" strokeWidth={1.6} />
          <div className="h-1.5 w-16 rounded-full bg-gold/60" />
        </div>
      </div>
    );
  }
  if (kind === "catalog") {
    return (
      <div className="relative h-full w-full overflow-hidden rounded-lg border border-hairline bg-navy-light/40 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Layers className="h-3.5 w-3.5 text-gold" strokeWidth={1.6} />
          <div className="h-2 w-16 rounded-full bg-foreground/70" />
        </div>
        <div className="grid grid-cols-2 gap-2">
          {["Труд", "Наем", "NDA", "GDPR", "Услуги", "Пълном."].map((label, i) => (
            <div
              key={label}
              className={`flex items-center justify-between rounded border px-2 py-1.5 text-[9px] font-medium tracking-wide ${
                i === 2
                  ? "border-gold/50 bg-gold/10 text-gold"
                  : "border-hairline bg-card/60 text-muted-foreground"
              }`}
            >
              <span>{label}</span>
              <span className={`h-1 w-1 rounded-full ${i === 2 ? "bg-gold" : "bg-foreground/30"}`} />
            </div>
          ))}
        </div>
      </div>
    );
  }
  // folders
  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg border border-hairline bg-navy-light/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <FolderTree className="h-3.5 w-3.5 text-gold" strokeWidth={1.6} />
        <div className="h-2 w-20 rounded-full bg-foreground/70" />
      </div>
      <div className="space-y-1.5">
        {["Договори 2026", "Контрагенти", "Подписани"].map((label, i) => (
          <div
            key={label}
            className="flex items-center gap-2 rounded border border-hairline bg-card/60 px-2 py-1.5"
          >
            <div className={`h-2.5 w-2.5 rounded-sm ${i === 1 ? "bg-gold" : "bg-foreground/30"}`} />
            <div className="h-1.5 flex-1 rounded-full bg-foreground/15" />
          </div>
        ))}
      </div>
      <div className="mt-3 flex items-center gap-1.5 border-t border-hairline pt-3">
        <Users className="h-3 w-3 text-gold" strokeWidth={1.6} />
        <div className="flex -space-x-1.5">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className={`inline-block h-4 w-4 rounded-full border border-card ${
                i === 0 ? "bg-gold/70" : i === 1 ? "bg-foreground/40" : "bg-foreground/25"
              }`}
            />
          ))}
        </div>
        <div className="ml-1 h-1.5 w-14 rounded-full bg-foreground/20" />
      </div>
    </div>
  );
}

export function PlatformShowcase() {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dragDx, setDragDx] = useState(0);
  const touchStart = useRef<{ x: number; y: number } | null>(null);
  const swipedRef = useRef(false);
  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    []
  );

  const n = SLIDES.length;
  const goTo = useCallback((i: number) => setIdx(((i % n) + n) % n), [n]);
  const next = useCallback(() => goTo(idx + 1), [goTo, idx]);
  const prev = useCallback(() => goTo(idx - 1), [goTo, idx]);

  useEffect(() => {
    if (paused || reducedMotion) return;
    const t = window.setTimeout(() => setIdx((i) => (i + 1) % n), ROTATE_MS);
    return () => window.clearTimeout(t);
  }, [idx, paused, reducedMotion, n]);

  const onTouchStart = (e: React.TouchEvent) => {
    const t = e.touches[0];
    touchStart.current = { x: t.clientX, y: t.clientY };
    swipedRef.current = false;
    setPaused(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    if (!touchStart.current) return;
    const t = e.touches[0];
    const dx = t.clientX - touchStart.current.x;
    const dy = t.clientY - touchStart.current.y;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 8) {
      e.preventDefault();
      setDragDx(Math.max(-200, Math.min(200, dx)));
    }
  };
  const onTouchEnd = () => {
    const dx = dragDx;
    touchStart.current = null;
    setDragDx(0);
    setPaused(false);
    if (Math.abs(dx) > 60) {
      swipedRef.current = true;
      if (dx < 0) next();
      else prev();
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowRight") {
      e.preventDefault();
      next();
    } else if (e.key === "ArrowLeft") {
      e.preventDefault();
      prev();
    }
  };

  return (
    <section
      aria-labelledby="platform-showcase-heading"
      className="relative overflow-hidden py-16 sm:py-20 md:py-24"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onKeyDown={onKeyDown}
      tabIndex={-1}
    >
      {/* Digitized corporate backdrop: skyline + deal motif + circuitry */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* soft ambient gold */}
        <div className="absolute inset-0 bg-[radial-gradient(60%_45%_at_50%_55%,hsl(var(--gold)/0.08),transparent_70%)]" />
        {/* digital grid */}
        <div
          className="absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(hsl(var(--gold)/0.6) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--gold)/0.6) 1px, transparent 1px)",
            backgroundSize: "56px 56px, 56px 56px",
            maskImage:
              "radial-gradient(ellipse 80% 60% at 50% 50%, #000 40%, transparent 80%)",
            WebkitMaskImage:
              "radial-gradient(ellipse 80% 60% at 50% 50%, #000 40%, transparent 80%)",
          }}
        />
        {/* skyline silhouette */}
        <svg
          className="absolute inset-x-0 bottom-0 h-[42%] w-full text-gold"
          viewBox="0 0 1600 400"
          preserveAspectRatio="xMidYEnd slice"
          fill="none"
        >
          <defs>
            <linearGradient id="ps-tower" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--gold))" stopOpacity="0.18" />
              <stop offset="100%" stopColor="hsl(var(--gold))" stopOpacity="0" />
            </linearGradient>
            <linearGradient id="ps-tower-2" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="hsl(var(--foreground))" stopOpacity="0.10" />
              <stop offset="100%" stopColor="hsl(var(--foreground))" stopOpacity="0" />
            </linearGradient>
          </defs>
          {/* back row */}
          <g fill="url(#ps-tower-2)" stroke="hsl(var(--gold) / 0.25)" strokeWidth="1">
            <rect x="60"  y="180" width="80"  height="220" />
            <rect x="160" y="140" width="60"  height="260" />
            <rect x="240" y="200" width="90"  height="200" />
            <rect x="350" y="120" width="70"  height="280" />
            <rect x="440" y="170" width="100" height="230" />
            <rect x="560" y="150" width="60"  height="250" />
            <rect x="640" y="190" width="120" height="210" />
            <rect x="780" y="130" width="80"  height="270" />
            <rect x="880" y="170" width="70"  height="230" />
            <rect x="970" y="110" width="100" height="290" />
            <rect x="1090" y="160" width="80"  height="240" />
            <rect x="1190" y="200" width="120" height="200" />
            <rect x="1330" y="140" width="70"  height="260" />
            <rect x="1420" y="180" width="110" height="220" />
          </g>
          {/* front taller towers with windows */}
          <g>
            <rect x="300" y="80"  width="60"  height="320" fill="url(#ps-tower)" stroke="hsl(var(--gold) / 0.45)" />
            <rect x="700" y="50"  width="70"  height="350" fill="url(#ps-tower)" stroke="hsl(var(--gold) / 0.5)" />
            <rect x="1020" y="70" width="60"  height="330" fill="url(#ps-tower)" stroke="hsl(var(--gold) / 0.45)" />
            <rect x="1280" y="90" width="55"  height="310" fill="url(#ps-tower)" stroke="hsl(var(--gold) / 0.4)" />
          </g>
          {/* window dots */}
          <g fill="hsl(var(--gold) / 0.55)">
            {Array.from({ length: 10 }).map((_, r) =>
              [320, 720, 1040, 1300].map((x, ci) => (
                <g key={`${r}-${ci}`}>
                  <rect x={x}      y={110 + r * 28} width="6" height="6" />
                  <rect x={x + 14} y={110 + r * 28} width="6" height="6" opacity="0.6" />
                  <rect x={x + 28} y={110 + r * 28} width="6" height="6" opacity="0.85" />
                </g>
              ))
            )}
          </g>
          {/* antennae */}
          <g stroke="hsl(var(--gold) / 0.6)" strokeWidth="1.2">
            <line x1="330" y1="80"  x2="330" y2="50" />
            <line x1="735" y1="50"  x2="735" y2="14" />
            <line x1="1050" y1="70" x2="1050" y2="38" />
          </g>
        </svg>

        {/* deal motif: handshake-inspired arcs meeting */}
        <svg
          className="absolute right-[6%] top-10 hidden h-40 w-64 md:block"
          viewBox="0 0 256 160"
          fill="none"
        >
          <circle cx="64" cy="80" r="58" stroke="hsl(var(--gold) / 0.35)" strokeWidth="1" />
          <circle cx="192" cy="80" r="58" stroke="hsl(var(--gold) / 0.35)" strokeWidth="1" />
          <circle cx="128" cy="80" r="14" fill="none" stroke="hsl(var(--gold))" strokeWidth="1.4" />
          <path
            d="M128 66 l6 8 l-9 12"
            stroke="hsl(var(--gold))"
            strokeWidth="1.6"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <line x1="6" y1="80" x2="48" y2="80" stroke="hsl(var(--gold) / 0.4)" strokeDasharray="2 4" />
          <line x1="208" y1="80" x2="250" y2="80" stroke="hsl(var(--gold) / 0.4)" strokeDasharray="2 4" />
        </svg>
      </div>


      <div className="container relative">
        <div className="mx-auto mb-10 max-w-2xl text-center sm:mb-14">
          <div className="mb-3 inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-gold">
            <span className="h-px w-6 bg-gold/50" />
            Платформата
            <span className="h-px w-6 bg-gold/50" />
          </div>
          <h2
            id="platform-showcase-heading"
            className="font-serif text-3xl font-bold leading-tight text-foreground sm:text-4xl md:text-5xl"
          >
            Всичко за вашите договори —
            <span className="block text-gold">в едно работно пространство</span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Четири стълба, които превръщат правната работа в спокойна, бърза и точна.
          </p>
        </div>

        {/* Coverflow stage */}
        <div
          className="relative mx-auto select-none overflow-hidden"
          style={{ perspective: "1800px", touchAction: "pan-y" }}
          onTouchStart={onTouchStart}
          onTouchMove={onTouchMove}
          onTouchEnd={onTouchEnd}
          onTouchCancel={onTouchEnd}
        >
          <div className="relative mx-auto h-[560px] w-full max-w-6xl sm:h-[620px] md:h-[660px]">
            {SLIDES.map((slide, i) => {
              // shortest signed distance on a ring
              let delta = i - idx;
              if (delta > n / 2) delta -= n;
              if (delta < -n / 2) delta += n;
              const abs = Math.abs(delta);
              const isActive = delta === 0;

              const translateX = delta * 300 + (isActive ? dragDx : dragDx * 0.4);
              const rotateY = reducedMotion ? 0 : delta * -16;
              const scale = abs === 0 ? 1 : abs === 1 ? 0.84 : 0.68;
              const opacity = abs === 0 ? 1 : abs === 1 ? 0.55 : 0.22;
              const z = 10 - abs;

              const { Icon } = slide;

              return (
                <button
                  key={slide.id}
                  type="button"
                  aria-label={slide.title}
                  aria-hidden={!isActive}
                  tabIndex={isActive ? 0 : -1}
                  onClick={() => {
                    if (swipedRef.current) {
                      swipedRef.current = false;
                      return;
                    }
                    if (!isActive) goTo(i);
                  }}
                  className="group absolute left-1/2 top-1/2 -ml-[230px] -mt-[270px] block h-[540px] w-[460px] rounded-2xl border border-hairline bg-card/95 text-left shadow-elegant outline-none transition-[transform,opacity,box-shadow] duration-700 ease-[cubic-bezier(.22,1,.36,1)] focus-visible:ring-2 focus-visible:ring-gold/60 sm:h-[600px] sm:w-[520px] sm:-ml-[260px] sm:-mt-[300px] md:h-[640px] md:w-[560px] md:-ml-[280px] md:-mt-[320px]"
                  style={{
                    transform: `translate3d(${translateX}px,0,0) rotateY(${rotateY}deg) scale(${scale})`,
                    opacity,
                    zIndex: z,
                    pointerEvents: abs > 2 ? "none" : "auto",
                    boxShadow: isActive
                      ? "0 30px 60px -20px hsl(var(--gold) / 0.25), 0 0 0 1px hsl(var(--gold) / 0.2) inset"
                      : undefined,
                    transformStyle: "preserve-3d",
                  }}
                >
                  {/* Corner ornaments on active */}
                  {isActive && (
                    <>
                      <span className="pointer-events-none absolute left-2 top-2 h-3 w-3 border-l border-t border-gold/50" />
                      <span className="pointer-events-none absolute right-2 top-2 h-3 w-3 border-r border-t border-gold/50" />
                      <span className="pointer-events-none absolute bottom-2 left-2 h-3 w-3 border-b border-l border-gold/50" />
                      <span className="pointer-events-none absolute bottom-2 right-2 h-3 w-3 border-b border-r border-gold/50" />
                    </>
                  )}

                  <div className="flex h-full flex-col p-6 sm:p-7">
                    <div className="mb-4 inline-flex items-center gap-2 self-start rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.2em] text-gold">
                      <Icon className="h-3.5 w-3.5" strokeWidth={1.6} />
                      {slide.kicker}
                    </div>

                    <h3 className="font-serif text-xl font-bold leading-snug text-foreground sm:text-2xl">
                      {slide.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted-foreground sm:text-[15px]">
                      {slide.description}
                    </p>

                    <div className="mt-5 flex-1">
                      <MiniVisual kind={slide.visual} />
                    </div>

                    {/* Animated bottom accent */}
                    <div className="relative mt-4 h-px overflow-hidden bg-hairline">
                      <span
                        className={`absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-gold/80 to-transparent ${
                          isActive ? "animate-[platform-beam_3.2s_ease-in-out_infinite]" : ""
                        }`}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Arrows */}
          <button
            type="button"
            onClick={prev}
            aria-label="Предишна функция"
            className="absolute left-2 top-1/2 z-20 -translate-y-1/2 rounded-full border border-hairline bg-card/90 p-2.5 text-foreground/80 backdrop-blur transition-colors hover:border-gold/60 hover:text-gold sm:left-6"
          >
            <ChevronLeft className="h-5 w-5" strokeWidth={1.6} />
          </button>
          <button
            type="button"
            onClick={next}
            aria-label="Следваща функция"
            className="absolute right-2 top-1/2 z-20 -translate-y-1/2 rounded-full border border-hairline bg-card/90 p-2.5 text-foreground/80 backdrop-blur transition-colors hover:border-gold/60 hover:text-gold sm:right-6"
          >
            <ChevronRight className="h-5 w-5" strokeWidth={1.6} />
          </button>
        </div>

        {/* Dots + progress + counter */}
        <div className="mx-auto mt-8 flex max-w-md items-center gap-4">
          <div className="flex items-center gap-1.5">
            {SLIDES.map((s, i) => (
              <button
                key={s.id}
                type="button"
                aria-label={`Покажи ${i + 1} от ${n}`}
                onClick={() => goTo(i)}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === idx ? "w-7 bg-gold" : "w-1.5 bg-gold/30 hover:bg-gold/60"
                }`}
              />
            ))}
          </div>
          <div className="relative h-px flex-1 overflow-hidden bg-hairline">
            <div
              key={`${idx}-${paused ? "p" : "r"}`}
              className="absolute inset-y-0 left-0 bg-gold/70"
              style={{
                width: "100%",
                animation:
                  paused || reducedMotion
                    ? "none"
                    : `platform-progress ${ROTATE_MS}ms linear forwards`,
              }}
            />
          </div>
          <span
            aria-live="polite"
            className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground"
          >
            {String(idx + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
          </span>
        </div>

        {/* CTA */}
        <div className="mt-10 flex flex-col items-center justify-center gap-3 sm:mt-12">
          <Link
            to="/account#plans"
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-gold/50 bg-gradient-to-r from-gold/15 via-gold/10 to-gold/15 px-6 py-3 text-sm font-semibold tracking-wide text-gold shadow-elegant transition-all duration-300 hover:border-gold hover:from-gold/25 hover:via-gold/15 hover:to-gold/25 hover:shadow-[0_10px_40px_-10px_hsl(var(--gold)/0.5)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-gold/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <span className="relative">Вижте плановете</span>
            <ArrowRight
              className="relative h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5"
              strokeWidth={1.8}
            />
          </Link>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            Започнете още днес — без обвързване
          </p>
        </div>
      </div>


      <style>{`
        @keyframes platform-progress {
          from { transform: translateX(-100%); }
          to { transform: translateX(0); }
        }
        @keyframes platform-beam {
          0% { transform: translateX(-100%); }
          100% { transform: translateX(200%); }
        }
        @keyframes ai-sweep {
          0% { transform: translateX(-100%); opacity: 0; }
          40% { opacity: 1; }
          100% { transform: translateX(100%); opacity: 0; }
        }
      `}</style>
    </section>
  );
}
