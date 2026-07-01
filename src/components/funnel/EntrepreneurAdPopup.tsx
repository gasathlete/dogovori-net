/**
 * EntrepreneurAdPopup — post-op "what dogovori.net can do for you" ad.
 *
 * Listens for `dogovori:free-op-success` (see `useFreeOpSuccess`) as well as
 * the existing `dogovari:op-completed` celebration event. Shows a compact
 * ad for the Entrepreneur plan features to logged-in users on the free tier.
 *
 * UX contract:
 *   • Close button is disabled for the first 3s (visual countdown ring).
 *   • Popup auto-closes after 10s (thin top progress bar).
 *   • Frequency capped: max once per session AND max once per 4h across sessions.
 *   • Never shows for users with an active paid subscription.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  X,
  ArrowRight,
  BrainCircuit,
  Languages,
  Package,
  ShieldAlert,
  Zap,
  Crown,
  Sparkles,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";
import { useIsPro } from "@/hooks/useIsPro";
import { trackFunnelEvent } from "@/lib/funnel";
import { FREE_OP_SUCCESS_EVENT } from "@/hooks/useFreeOpSuccess";

const LAST_SHOWN_KEY = "dgv:ent-ad:last-shown";
const SESSION_SHOWN_KEY = "dgv:ent-ad:session-shown";
const MIN_INTERVAL_MS = 4 * 60 * 60 * 1000; // 4h
const UNLOCK_MS = 3000;
const AUTO_CLOSE_MS = 10_000;
const OPEN_DELAY_MS = 900; // let the celebration toast breathe first

const FEATURES: Array<{ icon: any; label: string }> = [
  { icon: BrainCircuit, label: "AI Асистент" },
  { icon: Languages, label: "Двуезични BG/EN" },
  { icon: Package, label: "Комплекти" },
  { icon: ShieldAlert, label: "Risk Analysis" },
  { icon: Zap, label: "GPT-5 модел" },
  { icon: Sparkles, label: "Приоритет" },
];

export function EntrepreneurAdPopup() {
  const { user } = useAuth();
  const { isPro } = useIsPro();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(0);
  const openedAtRef = useRef<number>(0);

  const canShow = useCallback(() => {
    if (!user) return false;
    // Don't advertise Entrepreneur to users who already have a paid plan.
    if (isPro) return false;
    try {
      if (sessionStorage.getItem(SESSION_SHOWN_KEY)) return false;
      const last = Number(localStorage.getItem(LAST_SHOWN_KEY) || "0");
      if (last && Date.now() - last < MIN_INTERVAL_MS) return false;
    } catch {}
    return true;
  }, [user, isPro]);

  const scheduleOpen = useCallback(() => {
    if (!canShow()) return;
    window.setTimeout(() => {
      if (!canShow()) return;
      setOpen(true);
      openedAtRef.current = performance.now();
      setNow(0);
      try {
        sessionStorage.setItem(SESSION_SHOWN_KEY, "1");
        localStorage.setItem(LAST_SHOWN_KEY, String(Date.now()));
      } catch {}
      trackFunnelEvent("ent_ad_shown");
    }, OPEN_DELAY_MS);
  }, [canShow]);

  useEffect(() => {
    const onFree = () => scheduleOpen();
    const onCompleted = () => scheduleOpen();
    window.addEventListener(FREE_OP_SUCCESS_EVENT, onFree as EventListener);
    window.addEventListener("dogovari:op-completed", onCompleted as EventListener);
    return () => {
      window.removeEventListener(FREE_OP_SUCCESS_EVENT, onFree as EventListener);
      window.removeEventListener("dogovari:op-completed", onCompleted as EventListener);
    };
  }, [scheduleOpen]);

  // rAF timer for progress + auto-close
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const tick = (t: number) => {
      const elapsed = t - openedAtRef.current;
      setNow(elapsed);
      if (elapsed >= AUTO_CLOSE_MS) {
        setOpen(false);
        trackFunnelEvent("ent_ad_dismissed", { reason: "auto" });
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [open]);

  if (!open || typeof document === "undefined") return null;

  const canClose = now >= UNLOCK_MS;
  const closeRemaining = Math.max(0, Math.ceil((UNLOCK_MS - now) / 1000));
  const autoPct = Math.min(1, now / AUTO_CLOSE_MS);
  const ringPct = Math.min(1, now / UNLOCK_MS);
  const RING_C = 2 * Math.PI * 9; // r=9

  const handleClose = () => {
    if (!canClose) return;
    setOpen(false);
    trackFunnelEvent("ent_ad_dismissed", { reason: "user" });
  };

  return createPortal(
    <div
      role="dialog"
      aria-live="polite"
      aria-label="Какво може dogovori.net за теб"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[210] flex justify-center px-3 pb-[calc(env(safe-area-inset-bottom)+80px)] sm:justify-start sm:pb-6 sm:pl-6"
    >
      <div
        className="pointer-events-auto relative w-full max-w-sm overflow-hidden rounded-2xl border border-gold/40 bg-card/95 shadow-elegant backdrop-blur-md animate-in slide-in-from-bottom-4 fade-in duration-500"
      >
        {/* Auto-close progress bar */}
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-0.5 bg-gold/70"
          style={{ width: `${autoPct * 100}%`, transition: "width 60ms linear" }}
        />

        {/* Close with countdown ring */}
        <button
          type="button"
          onClick={handleClose}
          disabled={!canClose}
          aria-label={canClose ? "Затвори" : `Затвори (${closeRemaining} сек)`}
          className={`absolute right-2 top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-border/60 bg-background/70 backdrop-blur transition ${
            canClose ? "text-foreground hover:border-gold/60 hover:text-gold" : "cursor-not-allowed text-muted-foreground"
          }`}
        >
          {canClose ? (
            <X className="h-3.5 w-3.5" />
          ) : (
            <svg viewBox="0 0 24 24" className="h-6 w-6 -rotate-90">
              <circle
                cx="12"
                cy="12"
                r="9"
                fill="none"
                stroke="hsl(var(--border))"
                strokeWidth="2"
              />
              <circle
                cx="12"
                cy="12"
                r="9"
                fill="none"
                stroke="hsl(var(--gold))"
                strokeWidth="2"
                strokeLinecap="round"
                strokeDasharray={RING_C}
                strokeDashoffset={RING_C * (1 - ringPct)}
              />
              <text
                x="12"
                y="12.5"
                textAnchor="middle"
                dominantBaseline="middle"
                fontSize="8"
                className="rotate-90 fill-foreground font-bold"
                style={{ transformOrigin: "12px 12px" }}
              >
                {closeRemaining}
              </text>
            </svg>
          )}
        </button>

        {/* Header */}
        <div
          className="px-4 pb-3 pt-4"
          style={{
            background: "linear-gradient(135deg, hsl(var(--gold) / 0.15) 0%, transparent 75%)",
          }}
        >
          <div className="flex items-center gap-2">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-gold/15 text-gold">
              <Crown className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-gold">
                Предприемач
              </p>
              <h3 className="font-serif text-sm font-bold leading-tight text-foreground">
                Какво може dogovori.net за теб
              </h3>
            </div>
          </div>
        </div>

        {/* Feature chips */}
        <div className="grid grid-cols-3 gap-1.5 px-4 pb-3">
          {FEATURES.map((f) => {
            const Icon = f.icon;
            return (
              <div
                key={f.label}
                className="flex flex-col items-center justify-center gap-1 rounded-lg border border-gold/15 bg-background/60 px-2 py-2 text-center"
              >
                <Icon className="h-3.5 w-3.5 text-gold" />
                <span className="text-[10px] font-medium leading-tight text-foreground/90">
                  {f.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* CTA */}
        <div className="border-t border-border/60 bg-background/40 px-4 py-3">
          <Link
            to="/plans#entrepreneur"
            onClick={() => {
              trackFunnelEvent("ent_ad_cta_click");
              setOpen(false);
            }}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-gold to-gold/85 px-3 py-2.5 text-[13px] font-semibold text-navy shadow-gold transition hover:brightness-110"
          >
            Виж Предприемач
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
          <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
            7 дни trial · без карта · отказ по всяко време
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
}
