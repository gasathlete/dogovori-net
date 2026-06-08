import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { FileSignature, ShieldCheck, Bird, FileText, ArrowRight } from "lucide-react";

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

const DURATION = 5000;

export function TeaserDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
}) {
  const navigate = useNavigate();
  const [progress, setProgress] = useState(0);
  const [slide, setSlide] = useState(0);

  useEffect(() => {
    if (!open) {
      setProgress(0);
      setSlide(0);
      return;
    }
    const start = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / DURATION);
      setProgress(p);
      const idx = Math.min(SLIDES.length - 1, Math.floor(p * SLIDES.length));
      setSlide(idx);
      if (p < 1) raf = requestAnimationFrame(tick);
      else {
        onOpenChange(false);
        navigate("/auth?tab=signup");
      }
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
      <DialogContent className="max-w-md overflow-hidden border-gold/30 bg-card p-0">
        <div className="relative">
          <div className="h-1 w-full bg-border/40">
            <div
              className="h-full bg-gold transition-[width] duration-100 ease-linear"
              style={{ width: `${progress * 100}%` }}
            />
          </div>

          <div className="px-7 pb-6 pt-8 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold">
              <Icon className="h-7 w-7" />
            </div>
            <h3 key={slide} className="animate-fade-in font-serif text-xl font-bold leading-tight">
              {SLIDES[slide].title}
            </h3>
            <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted-foreground">
              {SLIDES[slide].body}
            </p>

            <div className="mt-5 flex items-center justify-center gap-1.5">
              {SLIDES.map((_, i) => (
                <span
                  key={i}
                  className={`h-1 w-6 rounded-full transition-colors ${
                    i <= slide ? "bg-gold" : "bg-border/50"
                  }`}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={skip}
              className="btn-gold btn-press mt-6 inline-flex w-full items-center justify-center gap-2 normal-case tracking-normal"
            >
              Към регистрацията
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={skip}
              className="mt-3 text-[11px] uppercase tracking-[0.18em] text-muted-foreground hover:text-gold"
            >
              Прескочи
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
