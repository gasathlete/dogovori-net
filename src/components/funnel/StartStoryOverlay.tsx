/**
 * StartStoryOverlay — Instagram-style story overlay shown when an anonymous
 * user clicks "Започни безплатно".
 *
 * Behavior:
 *   - 5 story cards (intro / find / build / analyse / dogovary).
 *   - Each card auto-advances after ~3s.
 *   - On the last card, auto-advance stops and Back / Next controls appear.
 *   - If the user does not interact for 4s on the last card, we auto-navigate
 *     to /auth?tab=signup&redirect=/dashboard?tour=1 (registration).
 *   - Tap left/right zones jump to prev/next; hold to pause on non-last cards.
 *   - Global mount in App.tsx. Trigger with `openStartStory()`.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "react-router-dom";
import { X, ArrowRight, ChevronLeft, ChevronRight, Sparkles } from "lucide-react";
import { TUTORIAL_STEPS } from "@/components/onboarding/tutorialSteps";
import { trackFunnelEvent } from "@/lib/funnel";
import { cn } from "@/lib/utils";

export const START_STORY_EVENT = "dogovori:start-story";
const SEEN_KEY = "dgv:start-story:seen";
const STORY_DURATION_MS = 3000; // 3s per card
const LAST_IDLE_MS = 4000; // 4s idle on last card → auto-signup
const SIGNUP_HREF = "/auth?tab=signup&redirect=%2Fdashboard%3Ftour%3D1";
const LOGIN_HREF = "/auth?redirect=%2Fdashboard%3Ftour%3D1";
// Most logical 5 out of TUTORIAL_STEPS: intro, find, build, analyse, dogovary.
const STORY_INDICES = [0, 1, 2, 3, 7] as const;

export function StartStoryOverlay() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0); // 0..1 for active story
  const [idleProgress, setIdleProgress] = useState(0); // 0..1 for last-card idle
  const rafRef = useRef<number | null>(null);
  const startedAtRef = useRef<number>(0);
  const carriedRef = useRef<number>(0);
  const idleRafRef = useRef<number | null>(null);
  const idleStartedAtRef = useRef<number>(0);

  const stories = STORY_INDICES.map((i) => TUTORIAL_STEPS[i]).filter(Boolean);
  const total = stories.length;
  const isLast = idx === total - 1;

  // Open trigger
  useEffect(() => {
    const handler = () => {
      setIdx(0);
      setProgress(0);
      setIdleProgress(0);
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

  const goToSignup = useCallback(
    (source: "auto" | "cta") => {
      trackFunnelEvent("story_cta_click", { target: "signup", source });
      setOpen(false);
      try { window.localStorage.setItem(SEEN_KEY, String(Date.now())); } catch {}
      navigate(SIGNUP_HREF);
    },
    [navigate],
  );

  const goto = useCallback(
    (nextIdx: number) => {
      // On the last card, "next" should push to signup instead of closing silently.
      if (nextIdx >= total) {
        goToSignup("auto");
        return;
      }
      const clamped = Math.max(0, nextIdx);
      setIdx(clamped);
      setProgress(0);
      setIdleProgress(0);
      carriedRef.current = 0;
      trackFunnelEvent("story_view", { story_idx: clamped });
    },
    [total, goToSignup],
  );

  // rAF progress loop for the active story (skip on last card — it waits).
  useEffect(() => {
    if (!open) return;
    if (isLast) return; // last card: no auto-advance, handled by idle timer below
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
      carriedRef.current = progress * STORY_DURATION_MS;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, paused, idx, goto, isLast]);

  // Idle timer on last card — 4s no-action → navigate to signup.
  const resetIdleTimer = useCallback(() => {
    setIdleProgress(0);
    idleStartedAtRef.current = performance.now();
  }, []);

  useEffect(() => {
    if (!open || !isLast) {
      if (idleRafRef.current) cancelAnimationFrame(idleRafRef.current);
      setIdleProgress(0);
      return;
    }
    idleStartedAtRef.current = performance.now();
    const tick = (now: number) => {
      const elapsed = now - idleStartedAtRef.current;
      const p = Math.min(1, elapsed / LAST_IDLE_MS);
      setIdleProgress(p);
      if (p >= 1) {
        goToSignup("auto");
        return;
      }
      idleRafRef.current = requestAnimationFrame(tick);
    };
    idleRafRef.current = requestAnimationFrame(tick);
    return () => {
      if (idleRafRef.current) cancelAnimationFrame(idleRafRef.current);
    };
  }, [open, isLast, goToSignup]);

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (isLast) resetIdleTimer();
      if (e.key === "Escape") close("skip");
      else if (e.key === "ArrowRight") goto(idx + 1);
      else if (e.key === "ArrowLeft") goto(idx - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, idx, goto, close, isLast, resetIdleTimer]);

  if (!open || typeof document === "undefined") return null;

  const story = stories[idx];

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
      <div
        className="relative flex h-[100dvh] w-full max-w-md flex-col overflow-hidden sm:h-[92vh] sm:rounded-2xl sm:border sm:border-gold/30 sm:shadow-elegant"
        style={{
          background:
            "radial-gradient(ellipse at top, hsl(220 40% 12%) 0%, hsl(220 45% 7%) 60%, hsl(220 50% 5%) 100%)",
        }}
        onPointerDown={() => {
          if (isLast) resetIdleTimer();
          else setPaused(true);
        }}
        onPointerUp={() => {
          if (!isLast) setPaused(false);
        }}
        onPointerLeave={() => {
          if (!isLast) setPaused(false);
        }}
        onPointerCancel={() => {
          if (!isLast) setPaused(false);
        }}
      >
        {/* Progress bars */}
        <div className="pointer-events-none absolute inset-x-3 top-3 z-30 flex gap-1.5">
          {stories.map((_, i) => (
            <div key={i} className="h-1 flex-1 overflow-hidden rounded-full bg-white/20">
              <div
                className="h-full rounded-full bg-gold transition-[width]"
                style={{
                  width: `${i < idx ? 100 : i === idx ? (isLast ? 100 : progress * 100) : 0}%`,
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

        {/* Tap zones (disabled on last card so buttons stay clickable) */}
        {!isLast && (
          <>
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
          </>
        )}

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
          <div key={`v-${idx}`} className="my-4 animate-in fade-in duration-500">
            {story.preview}
          </div>

          {/* Footer nav */}
          <div className="mt-2 space-y-3">
            {isLast ? (
              <div className="space-y-3">
                {/* Idle → auto-signup countdown bar */}
                <div className="h-0.5 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gold/70"
                    style={{ width: `${idleProgress * 100}%`, transition: "width 60ms linear" }}
                    aria-hidden
                  />
                </div>

                <button
                  type="button"
                  onClick={() => goToSignup("cta")}
                  className="btn-gold btn-sheen btn-press flex w-full items-center justify-center gap-2 rounded-xl px-5 py-3.5 text-[15px] font-bold normal-case tracking-normal shadow-gold"
                >
                  <Sparkles className="h-4 w-4" />
                  Създай безплатен акаунт
                  <ArrowRight className="h-4 w-4" />
                </button>

                <div className="flex items-center justify-between text-white/70">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      resetIdleTimer();
                      goto(idx - 1);
                    }}
                    className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.18em] transition-colors hover:text-gold"
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
                      resetIdleTimer();
                      goto(0);
                    }}
                    className="inline-flex items-center gap-1 text-xs uppercase tracking-[0.18em] text-gold hover:text-gold/80"
                  >
                    Отначало <ChevronRight className="h-4 w-4" />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    trackFunnelEvent("story_cta_click", { target: "login" });
                    close("complete");
                    navigate(LOGIN_HREF);
                  }}
                  className="block w-full text-center text-xs uppercase tracking-[0.18em] text-white/70 hover:text-gold"
                >
                  Имам акаунт → Вход
                </button>
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
 * Convenience trigger — dispatches the CustomEvent listened to by the overlay.
 */
export function openStartStory() {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(START_STORY_EVENT));
}
