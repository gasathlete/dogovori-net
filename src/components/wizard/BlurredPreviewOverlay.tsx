import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ReactNode } from "react";

interface Props {
  children: ReactNode;
  onUnlock?: () => void;
}

/**
 * Wraps preview content and blurs the middle ~40% band, leaving header and
 * signature area readable. Purely presentational — actual content isn't
 * downloaded until the user clears the paywall.
 */
export function BlurredPreviewOverlay({ children, onUnlock }: Props) {
  return (
    <div className="relative">
      {/* underlying preview stays in the DOM (accessible for Pro users' state) */}
      <div className="pointer-events-none select-none">{children}</div>

      {/* blur mask in the middle band */}
      <div
        aria-hidden
        className="absolute inset-x-0 top-[22%] bottom-[22%] backdrop-blur-md bg-background/25"
      />

      {/* CTA chip centered */}
      <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 flex items-center justify-center px-4">
        <div className="max-w-md w-full rounded-2xl border border-gold/40 bg-background/95 shadow-xl p-5 text-center backdrop-blur">
          <div className="inline-flex items-center gap-2 rounded-full border border-gold/30 bg-gold/10 px-3 py-1 text-xs font-medium text-gold mb-3">
            <Lock className="h-3.5 w-3.5" />
            Стриктен документ — превюто е замъглено
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
  );
}
