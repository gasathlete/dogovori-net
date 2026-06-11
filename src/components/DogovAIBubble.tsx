import { useEffect, useState } from "react";
import { useLocation } from "react-router-dom";
import { Bird, X } from "lucide-react";
import { AssistantChat } from "@/components/AssistantChat";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

/**
 * DogovAI — small, branded, scroll-attached chatbot bubble visible globally
 * (home page + profile etc.). Compact size — present but not obtrusive.
 *
 * Hidden on routes where a dedicated chat surface already exists or where
 * a floating widget would interfere (signing envelopes, full assistant view).
 */

const HIDDEN_PREFIXES = [
  "/assistant",
  "/signing",
  "/share",
  "/auth",
  "/checkout",
];

export function DogovAIBubble() {
  const { user, loading } = useAuth();
  const { pathname } = useLocation();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Close panel on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // External open trigger (e.g. from Account dashboard chat CTA)
  useEffect(() => {
    const onOpen = () => setOpen(true);
    window.addEventListener("dogovai:open", onOpen);
    return () => window.removeEventListener("dogovai:open", onOpen);
  }, []);

  if (loading) return null;
  if (HIDDEN_PREFIXES.some((p) => pathname.startsWith(p))) return null;
  if (!user) return null; // chat requires auth; show only to logged-in users

  return (
    <>
      {/* Bubble */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? "Затвори DogovAI" : "Отвори DogovAI чат"}
        title="DogovAI"
        className={cn(
          "fixed bottom-4 right-4 z-40 sm:bottom-5 sm:right-5",
          "group flex items-center gap-2 rounded-full",
          "h-11 pl-3 pr-3.5 sm:h-12 sm:pl-3.5 sm:pr-4",
          "bg-gradient-gold text-navy shadow-gold ring-1 ring-gold/40",
          "transition-all hover:scale-[1.04] active:scale-95",
          open && "opacity-0 pointer-events-none translate-y-2",
        )}
      >
        <span className="relative flex h-6 w-6 items-center justify-center rounded-full bg-navy/15">
          <Bird className="h-4 w-4" />
          <span className="absolute -right-0.5 -top-0.5 h-2 w-2 rounded-full bg-emerald-500 ring-2 ring-gold" />
        </span>
        <span className="font-serif text-[13px] font-bold tracking-wide sm:text-sm">
          DogovAI
        </span>
      </button>

      {/* Panel */}
      <div
        role="dialog"
        aria-label="DogovAI чат"
        className={cn(
          "fixed z-40 bottom-4 right-4 sm:bottom-5 sm:right-5",
          "w-[min(380px,calc(100vw-2rem))] h-[min(580px,calc(100dvh-6rem))]",
          "origin-bottom-right rounded-2xl border border-gold/30 bg-card shadow-2xl",
          "transition-all duration-200",
          open
            ? "scale-100 opacity-100 pointer-events-auto"
            : "pointer-events-none scale-95 opacity-0",
        )}
      >
        <div className="flex h-full flex-col overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-border/60 bg-gradient-to-r from-gold/15 via-card to-card px-3 py-2.5">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-full bg-gradient-gold text-navy">
                <Bird className="h-4 w-4" />
              </span>
              <div className="leading-tight">
                <div className="font-serif text-sm font-bold">DogovAI</div>
                <div className="text-[10px] text-muted-foreground">AI правен асистент</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-md p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
              aria-label="Затвори"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="min-h-0 flex-1 overflow-hidden">
            {open && <AssistantChat compact />}
          </div>
        </div>
      </div>
    </>
  );
}
