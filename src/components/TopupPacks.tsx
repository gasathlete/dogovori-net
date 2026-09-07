import { useEffect, useState } from "react";
import { Plus, Zap, Sparkles, Rocket, X } from "@/icons";
import { Button } from "@/components/ui/button";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { useAuth } from "@/hooks/useAuth";
import { TOPUP_PACK_CONFIG, fmtEur, perOpLabel, type TopupPackConfig } from "@/lib/pricing";
import { buildCheckoutReturnUrl } from "@/lib/checkoutAnalytics";


const PACK_ICONS: Record<TopupPackConfig["priceId"], typeof Plus> = {
  topup_5: Plus,
  topup_20: Zap,
  topup_50: Sparkles,
  topup_100: Rocket,
};


export interface TopupPack {
  priceId: TopupPackConfig["priceId"];
  ops: number;
  priceEur: string;
  perOp: string;
  icon: typeof Plus;
  badge?: string;
}

export const TOPUP_PACKS: TopupPack[] = TOPUP_PACK_CONFIG.map((pack) => ({
  priceId: pack.priceId,
  ops: pack.ops,
  priceEur: fmtEur(pack.eur),
  perOp: perOpLabel(pack),
  icon: PACK_ICONS[pack.priceId],
  badge: pack.badge,
}));

interface TopupPacksProps {
  /** When false, cards are disabled and a hint to subscribe first is shown. */
  enabled?: boolean;
  /** Compact 2-column layout (paywall/dialog). Default = 4-column. */
  compact?: boolean;
  className?: string;
}

export function TopupPacks({ enabled = true, compact = false, className }: TopupPacksProps) {
  const { user } = useAuth();
  const [activePack, setActivePack] = useState<TopupPack | null>(null);

  useEffect(() => {
    if (!activePack) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [activePack]);

  const handleBuy = (pack: TopupPack) => {
    if (!enabled || !user) return;
    setActivePack(pack);
  };


  return (
    <div className={className}>
      <div
        className={
          compact
            ? "grid gap-2.5 sm:grid-cols-2"
            : "grid gap-3 sm:grid-cols-2 lg:grid-cols-4"
        }
      >
        {TOPUP_PACKS.map((pack) => {
          const Icon = pack.icon;
          return (
            <div
              key={pack.priceId}
              className={`relative flex flex-col rounded-lg border bg-card/60 p-4 transition-all ${
                enabled
                  ? "border-gold/20 hover:-translate-y-0.5 hover:border-gold/50 hover:shadow-[0_8px_24px_-12px_hsl(var(--gold)/0.45)]"
                  : "border-border/40 opacity-60"
              }`}
            >
              {pack.badge && (
                <span className="absolute -top-2 right-3 rounded-full bg-gold px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-navy">
                  {pack.badge}
                </span>
              )}
              <div className="mb-2 flex items-center gap-2">
                <Icon aria-hidden className="h-4 w-4 text-gold" />
                <span className="text-sm font-semibold text-foreground">
                  +{pack.ops} действия
                </span>
              </div>
              <div className="mb-1 text-xl font-bold text-foreground">{pack.priceEur}</div>
              <div className="mb-3 text-[11px] text-muted-foreground">{pack.perOp} · ДДС вкл.</div>
              <Button
                size="sm"
                disabled={!enabled}
                onClick={() => handleBuy(pack)}
                className="mt-auto w-full bg-gold text-navy hover:bg-gold/90"
              >
                {enabled ? "Купи" : "Само за абонати"}
              </Button>
            </div>
          );
        })}
      </div>
      {!enabled && (
        <p className="mt-3 text-center text-xs text-muted-foreground">
          Пакетите с допълнителни действия са достъпни след активиране на абонамент.
        </p>
      )}
      {activePack && user && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto overscroll-contain bg-background/80 p-4 backdrop-blur-sm sm:items-center"
          onClick={() => setActivePack(null)}
        >
          <div
            className="relative my-auto w-full max-w-2xl rounded-lg border border-border bg-card p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              aria-label="Затвори"
              onClick={() => setActivePack(null)}
              className="absolute right-3 top-3 z-10 rounded-full p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
            <StripeEmbeddedCheckout
              analyticsSource="topup"
              priceId={activePack.priceId}
              quantity={1}
              customerEmail={user.email}
              userId={user.id}
              returnUrl={buildCheckoutReturnUrl({
                origin: window.location.origin,
                priceId: activePack.priceId,
                source: "topup",
                redirect: "/account?tab=subscription",
              })}
            />

          </div>
        </div>
      )}
    </div>
  );
}
