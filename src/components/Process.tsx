import { useEffect, useRef, useState } from "react";
import {
  ListChecks,
  ClipboardList,
  ShieldCheck,
  FileCheck2,
  FolderArchive,
  BookOpen,
  ChevronDown,
} from "lucide-react";

const STEPS = [
  {
    icon: ListChecks,
    n: "01",
    title: "Намери или създай документ",
    text: "Разгледайте каталога с разнообразие от правни документи. Ако не намерите правилен, използвайте системата, за да създадете документ за >2 минути.",
    detail:
      "600+ шаблона по сектори, със стратегически тагове, законови референции и възможност за индивидуален „build from scratch" чрез AI асистент.",
  },
  {
    icon: ClipboardList,
    n: "02",
    title: "Стратегическо интервю",
    text: "Отговорете на индивидуален въпросник, изграден от експертите ни за конкретния тип договор/декларация.",
    detail:
      "Динамичен граф от въпроси с условна логика — въпросите се появяват само когато са релевантни за вашия казус.",
  },
  {
    icon: ShieldCheck,
    n: "03",
    title: "Анализ на риска и корекции",
    text: "Системата идентифицира слаби места и предлага автоматични корекции на проблемните клаузи.",
    detail:
      "AI risk-meter сканира за липсващи защитни клаузи (форсмажор, неустойка, severability) и предлага конкретни правни редакции.",
  },
  {
    icon: FileCheck2,
    n: "04",
    title: "Готов документ",
    text: "Експортирайте професионално изготвения договор в PDF или DOCX, или го подпишете директно с електронен подпис.",
    detail:
      "Включва воден знак, audit trail, поддръжка на КЕП (квалифициран електронен подпис) и многостранно подписване.",
  },
  {
    icon: FolderArchive,
    n: "05",
    title: "Съхраняване и подреждане",
    text: "Организирайте цялата си документация на едно място — с тагове, версии и бърз достъп до всеки договор в Профил.",
    detail:
      "Папки, контрагенти, споделяне с екип, история на версиите и експорт на цели колекции.",
  },
  {
    icon: BookOpen,
    n: "06",
    title: "Блог",
    text: "Разрастваща се мрежа от статии, засягащи най-актуалните теми за документи, коментари, въпроси и мнения.",
    detail:
      "Експертни статии, разяснения на ЗЗД/ТЗ промени, практически примери и user-generated съдържание.",
  },
];

function TimelineStep({
  step,
  index,
  open,
  onToggle,
  active,
  registerRef,
}: {
  step: (typeof STEPS)[number];
  index: number;
  open: boolean;
  onToggle: () => void;
  active: boolean;
  registerRef: (el: HTMLDivElement | null) => void;
}) {
  const Icon = step.icon;
  return (
    <div
      ref={registerRef}
      data-active={active ? "true" : "false"}
      className="relative pl-14 md:pl-16"
    >
      {/* Node */}
      <div
        className={`absolute left-0 top-0 flex h-10 w-10 items-center justify-center rounded-full border bg-card transition-all duration-500 md:h-12 md:w-12 ${
          active
            ? "border-gold bg-gold/15 shadow-[0_0_0_4px_hsl(43_55%_54%/0.12)]"
            : "border-hairline"
        }`}
      >
        <Icon
          className={`h-4 w-4 transition-colors md:h-5 md:w-5 ${active ? "text-gold" : "text-gold/60"}`}
          strokeWidth={1.6}
        />
      </div>

      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`group w-full rounded-xl border bg-card/60 p-5 text-left transition-all duration-300 hover:border-gold/45 hover:bg-card sm:p-6 ${
          active ? "border-gold/45 shadow-elegant" : "border-hairline"
        }`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1">
            <div className="flex items-baseline gap-3">
              <span className="font-serif text-xs font-bold uppercase tracking-[0.22em] text-gold/70">
                Стъпка {step.n}
              </span>
              {active && (
                <span className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2 py-0.5 text-[9px] font-semibold uppercase tracking-[0.18em] text-gold">
                  Активна
                </span>
              )}
            </div>
            <h3 className="mt-1.5 font-serif text-base font-bold leading-snug text-foreground sm:text-lg">
              {step.title}
            </h3>
          </div>
          <ChevronDown
            className={`mt-1 h-4 w-4 shrink-0 text-gold/60 transition-transform duration-300 ${
              open ? "rotate-180" : ""
            }`}
          />
        </div>
        <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{step.text}</p>

        <div
          className="grid transition-[grid-template-rows] duration-500 ease-out motion-reduce:transition-none"
          style={{ gridTemplateRows: open ? "1fr" : "0fr" }}
        >
          <div className="overflow-hidden">
            <div
              className={`mt-3 rounded-md border border-gold/20 bg-gold/5 p-3 text-xs leading-relaxed text-muted-foreground transition-opacity duration-300 motion-reduce:transition-none ${
                open ? "opacity-100" : "opacity-0"
              }`}
            >
              <span className="font-semibold uppercase tracking-[0.16em] text-gold/80">
                Под капака
              </span>
              <p className="mt-1.5">{step.detail}</p>
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}

export function Process() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const [activeIdx, setActiveIdx] = useState<number>(0);
  const refs = useRef<(HTMLDivElement | null)[]>([]);

  // Track which step is closest to viewport center for "active" highlight.
  useEffect(() => {
    if (typeof IntersectionObserver === "undefined") return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Pick the most visible entry.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible) {
          const idx = refs.current.findIndex((el) => el === visible.target);
          if (idx >= 0) setActiveIdx(idx);
        }
      },
      { threshold: [0.4, 0.6, 0.8], rootMargin: "-30% 0px -30% 0px" },
    );
    refs.current.forEach((el) => el && observer.observe(el));
    return () => observer.disconnect();
  }, []);

  return (
    <section
      id="process"
      className="relative border-y border-border/60 bg-navy-light/25 py-14 sm:py-16 md:py-24"
    >
      <div className="absolute inset-x-0 top-0 hairline-x opacity-50" />
      <div className="container">
        <div className="mb-10 max-w-2xl md:mb-14">
          <div className="eyebrow mb-3">
            <span className="font-serif text-base font-normal tracking-normal text-gold/60">03</span>
            <span className="h-px w-6 bg-gold/40" />
            Процес
          </div>
          <h2 className="font-serif text-2xl font-bold leading-[1.15] text-balance sm:text-3xl md:text-4xl lg:text-[44px]">
            Как работи системата
          </h2>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted-foreground sm:text-base">
            От търсене до подписан договор — 6 стъпки. Натиснете върху всяка, за да видите какво се случва под капака.
          </p>
        </div>

        <div className="timeline-rail mx-auto max-w-3xl space-y-5 md:space-y-6">
          {STEPS.map((step, i) => (
            <TimelineStep
              key={step.n}
              step={step}
              index={i}
              open={openIdx === i}
              onToggle={() => setOpenIdx((cur) => (cur === i ? null : i))}
              active={activeIdx === i}
              registerRef={(el) => {
                refs.current[i] = el;
              }}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
