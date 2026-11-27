import { Bell, Lock } from "@/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { getPrelaunchStatus, isFeatureAvailable, type PrelaunchFeature } from "@/lib/prelaunch";
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
  // Shown only while the feature is really closed; open features get no banner.
  if (isFeatureAvailable(feature)) return null;
  const status = getPrelaunchStatus(feature);
  return (
    <aside
      data-testid="launch-purchase-banner"
      className={cn(
        "flex flex-col gap-3 border border-gold/30 bg-gold/[0.06] sm:flex-row sm:items-center sm:justify-between",
        compact ? "rounded-lg p-3 sm:flex-col sm:items-stretch" : "rounded-xl p-4 sm:p-5",
        className,
      )}
      aria-label="Покупките предстоят"
    >
      <div className="flex min-w-0 items-start gap-3">
        <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-gold/30 bg-background/60 text-gold">
          <Lock className="size-4" aria-hidden="true" />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">{status.title}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
            {status.reason} Разгледайте съдържанието и примерите.
          </p>
        </div>
      </div>
      <Button
        type="button"
        variant="outline"
        className={cn("min-h-11 shrink-0 border-gold/40 bg-background/40 text-foreground hover:bg-gold/10", compact && "w-full whitespace-normal")}
        onClick={() => openPrelaunchWaitlist(feature, { source, productId })}
      >
        <Bell className="mr-2 size-4" aria-hidden="true" />
        Извести ме при пускане
      </Button>
    </aside>
  );
}

/**
 * Packages and kits are browse-only compositions without a separate purchase.
 * One quiet line on the list page (/paketi, /komplekti) — never a box, never on cards or details.
 */
export function PackagePurchaseNote({ source, productId, className }: {
  source: WaitlistSource;
  productId: string;
  className?: string;
}) {
  return (
    <p data-testid="package-purchase-note" className={cn("text-sm leading-relaxed text-muted-foreground", className)}>
      Отделна покупка на пакет или комплект още не се предлага; документите се разглеждат и изготвят поотделно.{" "}
      <button
        type="button"
        className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-foreground"
        onClick={() => openPrelaunchWaitlist("one_time_product", { source, productId })}
      >
        Извести ме при пускане
      </button>
    </p>
  );
}
