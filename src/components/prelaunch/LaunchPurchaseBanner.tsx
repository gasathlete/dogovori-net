import { Bell, Lock } from "@/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { PrelaunchFeature } from "@/lib/prelaunch";
import { openPrelaunchWaitlist, type WaitlistSource } from "@/lib/prelaunchWaitlist";

interface LaunchPurchaseBannerProps {
  feature?: PrelaunchFeature;
  source?: WaitlistSource;
  productId?: string;
  compact?: boolean;
  className?: string;
}

export function LaunchPurchaseBanner({
  feature = "one_time_product",
  source = "other",
  productId,
  compact = false,
  className,
}: LaunchPurchaseBannerProps) {
  return (
    <aside
      data-testid="launch-purchase-banner"
      className={cn(
        "flex flex-col gap-3 border border-gold/30 bg-gold/[0.06] sm:flex-row sm:items-center sm:justify-between",
        compact ? "rounded-lg p-3" : "rounded-xl p-4 sm:p-5",
        className,
      )}
      aria-label="Покупките предстоят"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-background/60 text-gold">
          <Lock className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">Покупките се отключват скоро</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            Разгледайте съдържанието и примерите. Ще Ви уведомим при пускане.
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        className="min-h-11 shrink-0 border-gold/40 bg-background/40 text-foreground hover:bg-gold/10"
        onClick={() => openPrelaunchWaitlist(feature, { source, productId })}
      >
        <Bell className="mr-2 size-4" aria-hidden="true" />
        Извести ме при пускане
      </Button>
    </aside>
  );
}