/**
 * ActionCelebration — кратък overlay след завършен op (download/analyze/sign).
 * Показва animated checkmark, общ брой документи и 1-2 next-step CTA.
 * Respecta prefers-reduced-motion.
 *
 * Usage:
 *   const celebrate = useActionCelebration();
 *   celebrate({ variant: "download", nextSteps: [{label, to}] });
 */
import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { Check, ArrowRight, Sparkles } from "@/icons";
import { useEngagement } from "@/hooks/useEngagement";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export type CelebrationVariant = "download" | "analyze" | "sign" | "template";

interface NextStep {
  label: string;
  to: string;
  icon?: typeof ArrowRight;
}

interface CelebrationOptions {
  variant: CelebrationVariant;
  title?: string;
  nextSteps?: NextStep[];
  onClose?: () => void;
}

const VARIANT_COPY: Record<CelebrationVariant, { title: string; subtitle: string }> = {
  download: {
    title: "Договорът е готов",
    subtitle: "PDF + DOCX свалени успешно. Какво следва?",
  },
  analyze: {
    title: "Анализът завърши",
    subtitle: "Прегледай рисковете или приложи корекциите.",
  },
  sign: { title: "Подписан успешно", subtitle: "Аудит следата е запазена." },
  template: {
    title: "Шаблонът е готов",
    subtitle: "Изтеглен в твоята библиотека. Продължи с:",
  },
};

interface CelebrationState extends CelebrationOptions {
  open: boolean;
}

let setStateExternal: ((s: CelebrationState) => void) | null = null;

export function useActionCelebration() {
  return useCallback((opts: CelebrationOptions) => {
    setStateExternal?.({ ...opts, open: true });
  }, []);
}

export function ActionCelebrationHost() {
  const [state, setState] = useState<CelebrationState>({
    variant: "download",
    open: false,
  });
  const { total_ops, current_streak } = useEngagement();

  useEffect(() => {
    setStateExternal = setState;
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail || {};
      setStateExternal?.({
        open: true,
        variant: (detail.variant as CelebrationVariant) || "download",
        title: detail.title,
        nextSteps: detail.nextSteps,
      });
    };
    window.addEventListener("dogovari:op-completed", handler as EventListener);
    return () => {
      setStateExternal = null;
      window.removeEventListener("dogovari:op-completed", handler as EventListener);
    };
  }, []);

  useEffect(() => {
    if (!state.open) return;
    const t = setTimeout(() => {
      setState((s) => ({ ...s, open: false }));
      state.onClose?.();
    }, 6000);
    return () => clearTimeout(t);
  }, [state.open]);

  if (!state.open || typeof document === "undefined") return null;

  const copy = VARIANT_COPY[state.variant];
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  return createPortal(
    <div
      role="alert"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-20 z-[200] flex justify-center px-4 sm:top-24"
    >
      <div
        className={cn(
          "pointer-events-auto w-full max-w-md rounded-xl border border-gold/30 bg-card/95 p-4 shadow-2xl backdrop-blur",
          !reduceMotion && "animate-in fade-in zoom-in-95 duration-300",
        )}
      >
        <div className="flex items-start gap-3">
          <div
            className={cn(
              "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-gold/30 to-gold/10 ring-2 ring-gold/40",
              !reduceMotion && "animate-in zoom-in-50 duration-500",
            )}
          >
            <Check className="h-5 w-5 text-success" strokeWidth={3} />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h4 className="text-sm font-semibold text-foreground">
                {state.title || copy.title}
              </h4>
              {current_streak > 1 && (
                <span className="flex items-center gap-0.5 rounded-full bg-gold/15 px-1.5 py-0.5 text-[10px] font-bold text-gold">
                  <Sparkles className="h-2.5 w-2.5" />
                  {current_streak} дни streak
                </span>
              )}
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground">{copy.subtitle}</p>
            {total_ops > 0 && (
              <p className="mt-1 text-[11px] text-muted-foreground/80">
                Общо изработени документи: <strong className="text-foreground">{total_ops}</strong>
              </p>
            )}
          </div>
          <button
            onClick={() => setState((s) => ({ ...s, open: false }))}
            aria-label="Затвори"
            className="-mr-1 -mt-1 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            ×
          </button>
        </div>

        {state.nextSteps && state.nextSteps.length > 0 && (
          <div className="mt-3 grid gap-1.5">
            {state.nextSteps.slice(0, 2).map((step) => {
              const Icon = step.icon ?? ArrowRight;
              return (
                <Button
                  key={step.to}
                  asChild
                  variant="outline"
                  size="sm"
                  className="h-auto justify-between border-gold/30 py-2 text-left text-xs hover:border-gold/60 hover:bg-gold/5"
                >
                  <Link
                    to={step.to}
                    onClick={() => setState((s) => ({ ...s, open: false }))}
                  >
                    <span className="font-medium">{step.label}</span>
                    <Icon className="h-3.5 w-3.5 text-gold" />
                  </Link>
                </Button>
              );
            })}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
