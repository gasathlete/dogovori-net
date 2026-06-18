import { lazy, Suspense, useEffect, useState } from "react";
import { X, Loader2, Sparkles } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";

const AssistantChat = lazy(() =>
  import("@/components/AssistantChat").then((m) => ({ default: m.AssistantChat })),
);

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FloatingAssistant({ open, onOpenChange }: Props) {
  const isMobile = useIsMobile();
  const [mounted, setMounted] = useState(false);
  const [teaserDismissed, setTeaserDismissed] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    return window.localStorage.getItem("dogovaryai_teaser_dismissed") === "1";
  });

  // Mount the heavy chat bundle once the bubble has been opened the first time.
  useEffect(() => {
    if (open && !mounted) setMounted(true);
  }, [open, mounted]);

  // Prefetch chat bundle on idle so first open feels instant.
  useEffect(() => {
    if (mounted || typeof window === "undefined") return;
    const idle =
      (window as Window & { requestIdleCallback?: (cb: () => void) => number }).requestIdleCallback ??
      ((cb: () => void) => window.setTimeout(cb, 1500));
    const id = idle(() => {
      import("@/components/AssistantChat");
    });
    return () => {
      if (typeof id === "number") window.clearTimeout(id);
    };
  }, [mounted]);

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onOpenChange(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  const dismissTeaser = () => {
    setTeaserDismissed(true);
    try {
      window.localStorage.setItem("dogovaryai_teaser_dismissed", "1");
    } catch {
      /* ignore */
    }
  };

  return (
    <>
      {/* Backdrop on mobile when open */}
      {isMobile && (
        <div
          aria-hidden
          onClick={() => onOpenChange(false)}
          className={cn(
            "fixed inset-0 z-30 bg-navy/70 backdrop-blur-sm transition-opacity duration-200",
            open ? "opacity-100" : "pointer-events-none opacity-0",
          )}
        />
      )}

      {/* Teaser chip (desktop, before first open) */}
      {!isMobile && !open && !teaserDismissed && (
        <div className="fixed bottom-6 right-24 z-40 flex items-center gap-2 animate-in fade-in slide-in-from-right-2 duration-500">
          <div className="relative rounded-full border border-gold/30 bg-card/95 px-3.5 py-2 text-xs font-medium text-foreground shadow-lg backdrop-blur-sm">
            <span className="text-gold">Питай DogovaryAI</span>
            <span className="ml-1 text-muted-foreground">— безплатно</span>
            <button
              type="button"
              aria-label="Скрий"
              onClick={dismissTeaser}
              className="absolute -right-1.5 -top-1.5 inline-flex h-4 w-4 items-center justify-center rounded-full border border-border bg-background text-muted-foreground hover:text-foreground"
            >
              <X className="h-2.5 w-2.5" />
            </button>
            <span className="absolute right-[-6px] top-1/2 h-3 w-3 -translate-y-1/2 rotate-45 border-r border-t border-gold/30 bg-card" />
          </div>
        </div>
      )}

      {/* Floating bubble button */}
      <button
        onClick={() => {
          onOpenChange(!open);
          if (!teaserDismissed) dismissTeaser();
        }}
        aria-label={open ? "Затвори DogovaryAI" : "Отвори DogovaryAI"}
        aria-expanded={open}
        className={cn(
          "group fixed z-40 flex items-center justify-center rounded-full",
          isMobile ? "bottom-4 right-4 h-12 w-12" : "bottom-5 right-5 h-14 w-14",
          "bg-gradient-to-br from-gold via-gold to-gold/80 text-navy",
          "shadow-[0_10px_30px_-8px_hsl(var(--gold)/0.55)] ring-1 ring-gold/40",
          "transition-all duration-300 hover:scale-105 hover:shadow-[0_14px_40px_-10px_hsl(var(--gold)/0.7)]",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold/70 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        )}
      >
        {/* Soft pulse ring while closed */}
        {!open && (
          <span
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-full ring-2 ring-gold/40 animate-ping opacity-60"
          />
        )}
        {/* Online indicator */}
        {!open && (
          <span
            aria-hidden
            className="absolute -right-0.5 -top-0.5 h-3 w-3 rounded-full border-2 border-background bg-emerald-400 shadow"
          />
        )}
        <span
          className={cn(
            "relative transition-transform duration-300",
            open ? "rotate-90 scale-95" : "rotate-0 scale-100 group-hover:scale-110",
          )}
        >
          {open ? <X className="h-6 w-6" /> : <Sparkles className="h-6 w-6" />}
        </span>
      </button>

      {/* Chat window */}
      <div
        className={cn(
          "fixed z-40 origin-bottom-right overflow-hidden rounded-2xl border border-gold/25 bg-card/95 shadow-2xl backdrop-blur-xl",
          "transition-all duration-200 ease-out",
          isMobile
            ? "inset-x-3 bottom-20 top-16 w-auto"
            : "bottom-24 right-5 h-[min(680px,calc(100dvh-8rem))] w-[min(440px,calc(100vw-2rem))]",
          open
            ? "translate-y-0 scale-100 opacity-100 pointer-events-auto"
            : "pointer-events-none translate-y-2 scale-[0.97] opacity-0",
        )}
        role="dialog"
        aria-modal={isMobile ? "true" : undefined}
        aria-label="DogovaryAI чат"
      >
        {/* Subtle gradient halo at top */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-gold/60 to-transparent"
        />
        <div className="flex h-full flex-col">
          {/* Header */}
          <div className="flex items-center justify-between border-b border-border/50 bg-gradient-to-b from-card to-card/60 px-4 py-3">
            <div className="flex items-center gap-2.5">
              <div className="relative h-9 w-9 shrink-0 overflow-hidden rounded-full border border-gold/40 bg-gradient-to-br from-gold/25 to-gold/5">
                <img
                  src="/dogovai-favicon.png"
                  alt=""
                  className="h-full w-full object-contain p-1"
                  width={36}
                  height={36}
                  loading="lazy"
                  decoding="async"
                />
                <span
                  aria-hidden
                  className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-card bg-emerald-400"
                />
              </div>
              <div className="flex flex-col leading-tight">
                <span className="font-serif text-sm font-bold text-foreground">
                  DogovaryAI
                </span>
                <span className="text-[10px] uppercase tracking-[0.16em] text-emerald-400/90">
                  Онлайн · отговаря за секунди
                </span>
              </div>
            </div>
            <button
              onClick={() => onOpenChange(false)}
              className="rounded-md p-1.5 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
              aria-label="Затвори"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Chat surface */}
          <div className="min-h-0 flex-1 overflow-hidden">
            {mounted ? (
              <Suspense fallback={<ChatFallback />}>
                <AssistantChat compact />
              </Suspense>
            ) : (
              <ChatFallback />
            )}
          </div>
        </div>
      </div>
    </>
  );
}

function ChatFallback() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      <Loader2 className="mr-2 h-4 w-4 animate-spin text-gold" />
      <span className="text-xs">Зареждам асистента…</span>
    </div>
  );
}
