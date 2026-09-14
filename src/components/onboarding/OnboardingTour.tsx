import { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ChevronLeft, ChevronRight, X, ArrowRight, Check } from "@/icons";
import { TUTORIAL_STEPS } from "./tutorialSteps";
import { trackFunnelEvent } from "@/lib/funnel";

interface Props {
  open: boolean;
  onClose: (markSeen?: boolean) => void;
}

export function OnboardingTour({ open, onClose }: Props) {
  const [idx, setIdx] = useState(0);
  const navigate = useNavigate();
  const step = TUTORIAL_STEPS[idx];
  const total = TUTORIAL_STEPS.length;
  const isLast = idx === total - 1;
  const isFirst = idx === 0;

  useEffect(() => {
    if (open) setIdx(0);
  }, [open]);

  const finish = useCallback(() => {
    onClose(true);
    trackFunnelEvent("tutorial_complete");
    // If the user arrived from the pre-signup story flow (?tour=1), reward
    // them by routing directly to the Analyze surface — the "Convert" step.
    try {
      const params = new URLSearchParams(window.location.search);
      if (params.get("tour") === "1") {
        try { sessionStorage.setItem("dgv:show-analyze-cta", "1"); } catch {}
        navigate("/analiz");
      }
    } catch {}
  }, [onClose, navigate]);

  const next = useCallback(() => {
    if (isLast) finish();
    else setIdx((i) => Math.min(i + 1, total - 1));
  }, [isLast, finish, total]);

  const prev = useCallback(() => setIdx((i) => Math.max(i - 1, 0)), []);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowRight") next();
      else if (e.key === "ArrowLeft") prev();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, next, prev]);

  const handleCta = () => {
    if (!step.cta) return;
    onClose(true);
    navigate(step.cta.href);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose(true)}>
      <DialogContent
        className="max-w-4xl w-[calc(100vw-1rem)] p-0 gap-0 overflow-hidden border-gold/30 bg-background"
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Въведение в платформата</DialogTitle>

        {/* Progress bar */}
        <div className="h-1 w-full bg-border/40">
          <div
            className="h-full bg-gradient-gold transition-all duration-500 ease-out"
            style={{ width: `${((idx + 1) / total) * 100}%` }}
          />
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 min-h-[500px]">
          {/* Left: copy */}
          <div className="flex flex-col justify-between p-6 md:p-8">
            <div>
              <div className="flex items-center justify-between">
                <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-gold">
                  {step.icon}
                  {step.kicker ?? `Стъпка ${idx}`}
                </span>
                <button
                  onClick={() => onClose(true)}
                  className="rounded-full p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                  aria-label="Затвори"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>

              <h2 className="mt-5 font-serif text-2xl md:text-3xl font-bold leading-tight tracking-tight">
                {step.title}
              </h2>
              <p className="mt-3 text-sm md:text-base leading-relaxed text-muted-foreground">
                {step.body}
              </p>

              {step.cta && (
                <button
                  onClick={handleCta}
                  className="mt-5 inline-flex items-center gap-1.5 text-xs font-semibold text-gold hover:underline"
                >
                  {step.cta.label} <ArrowRight className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            <div className="mt-8 flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">
                {idx + 1} / {total}
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={prev}
                  disabled={isFirst}
                  className="text-muted-foreground"
                >
                  <ChevronLeft className="h-4 w-4" /> Назад
                </Button>
                <Button
                  size="sm"
                  onClick={next}
                  className="bg-gradient-gold text-navy hover:shadow-gold"
                >
                  {isLast ? (
                    <>
                      <Check className="mr-1 h-4 w-4 text-success" /> Готово
                    </>
                  ) : (
                    <>
                      Напред <ChevronRight className="h-4 w-4" />
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>

          {/* Right: preview */}
          <div className="relative border-t md:border-t-0 md:border-l border-border/60 bg-gradient-to-br from-card/60 via-card/30 to-transparent p-6 md:p-8 flex items-center">
            <div className="w-full">{step.preview}</div>
          </div>
        </div>

        {/* Dot navigation */}
        <div className="flex items-center justify-center gap-1.5 border-t border-border/40 py-3 bg-card/30">
          {TUTORIAL_STEPS.map((s, i) => (
            <button
              key={s.id}
              onClick={() => setIdx(i)}
              aria-label={`Стъпка ${i + 1}: ${s.title}`}
              className={
                i === idx
                  ? "h-1.5 w-6 rounded-full bg-gold transition-all"
                  : "h-1.5 w-1.5 rounded-full bg-border transition-all hover:bg-gold/50"
              }
            />
          ))}
        </div>

        {!isLast && (
          <button
            onClick={() => onClose(true)}
            className="absolute bottom-3 left-4 text-[11px] text-muted-foreground/70 hover:text-muted-foreground"
          >
            Прескочи
          </button>
        )}
      </DialogContent>
    </Dialog>
  );
}
