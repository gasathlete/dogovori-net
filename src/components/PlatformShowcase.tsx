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
  Search,
  Check,
  AlertTriangle,
  Download,
  ChevronDown,
  Folder,
  Share2,
  ListChecks,
  PenLine,
} from "lucide-react";

type FeatureSlide = {
  id: string;
  kicker: string;
  title: string;
  description: string;
  Icon: typeof Briefcase;
  visual: "wizard" | "contract" | "ai" | "catalog" | "folders";
};

const SLIDES: FeatureSlide[] = [
  {
    id: "easy-create",
    kicker: "Изготвяне на документи",
    title: "Лесно създаване на документи",
    description:
      "Отговаряте на въпроси на български — системата генерира готов договор с правилни клаузи.",
    Icon: PenLine,
    visual: "wizard",
  },
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
    title: "625+ образци, подредени по сектори",
    description:
      "От наем и трудови правоотношения, до NDA, GDPR, пълномощни и декларации. Намерете точния шаблон за секунди.",
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

/**
 * Digitized excerpts of real screens from dogovori.net.
 * Each visual mirrors the actual UI components from the live site —
 * stylized at small scale with the same patterns, copy and colors.
 */
function MiniVisual({ kind }: { kind: FeatureSlide["visual"] }) {
  // Shared "browser chrome" wrapper that frames each excerpt as a captured screen.
  const Frame = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="relative h-full w-full overflow-hidden rounded-xl border border-hairline bg-navy/60 shadow-inner">
      {/* window chrome */}
      <div className="flex items-center gap-2 border-b border-hairline bg-navy-light/70 px-3 py-2 sm:px-4 sm:py-2.5">
        <span className="h-2 w-2 rounded-full bg-foreground/25" />
        <span className="h-2 w-2 rounded-full bg-foreground/25" />
        <span className="h-2 w-2 rounded-full bg-foreground/25" />
        <div className="ml-2 flex-1 truncate rounded-sm border border-hairline bg-navy/60 px-2.5 py-1 text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:text-[11px]">
          dogovori.net{label}
        </div>
      </div>
      {/* scanline / digitized overlay */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(0deg, hsl(var(--gold)) 0 1px, transparent 1px 3px)",
        }}
      />
      {/* Reserve bottom padding so the caption band doesn't cover content */}
      <div className="relative h-[calc(100%-38px)] overflow-hidden p-4 pb-28 sm:p-5 sm:pb-32">
        {children}
      </div>
    </div>
  );

  if (kind === "wizard") {
    return (
      <Frame label="/wizard">
        <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] text-muted-foreground sm:text-[11px]">
          <span className="inline-flex items-center gap-1.5 text-gold">
            <PenLine className="h-3.5 w-3.5" strokeWidth={1.8} />
            Стъпка 3 / 8
          </span>
          <span>Трудов договор</span>
        </div>
        <div className="mb-3 h-1.5 w-full overflow-hidden rounded-full bg-foreground/10">
          <div className="h-full w-[38%] rounded-full bg-gradient-to-r from-gold/70 to-gold" />
        </div>
        <div className="rounded-lg border border-hairline bg-card/70 p-3 sm:p-4">
          <div className="mb-3 text-sm font-semibold leading-snug text-foreground sm:text-base">
            Какъв е срокът на договора?
          </div>
          <div className="space-y-2">
            {[
              { t: "Безсрочен", active: true },
              { t: "Срочен — до 1 година", active: false },
              { t: "За определена задача", active: false },
            ].map((o) => (
              <div
                key={o.t}
                className={`flex items-center gap-2.5 rounded-md border px-3 py-2 text-xs sm:text-[13px] ${
                  o.active
                    ? "border-gold/60 bg-gold/10 text-gold"
                    : "border-hairline bg-navy-light/40 text-muted-foreground"
                }`}
              >
                <span
                  className={`grid h-3.5 w-3.5 place-items-center rounded-full border ${
                    o.active ? "border-gold bg-gold/20" : "border-foreground/30"
                  }`}
                >
                  {o.active && <span className="h-1.5 w-1.5 rounded-full bg-gold" />}
                </span>
                {o.t}
              </div>
            ))}
          </div>
        </div>
      </Frame>
    );
  }

  if (kind === "contract") {
    return (
      <Frame label="/document">
        <div className="mb-3 flex items-center justify-between">
          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-gold sm:text-[11px]">
            <FileText className="h-3.5 w-3.5" strokeWidth={1.8} />
            Готов договор
          </div>
          <span className="inline-flex items-center gap-1.5 rounded-md border border-gold/50 bg-gold/10 px-2 py-1 text-[10px] font-semibold text-gold sm:text-[11px]">
            <Download className="h-3 w-3" strokeWidth={1.8} />
            .docx
          </span>
        </div>
        <div className="rounded-lg border border-hairline bg-card/80 p-3 sm:p-4">
          <div className="mb-1.5 text-center font-serif text-sm font-bold leading-tight text-foreground sm:text-base">
            ДОГОВОР ЗА НАЕМ
          </div>
          <div className="mb-3 text-center text-[9px] uppercase tracking-[0.2em] text-muted-foreground sm:text-[10px]">
            № 2026/041 · гр. София
          </div>
          <div className="space-y-1.5">
            <div className="h-1.5 w-full rounded-full bg-foreground/15" />
            <div className="h-1.5 w-[92%] rounded-full bg-foreground/15" />
            <div className="h-1.5 w-[78%] rounded-full bg-gold/55" />
            <div className="h-1.5 w-[88%] rounded-full bg-foreground/15" />
            <div className="h-1.5 w-[64%] rounded-full bg-gold/55" />
            <div className="h-1.5 w-[95%] rounded-full bg-foreground/15" />
            <div className="h-1.5 w-[70%] rounded-full bg-foreground/15" />
          </div>
          <div className="mt-3 flex items-end justify-between border-t border-hairline pt-3">
            <div className="space-y-1">
              <div className="h-0.5 w-14 rounded-full bg-foreground/40" />
              <div className="text-[9px] text-muted-foreground sm:text-[10px]">Наемодател</div>
            </div>
            <div className="space-y-1 text-right">
              <div className="ml-auto h-0.5 w-14 rounded-full bg-foreground/40" />
              <div className="text-[9px] text-muted-foreground sm:text-[10px]">Наемател</div>
            </div>
          </div>
        </div>
      </Frame>
    );
  }

  if (kind === "ai") {
    return (
      <Frame label="/uploaded">
        <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold sm:text-[11px]">
          <Wand2 className="h-3.5 w-3.5" strokeWidth={1.8} /> AI анализ
        </div>
        <div className="space-y-2">
          <div className="rounded-md border border-amber-500/40 bg-amber-500/10 p-2.5">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-400" strokeWidth={2} />
              <div className="flex-1">
                <div className="text-xs font-semibold text-amber-300 sm:text-[13px]">
                  Липсваща клауза: неустойка
                </div>
                <div className="mt-1 h-1 w-[80%] rounded-full bg-foreground/15" />
              </div>
            </div>
          </div>
          <div className="rounded-md border border-emerald-500/40 bg-emerald-500/10 p-2.5">
            <div className="flex items-start gap-2">
              <Check className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-400" strokeWidth={2.4} />
              <div className="flex-1">
                <div className="text-xs font-semibold text-emerald-300 sm:text-[13px]">
                  Срок и предмет — коректни
                </div>
                <div className="mt-1 h-1 w-[60%] rounded-full bg-foreground/15" />
              </div>
            </div>
          </div>
          <div className="rounded-md border border-gold/40 bg-gold/10 p-2.5">
            <div className="flex items-start gap-2">
              <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-gold" strokeWidth={2} />
              <div className="flex-1">
                <div className="text-xs font-semibold text-gold sm:text-[13px]">
                  Препоръка: арбитражна клауза
                </div>
                <div className="relative mt-1 h-1 w-full overflow-hidden rounded-full bg-foreground/15">
                  <span className="absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-gold/0 via-gold/80 to-gold/0 animate-[ai-sweep_2.4s_ease-in-out_infinite]" />
                </div>
              </div>
            </div>
          </div>
        </div>
      </Frame>
    );
  }

  if (kind === "catalog") {
    return (
      <Frame label="/catalog">
        <div className="mb-3 flex items-center gap-2 rounded-md border border-hairline bg-card/70 px-3 py-2">
          <Search className="h-3.5 w-3.5 text-gold" strokeWidth={1.8} />
          <span className="text-xs text-muted-foreground sm:text-[13px]">Търсете: NDA, наем…</span>
        </div>
        <div className="mb-3 flex flex-wrap gap-1.5">
          {["Труд", "Наем", "NDA", "GDPR", "Услуги"].map((label, i) => (
            <span
              key={label}
              className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider sm:text-[11px] ${
                i === 2
                  ? "border-gold/60 bg-gold/15 text-gold"
                  : "border-hairline bg-navy-light/40 text-muted-foreground"
              }`}
            >
              {label}
            </span>
          ))}
        </div>
        <div className="space-y-2">
          {[
            { t: "NDA — едностранно", s: "Конфиденциалност" },
            { t: "Договор за наем", s: "Имоти" },
            { t: "Трудов договор", s: "Труд" },
          ].map((c, i) => (
            <div
              key={c.t}
              className={`flex items-center justify-between rounded-md border px-3 py-2 ${
                i === 0 ? "border-gold/50 bg-gold/10" : "border-hairline bg-card/60"
              }`}
            >
              <div>
                <div className={`text-xs font-semibold sm:text-[13px] ${i === 0 ? "text-gold" : "text-foreground"}`}>
                  {c.t}
                </div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground sm:text-[10px]">
                  {c.s}
                </div>
              </div>
              <ChevronRight className={`h-3.5 w-3.5 ${i === 0 ? "text-gold" : "text-muted-foreground"}`} strokeWidth={2} />
            </div>
          ))}
        </div>
      </Frame>
    );
  }

  // folders
  return (
    <Frame label="/account">
      <div className="mb-3 flex items-center justify-between text-[10px] uppercase tracking-[0.18em] sm:text-[11px]">
        <span className="inline-flex items-center gap-1.5 text-gold">
          <FolderTree className="h-3.5 w-3.5" strokeWidth={1.8} />
          Моите документи
        </span>
        <span className="text-muted-foreground">24 файла</span>
      </div>
      <div className="space-y-1.5">
        {[
          { t: "Договори 2026", c: 12, open: true },
          { t: "Контрагенти", c: 8, open: false },
          { t: "Подписани", c: 4, open: false },
        ].map((f) => (
          <div
            key={f.t}
            className={`flex items-center gap-2 rounded-md border px-3 py-1.5 ${
              f.open ? "border-gold/50 bg-gold/10" : "border-hairline bg-card/60"
            }`}
          >
            <ChevronDown
              className={`h-3 w-3 ${f.open ? "text-gold" : "text-muted-foreground -rotate-90"}`}
              strokeWidth={2}
            />
            <Folder className={`h-3.5 w-3.5 ${f.open ? "text-gold" : "text-foreground/50"}`} strokeWidth={1.8} />
            <span className={`text-xs font-medium sm:text-[13px] ${f.open ? "text-gold" : "text-foreground"}`}>
              {f.t}
            </span>
            <span className="ml-auto text-[10px] text-muted-foreground sm:text-[11px]">{f.c}</span>
          </div>
        ))}
        <div className="ml-5 flex items-center gap-2 rounded-md border border-hairline bg-navy-light/40 px-3 py-1.5">
          <FileText className="h-3.5 w-3.5 text-gold/80" strokeWidth={1.8} />
          <span className="truncate text-[11px] text-foreground sm:text-xs">
            Наем-офис-ул.Раковски.docx
          </span>
        </div>
      </div>
    </Frame>
  );
}

export function PlatformShowcase() {
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [vw, setVw] = useState<number>(() => (typeof window !== "undefined" ? window.innerWidth : 1280));
  useEffect(() => {
    const onResize = () => setVw(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
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
      className="relative overflow-hidden py-20 sm:py-24 md:py-28"
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
        {/* skyline silhouette — smaller on mobile, fades to give CTA breathing room */}
        <svg
          className="absolute inset-x-0 bottom-0 h-[9%] w-full text-gold opacity-45 sm:h-[14%] sm:opacity-55 md:h-[16%] md:opacity-60"
          viewBox="0 0 1600 400"
          preserveAspectRatio="xMidYEnd slice"
          fill="none"
          style={{
            maskImage:
              "linear-gradient(to top, #000 60%, transparent 100%)",
            WebkitMaskImage:
              "linear-gradient(to top, #000 60%, transparent 100%)",
          }}
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
          <g>
            <rect x="300" y="80"  width="60"  height="320" fill="url(#ps-tower)" stroke="hsl(var(--gold) / 0.45)" />
            <rect x="700" y="50"  width="70"  height="350" fill="url(#ps-tower)" stroke="hsl(var(--gold) / 0.5)" />
            <rect x="1020" y="70" width="60"  height="330" fill="url(#ps-tower)" stroke="hsl(var(--gold) / 0.45)" />
            <rect x="1280" y="90" width="55"  height="310" fill="url(#ps-tower)" stroke="hsl(var(--gold) / 0.4)" />
          </g>
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
          <g stroke="hsl(var(--gold) / 0.6)" strokeWidth="1.2">
            <line x1="330" y1="80"  x2="330" y2="50" />
            <line x1="735" y1="50"  x2="735" y2="14" />
            <line x1="1050" y1="70" x2="1050" y2="38" />
          </g>
        </svg>

        {/* deal motif: fountain pen signing a contract — animated */}
        <svg
          className="absolute right-[4%] top-6 hidden h-40 w-64 md:block lg:right-[6%] lg:h-44 lg:w-72"
          viewBox="0 0 288 176"
          fill="none"
        >
          {/* subtle drop-shadow glow under the document */}
          <ellipse cx="95" cy="166" rx="78" ry="6" fill="hsl(var(--gold) / 0.12)" />

          {/* Contract / document — gentle settle-in */}
          <g className="ps-doc">
            <rect
              x="20"
              y="22"
              width="150"
              height="138"
              rx="4"
              fill="hsl(var(--card) / 0.65)"
              stroke="hsl(var(--gold) / 0.5)"
              strokeWidth="1"
            />
            <path
              d="M150 22 L170 42 L150 42 Z"
              fill="hsl(var(--gold) / 0.22)"
              stroke="hsl(var(--gold) / 0.5)"
              strokeWidth="1"
            />
            <rect x="32" y="36" width="60" height="4" rx="2" fill="hsl(var(--gold) / 0.75)" />
            <g stroke="hsl(var(--foreground) / 0.35)" strokeWidth="1" strokeLinecap="round">
              <line x1="32" y1="54" x2="158" y2="54" />
              <line x1="32" y1="64" x2="150" y2="64" />
              <line x1="32" y1="74" x2="156" y2="74" />
              <line x1="32" y1="84" x2="140" y2="84" />
              <line x1="32" y1="94" x2="154" y2="94" />
            </g>
            <line
              x1="32"
              y1="132"
              x2="110"
              y2="132"
              stroke="hsl(var(--foreground) / 0.5)"
              strokeWidth="1"
            />
            {/* signature flourish — drawn-on */}
            <path
              className="ps-sign"
              d="M36 128 C 48 116, 56 140, 68 126 S 86 118, 96 130"
              stroke="hsl(var(--gold))"
              strokeWidth="1.8"
              fill="none"
              strokeLinecap="round"
              pathLength={1}
            />

            {/* check seal — stamps in */}
            <g className="ps-seal" style={{ transformOrigin: "138px 132px" }}>
              <circle
                cx="138"
                cy="132"
                r="11"
                fill="hsl(var(--gold) / 0.12)"
                stroke="hsl(var(--gold))"
                strokeWidth="1.4"
              />
              <path
                d="M133 132 l4 4 l7 -8"
                stroke="hsl(var(--gold))"
                strokeWidth="1.8"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              {/* impact ring */}
              <circle
                className="ps-seal-ring"
                cx="138"
                cy="132"
                r="11"
                fill="none"
                stroke="hsl(var(--gold))"
                strokeWidth="1.2"
              />
            </g>
          </g>

          {/* Fountain pen — glides along signature */}
          <g className="ps-pen" transform="translate(40 124) rotate(-32)">
            <rect
              x="0"
              y="-5"
              width="120"
              height="10"
              rx="3"
              fill="hsl(var(--navy-light) / 0.95)"
              stroke="hsl(var(--gold) / 0.6)"
              strokeWidth="1"
            />
            <rect x="36" y="-6" width="6" height="12" fill="hsl(var(--gold) / 0.6)" />
            <rect
              x="116"
              y="-6"
              width="10"
              height="12"
              rx="2"
              fill="hsl(var(--gold) / 0.55)"
              stroke="hsl(var(--gold))"
              strokeWidth="1"
            />
            <rect x="100" y="-9" width="14" height="3" rx="1" fill="hsl(var(--gold))" />
            <path
              d="M0 -5 L-14 0 L0 5 Z"
              fill="hsl(var(--gold))"
              stroke="hsl(var(--gold))"
              strokeWidth="1"
              strokeLinejoin="round"
            />
            <line x1="-12" y1="0" x2="-2" y2="0" stroke="hsl(var(--navy) / 0.9)" strokeWidth="0.8" />
          </g>

          <line x1="6" y1="92" x2="22" y2="92" stroke="hsl(var(--gold) / 0.4)" strokeDasharray="2 4" />
          <line x1="172" y1="92" x2="282" y2="92" stroke="hsl(var(--gold) / 0.35)" strokeDasharray="2 4" />
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
            Всичко за Вашите сделки —
            <span className="block text-gold">в едно работно пространство</span>
          </h2>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground sm:text-base">
            Пет стълба, които превръщат документалната работа в спокойна, лесна, бърза и акуратна.
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
          <div className="relative mx-auto h-[400px] w-full max-w-6xl sm:h-[500px] md:h-[560px] lg:h-[600px] xl:h-[640px]">
            {SLIDES.map((slide, i) => {
              // shortest signed distance on a ring
              let delta = i - idx;
              if (delta > n / 2) delta -= n;
              if (delta < -n / 2) delta += n;
              const abs = Math.abs(delta);
              const isActive = delta === 0;

              // Responsive offsets — tighter on mobile to avoid edge clipping
              const isMobileVP = vw < 640;
              const offset = isMobileVP ? 180 : 300;
              const translateX = delta * offset + (isActive ? dragDx : dragDx * 0.4);
              const rotateY = reducedMotion ? 0 : delta * (isMobileVP ? -22 : -16);
              const scale = abs === 0 ? 1 : abs === 1 ? (isMobileVP ? 0.7 : 0.84) : (isMobileVP ? 0.5 : 0.68);
              const opacity = abs === 0 ? 1 : abs === 1 ? 0.5 : 0.18;
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
                  className="group absolute left-1/2 top-1/2 -ml-[140px] -mt-[200px] block h-[400px] w-[280px] rounded-2xl border border-hairline bg-card/95 text-left shadow-elegant outline-none transition-[transform,opacity,box-shadow] duration-700 ease-[cubic-bezier(.22,1,.36,1)] focus-visible:ring-2 focus-visible:ring-gold/60 sm:h-[560px] sm:w-[460px] sm:-ml-[230px] sm:-mt-[280px] md:h-[640px] md:w-[560px] md:-ml-[280px] md:-mt-[320px] lg:h-[680px] lg:-mt-[340px] xl:h-[740px] xl:-mt-[370px]"
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

                  <div className="relative flex h-full flex-col overflow-hidden rounded-2xl">
                    {/* Visual fills the entire card */}
                    <div className="absolute inset-0">
                      <MiniVisual kind={slide.visual} />
                    </div>

                    {/* Caption band — translucent overlay at the bottom */}
                    <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 border-t border-hairline bg-gradient-to-t from-navy via-navy/95 to-navy/0 px-5 pb-5 pt-10 sm:px-6 sm:pb-6">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1 overflow-hidden">
                          <h3 className="font-serif text-base font-bold leading-snug text-foreground break-words sm:text-xl md:text-2xl">
                            {slide.title}
                          </h3>
                          <p className="mt-1.5 line-clamp-2 text-[12px] leading-relaxed text-muted-foreground sm:text-sm">
                            {slide.description}
                          </p>
                        </div>
                        {/* Kicker chip — bottom-right */}
                        <span className="inline-flex max-w-[6.5rem] shrink-0 items-center gap-1.5 truncate rounded-full border border-gold/40 bg-navy/85 px-2 py-1 text-[9px] font-semibold uppercase tracking-[0.18em] text-gold backdrop-blur sm:max-w-[8rem] sm:px-2.5 sm:text-[10px] sm:tracking-[0.2em] md:max-w-[10rem] lg:max-w-[12rem]">
                          <Icon className="h-3.5 w-3.5 shrink-0" strokeWidth={1.6} />
                          <span className="truncate">{slide.kicker}</span>
                        </span>
                      </div>
                      <div className="relative mt-3 h-px overflow-hidden bg-hairline">
                        <span
                          className={`absolute inset-y-0 left-0 w-1/2 bg-gradient-to-r from-transparent via-gold/80 to-transparent ${
                            isActive ? "animate-[platform-beam_3.2s_ease-in-out_infinite]" : ""
                          }`}
                        />
                      </div>
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
          <div className="flex-1" />

          <span
            aria-live="polite"
            className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground"
          >
            {String(idx + 1).padStart(2, "0")} / {String(n).padStart(2, "0")}
          </span>
        </div>

        {/* CTA */}
        <div className="relative z-10 mx-auto mt-12 flex max-w-xl flex-col items-center justify-center gap-3 rounded-2xl border border-hairline bg-card/85 px-6 py-6 backdrop-blur-md sm:mt-16">
          <Link
            to="/plans"
            className="ps-cta group relative inline-flex items-center gap-2 overflow-hidden rounded-full border border-gold/60 bg-gradient-to-r from-gold/20 via-gold/15 to-gold/20 px-7 py-3 text-sm font-semibold tracking-wide text-gold transition-all duration-300 hover:border-gold hover:from-gold/30 hover:via-gold/20 hover:to-gold/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/60"
          >
            <span className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-gold/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" />
            <span className="relative">Вижте плановете</span>
            <ArrowRight
              className="relative h-4 w-4 transition-transform duration-300 group-hover:translate-x-1"
              strokeWidth={1.8}
            />
          </Link>
          <p className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground">
            ЗАПОЧНЕТЕ ОЩЕ ДНЕС — БЕЗ КАРТА&nbsp;
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
        /* Deal motif — 7s loop aligned with carousel rotation, building toward CTA */
        @keyframes ps-sign-draw {
          0%, 10%  { stroke-dasharray: 1; stroke-dashoffset: 1; }
          32%      { stroke-dasharray: 1; stroke-dashoffset: 0; }
          100%     { stroke-dasharray: 1; stroke-dashoffset: 0; }
        }
        @keyframes ps-pen-glide {
          0%, 10%  { transform: translate(36px, 124px) rotate(-32deg); }
          32%      { transform: translate(82px, 124px) rotate(-30deg); }
          42%      { transform: translate(96px, 122px) rotate(-28deg); }
          90%      { transform: translate(96px, 122px) rotate(-28deg); }
          100%     { transform: translate(36px, 124px) rotate(-32deg); }
        }
        @keyframes ps-seal-stamp {
          0%, 42%   { transform: scale(0); opacity: 0; }
          50%       { transform: scale(1.3); opacity: 1; }
          56%       { transform: scale(0.92); opacity: 1; }
          62%, 100% { transform: scale(1); opacity: 1; }
        }
        @keyframes ps-seal-ring-anim {
          0%, 48%   { transform: scale(1); opacity: 0; }
          52%       { transform: scale(1); opacity: 0.9; }
          75%       { transform: scale(2.2); opacity: 0; }
          100%      { transform: scale(2.2); opacity: 0; }
        }
        @keyframes ps-doc-settle {
          0%, 100% { transform: translateY(0) translateX(0); }
          50%      { transform: translateY(-2px) translateX(0.5px); }
        }
        @keyframes ps-cta-pulse {
          0%, 60%, 100% { box-shadow: 0 6px 22px -12px hsl(var(--gold) / 0.35); transform: translateY(0); }
          72%           { box-shadow: 0 18px 48px -10px hsl(var(--gold) / 0.75); transform: translateY(-2px); }
          85%           { box-shadow: 0 14px 36px -10px hsl(var(--gold) / 0.55); transform: translateY(-1px); }
        }
        .ps-doc       { animation: ps-doc-settle 7s ease-in-out infinite; transform-origin: 95px 90px; }
        .ps-sign      { animation: ps-sign-draw 7s ease-in-out infinite; }
        .ps-pen       { animation: ps-pen-glide 7s cubic-bezier(.4,.1,.3,1) infinite; transform-box: fill-box; transform-origin: 0 0; }
        .ps-seal     { animation: ps-seal-stamp 7s ease-out infinite; transform-box: fill-box; transform-origin: 138px 132px; }
        .ps-seal-ring{ animation: ps-seal-ring-anim 7s ease-out infinite; transform-box: fill-box; transform-origin: 138px 132px; }
        .ps-cta       { animation: ps-cta-pulse 7s ease-in-out infinite; }
        .ps-cta:hover { animation-play-state: paused; box-shadow: 0 16px 44px -10px hsl(var(--gold) / 0.7) !important; }
        @media (prefers-reduced-motion: reduce) {
          .ps-doc, .ps-sign, .ps-pen, .ps-seal, .ps-seal-ring, .ps-cta { animation: none !important; }
        }
      `}</style>
    </section>
  );
}
