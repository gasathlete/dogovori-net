/**
 * StartStoryOverlay — Instagram-style story overlay shown when an anonymous
 * user clicks "Започни безплатно". Reuses the first three TUTORIAL_STEPS
 * (intro / find / build) so the visual language matches the in-app tutorial.
 *
 * Behavior:
 *   - Global mount in App.tsx.
 *   - Triggered by dispatching a `dogovori:start-story` CustomEvent.
 *   - Auto-advances each story after ~4.5s; taps left/right jump prev/next.
 *   - Hold-to-pause on touch/mouse-down; releases to resume.
 *   - The last story ends with a primary "Създай безплатен акаунт" CTA.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import { X, ArrowRight, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { TUTORIAL_STEPS } from "@/components/onboarding/tutorialSteps";
import { trackFunnelEvent } from "@/lib/funnel";
import { cn } from "@/lib/utils";

export const START_STORY_EVENT = "dogovori:start-story";
const SEEN_KEY = "dgv:start-story:seen";
const STORY_DURATION_MS = 4500;
const STORY_INDICES = [0, 1, 2] as const; // intro, find, build

export function StartStoryOverlay() {
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 for active story
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const carriedRef = useRef<number>(0);

  const stories = STORY_INDICES.map((i) => TUTORIAL_STEPS[i]).filter(Boolean);
  const total = stories.length;

  // Open trigger
  useEffect(() => {
    const handler = () => {
      setIdx(0);
      setProgress(0);
      carriedRef.current = 0;
      setPaused(false);
      setOpen(true);
      trackFunnelEvent("story_view", { step: 1 as any, story_idx: 0 });
    };
    window.addEventListener(START_STORY_EVENT, handler as EventListener);
    return () => window.removeEventListener(START_STORY_EVENT, handler as EventListener);
  }, []);

  const close = useCallback(
    (reason: "skip" | "complete") => {
      setOpen(false);
      try { window.localStorage.setItem(SEEN_KEY, String(Date.now())); } catch {}
      trackFunnelEvent(reason === "complete" ? "story_complete" : "story_skip", {
        at_idx: idx,
        total,
      });
    },
    [idx, total],
  );

  const goto = useCallback(
    (nextIdx: number) => {
      if (nextIdx >= total) {
        close("complete");
        return;
      }
      const clamped = Math.max(0, nextIdx);
      setIdx(clamped);
      setProgress(0);
      carriedRef.current = 0;
      trackFunnelEvent("story_view", { story_idx: clamped });
    },
    [total, close],
  );

  // rAF progress loop for the active story
  useEffect(() => {
    if (!open) return;
    if (paused) {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      return;
    }
    startedAtRef.current = performance.now();
    const tick = (now: number) => {
      const elapsed = now - startedAtRef.current + carriedRef.current;
      const p = Math.min(1, elapsed / STORY_DURATION_MS);
      setProgress(p);
      if (p >= 1) {
        carriedRef.current = 0;
        goto(idx + 1);
        return;
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      // Remember how much of the current story elapsed if we're pausing.
      carriedRef.current = progress * STORY_DURATION_MS;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, paused, idx, goto]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close("skip");
      else if (e.key === "ArrowRight") goto(idx + 1);
      else if (e.key === "ArrowLeft") goto(idx - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, idx, goto, close]);

  if (!open || typeof document === "undefined") return null;

  const story = stories[idx];
  const isLast = idx === total - 1;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Кратко представяне на Dogovori.net"
      className="fixed inset-0 z-[300] flex items-center justify-center bg-black/90 backdrop-blur-md"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingBottom: "env(safe-area-inset-bottom)",
      }}
    >
      {/* Card */}
      <div
        className="relative flex h-[100dvh] w-full max-w-md flex-col overflow-hidden sm:h-[92vh] sm:rounded-2xl sm:border sm:border-gold/30 sm:shadow-elegant"
        style={{
          background:
            "radial-gradient(ellipse at top, hsl(220 40% 12%) 0%, hsl(220 45% 7%) 60%, hsl(220 50% 5%) 100%)",
        }}
        onPointerDown={() => setPaused(true)}
        onPointerUp={() => setPaused(false)}
        onPointerLeave={() => setPaused(false)}
        onPointerCancel={() => setPaused(false)}
      >
        {/* Progress bars */}
        <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex gap-1.5">
          {stories.map((_, i) => (
            <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-gold transition-[width]"
                style={{
                  width: `${i < idx ? 100 : i === idx ? progress * 100 : 0}%`,
                  transitionDuration: paused ? "0ms" : "60ms",
                }}
              />
            </div>
          ))}
        </div>

        {/* Close */}
        <button
          type="button"
          onClick={() => close("skip")}
          aria-label="Затвори"
          className="absolute right-3 top-6 z-40 rounded-full bg-black/50 p-1.5 text-white/80 backdrop-blur transition hover:bg-black/70 hover:text-white"
        >
          <X className="h-5 w-5" />
        </button>

        {/* Tap zones */}
        <button
          type="button"
          aria-label="Предишна стори"
          onClick={(e) => {
            e.stopPropagation();
            goto(idx - 1);
          }}
          className="absolute left-0 top-0 z-20 h-full w-1/3"
          tabIndex={-1}
        />
        <button
          type="button"
          aria-label="Следваща стори"
          onClick={(e) => {
            e.stopPropagation();
            goto(idx + 1);
          }}
          className="absolute right-0 top-0 z-20 h-full w-1/3"
          tabIndex={-1}
        />

        {/* Content */}
        <div className="relative z-10 flex h-full flex-col justify-between px-6 pt-14 pb-6">
          <div className="mt-2">
            <span className="inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
              {story.icon}
              {story.kicker ?? "Добре дошли"}
            </span>
            <h2
              key={`h-${idx}`}
              className="mt-4 animate-in fade-in slide-in-from-bottom-2 font-serif text-[26px] font-bold leading-tight text-white duration-300 sm:text-3xl"
            >
              {story.title}
            </h2>
            <p
              key={`p-${idx}`}
              className="mt-3 animate-in fade-in text-sm leading-relaxed text-white/80 duration-500"
            >
              {story.body}
            </p>
          </div>

          {/* Preview surface */}
          <div
            key={`v-${idx}`}
            className="my-4 animate-in fade-in duration-500"
          >
            {story.preview}
          </div>

          {/* Footer nav */}
          <div className="mt-2 space-y-3">
            {isLast ? (
              <div className="space-y-2">
                <Link
                  to="/auth?tab=signup&redirect=%2Fdashboard%3Ftour%3D1"
                  onClick={() => {
                    trackFunnelEvent("story_cta_click", { target: "signup" });
                    close("complete");
                  }}
                  className="btn-gold btn-sheen btn-press flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-[15px] font-bold normal-case tracking-normal shadow-gold"
                >
                  <Sparkles className="h-4 w-4" />
                  Създай безплатен акаунт
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  to="/auth?redirect=%2Fdashboard%3Ftour%3D1"
                  onClick={() => close("complete")}
                  className="block text-center text-xs uppercase tracking-[0.18em] text-white/70 hover:text-gold"
                >
                  Имам акаунт → Вход
                </Link>
              </div>
            ) : (
              <div className="flex items-center justify-between text-white/70">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goto(idx - 1);
                  }}
                  disabled={idx === 0}
                  className={cn(
                    "inline-flex items-center gap-1 text-xs uppercase tracking-[0.18em] transition-colors",
                    idx === 0 ? "opacity-30" : "hover:text-gold",
                  )}
                >
                  <ChevronLeft className="h-4 w-4" /> Назад
                </button>
                <span className="text-[10px] uppercase tracking-[0.18em] text-white/50">
                  {idx + 1} / {total}
                </span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    goto(idx + 1);
                  }}
                  className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.18em] text-gold hover:text-gold/80"
                >
                  Напред <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * Convenience trigger — dispatches the CustomEvent listened to by the
 * overlay. Call this from any "Започни безплатно" CTA for anonymous users.
 */
export function openStartStory() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(START_STORY_EVENT));
}
