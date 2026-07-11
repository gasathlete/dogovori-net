import { Lock, Sparkles } from "@/icons";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  onUnlock?: () => void;
}

/**
 * Wraps preview content with a smooth vertical gradient blur (readable at the
 * top and bottom, obscured through the middle band) and a CTA chip that stays
 * pinned to the viewport as the user scrolls through the preview.
 */
export function BlurredPreviewOverlay({ children, onUnlock }: Props) {
  return (
    <div className="relative">
      {/* underlying preview — kept in DOM but non-interactive */}
      <div className="pointer-events-none select-none">{children}</div>

      {/* Gradient blur veil: soft at top/bottom, dense in the middle.
          Achieved via backdrop-blur + a mask that fades the veil in/out. */}
      <div
        aria-hidden
        className="absolute inset-0 backdrop-blur-lg bg-background/10"
        style={{
          WebkitMaskImage:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.15) 12%, rgba(0,0,0,0.85) 32%, rgba(0,0,0,1) 50%, rgba(0,0,0,0.85) 68%, rgba(0,0,0,0.15) 88%, transparent 100%)",
          maskImage:
            "linear-gradient(to bottom, transparent 0%, rgba(0,0,0,0.15) 12%, rgba(0,0,0,0.85) 32%, rgba(0,0,0,1) 50%, rgba(0,0,0,0.85) 68%, rgba(0,0,0,0.15) 88%, transparent 100%)",
        }}
      />

      {/* Sticky CTA — remains centered in viewport while user scrolls */}
      <div className="pointer-events-none absolute inset-0">
        <div className="sticky top-1/2 -translate-y-1/2 flex items-center justify-center px-4 py-8">
          <div className="pointer-events-auto max-w-md w-full rounded-2xl border border-gold/40 bg-background/95 shadow-2xl p-5 text-center backdrop-blur">
            <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-medium text-gold mb-3">
              <Lock className="h-3.5 w-3.5" />
              Стриктен документ
            </div>
            <h3 className="text-lg font-semibold mb-1">
              Вашият документ е готов
            </h3>
            <p className="text-sm text-muted-foreground mb-4">
              Финалният текст е защитен. Отключете, за да прегледате и свалите.
            </p>
            {onUnlock && (
              <Button onClick={onUnlock} className="w-full gap-2">
                <Sparkles className="h-4 w-4" />
                Отключи Стриктен документ
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
