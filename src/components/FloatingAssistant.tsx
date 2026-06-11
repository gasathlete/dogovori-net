import { useEffect } from "react";
import { MessageSquare, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AssistantChat } from "@/components/AssistantChat";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FloatingAssistant({ open, onOpenChange }: Props) {
  const isMobile = typeof window !== "undefined" && window.innerWidth < 640;

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onOpenChange(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onOpenChange]);

  return (
    <>
      {/* Floating bubble button */}
      <button
        onClick={() => onOpenChange(!open)}
        aria-label={open ? "Затвори чат поддръжка" : "Отвори чат поддръжка"}
        className={cn(
          "fixed z-40 flex items-center justify-center rounded-full",
          isMobile ? "bottom-4 right-4 h-12 w-12" : "bottom-5 right-5 h-14 w-14",
          "bg-gradient-gold text-navy shadow-gold transition-transform hover:scale-105",
          open && "rotate-90"
        )}
      >
        {open ? <X className="h-6 w-6" /> : <MessageSquare className="h-6 w-6" />}
      </button>

      {/* Chat window */}
      <div
        className={cn(
          "fixed z-40 w-[min(420px,calc(100vw-2rem))]",
          isMobile ? "bottom-20 right-4" : "bottom-24 right-5",
          "h-[min(640px,calc(100dvh-8rem))] origin-bottom-right",
          "rounded-2xl border border-gold/30 bg-card shadow-2xl",
          "transition-all duration-200",
          open ? "scale-100 opacity-100 pointer-events-auto" : "pointer-events-none scale-95 opacity-0"
        )}
        role="dialog"
        aria-label="DogovaryAI чат"
      >
        <div className="flex h-full flex-col overflow-hidden rounded-2xl">
          <div className="flex items-center justify-between border-b border-border/60 bg-card/80 px-4 py-3">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-4 w-4 text-gold" />
              <span className="font-serif text-sm font-bold">DogovaryAI</span>
            </div>
            <button
              onClick={() => onOpenChange(false)}
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
