import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FileSignature, ShieldCheck, Bird, FileText, ArrowRight } from "@/icons";

const SLIDES = [
  {
    icon: FileText,
    title: ">600 готови шаблона",
    body: "ЗЗД · ТЗ · ЗУТ — професионални договори за минути.",
  },
  {
    icon: Bird,
    title: "AI анализ на риска",
    body: "Открива неравноправни клаузи и предлага корекции в реално време.",
  },
  {
    icon: FileSignature,
    title: "Електронен подпис",
    body: "Подпишете и изпратете — без принтиране, без сканиране.",
  },
  {
    icon: ShieldCheck,
    title: "Готови? Започнете безплатно",
    body: "Без карта. Първите документи са от нас.",
  },
];

const SLIDE_MS = 1400;
const TOTAL_MS = SLIDE_MS * SLIDES.length;

export function TeaserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const [slide, setSlide] = useState(0);
  const [phase, setPhase] = useState<"in" | "out">("in");

  useEffect(() => {
    if (!open) {
      setSlide(0);
      setPhase("in");
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const elapsed = now - start;
      if (elapsed >= TOTAL_MS) {
        onOpenChange(false);
        navigate("/auth?tab=signup");
        return;
      }
      const idx = Math.min(SLIDES.length - 1, Math.floor(elapsed / SLIDE_MS));
      const local = elapsed - idx * SLIDE_MS;
      setSlide(idx);
      setPhase(local > SLIDE_MS - 300 && idx < SLIDES.length - 1 ? "out" : "in");
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const skip = () => {
    onOpenChange(false);
    navigate("/auth?tab=signup");
  };

  const Icon = SLIDES[slide].icon;

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) skip(); else onOpenChange(v); }}>
      <DialogContent
        className="max-w-lg gap-0 overflow-hidden border-white/10 bg-card/40 p-0 backdrop-blur-xl shadow-2xl shadow-black/60 [&>button.absolute]:text-white/40 [&>button.absolute]:hover:text-white"
      >
        <div className="relative">
          {/* radial gold glow */}
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 -top-24 mx-auto h-64 w-64 rounded-full bg-gold/15 blur-[120px]"
          />
          <div
            aria-hidden
            className="pointer-events-none absolute -bottom-32 right-0 h-56 w-56 rounded-full bg-gold/10 blur-[120px]"
          />

          <div className="relative px-6 pb-8 pt-12 text-center sm:px-12 sm:pb-10 sm:pt-14">
            {/* icon */}
            <div className="relative mx-auto mb-9 h-16 w-16">
              <div className="absolute inset-0 -z-10 scale-150 rounded-full bg-gold/20 blur-3xl" />
              <div
                key={`icon-${slide}`}
                className="relative flex h-16 w-16 items-center justify-center rounded-2xl border border-white/10 bg-gradient-to-b from-white/10 to-transparent text-gold animate-scale-in"
              >
                <Icon className="h-7 w-7" strokeWidth={1.4} />
              </div>
            </div>

            {/* content with blur-fade */}
            <div className="flex min-h-[9rem] flex-col items-center justify-center">
              <h3
                key={`t-${slide}`}
                className="font-serif text-2xl font-semibold leading-tight tracking-tight text-foreground break-words sm:text-3xl md:text-4xl"
                style={{
                  animation: "teaser-blur-in 700ms cubic-bezier(0.4,0,0.2,1) both",
                }}
              >
                {SLIDES[slide].title}
              </h3>
              <p
                key={`b-${slide}`}
                className="mt-4 max-w-[28ch] text-sm font-light leading-relaxed tracking-wide text-muted-foreground"
                style={{
                  animation: "teaser-blur-in 700ms cubic-bezier(0.4,0,0.2,1) 80ms both",
                }}
              >
                {SLIDES[slide].body}
              </p>
            </div>

            {/* thin progress segments */}
            <div className="mt-10 grid w-full grid-cols-4 gap-2">
              {SLIDES.map((_, i) => (
                <div key={i} className="relative h-px overflow-hidden rounded-full bg-white/10">
                  <div
                    className="absolute inset-y-0 left-0 rounded-full bg-gold"
                    style={{
                      width: i < slide ? "100%" : i === slide ? undefined : "0%",
                      animation:
                        i === slide
                          ? `teaser-progress ${SLIDE_MS}ms linear forwards`
                          : undefined,
                    }}
                  />
                </div>
              ))}
            </div>

            {/* actions */}
            <div className="mt-10 flex flex-col items-center gap-5">
              <button
                type="button"
                onClick={skip}
                className="group inline-flex w-full items-center justify-center gap-2 rounded-full bg-gold px-8 py-4 text-sm font-semibold uppercase tracking-[0.18em] text-[#0b1426] shadow-lg shadow-gold/20 transition-all hover:brightness-110 active:scale-[0.98]"
              >
                Към регистрацията
                <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
              </button>
              <button
                type="button"
                onClick={skip}
                className="text-[10px] uppercase tracking-[0.22em] text-white/40 transition-colors hover:text-white"
              >
                Прескочи
              </button>
            </div>
          </div>
        </div>

        <style>{`
          @keyframes teaser-blur-in {
            0% { opacity: 0; transform: translateY(8px); filter: blur(8px); }
            100% { opacity: 1; transform: translateY(0); filter: blur(0); }
          }
          @keyframes teaser-progress {
            from { width: 0%; }
            to { width: 100%; }
          }
        `}</style>
      </DialogContent>
    </Dialog>
  );
}
