import { useState } from "react";
import { Plus, Zap, Sparkles, Rocket, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { useAuth } from "@/hooks/useAuth";


export interface TopupPack {
  priceId: "topup_10" | "topup_20" | "topup_50" | "topup_100";
  ops: number;
  priceEur: string;
  perOp: string;
  icon: typeof Plus;
  badge?: string;
}

export const TOPUP_PACKS: TopupPack[] = [
  { priceId: "topup_10", ops: 10, priceEur: "2.90 €", perOp: "0.29 €/оп.", icon: Plus },
  { priceId: "topup_20", ops: 20, priceEur: "5.40 €", perOp: "0.27 €/оп.", icon: Zap },
  { priceId: "topup_50", ops: 50, priceEur: "12.90 €", perOp: "0.258 €/оп.", icon: Sparkles, badge: "Най-избиран" },
  { priceId: "topup_100", ops: 100, priceEur: "23.90 €", perOp: "0.239 €/оп.", icon: Rocket, badge: "Най-изгоден" },
];

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
                  +{pack.ops} операции
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
          Top-up пакетите са достъпни след активиране на абонамент.
        </p>
      )}
      {activePack && user && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm p-4"
          onClick={() => setActivePack(null)}
        >
          <div
            className="relative w-full max-w-2xl rounded-lg border border-border bg-card p-4 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              aria-label="Затвори"
              onClick={() => setActivePack(null)}
              className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground hover:bg-muted"
            >
              <X className="h-4 w-4" />
            </button>
            <StripeEmbeddedCheckout
              priceId={activePack.priceId}
              quantity={1}
              customerEmail={user.email}
              userId={user.id}
              returnUrl={`${window.location.origin}/account?tab=billing&topup=success&session_id={CHECKOUT_SESSION_ID}`}
            />
          </div>
        </div>
      )}
    </div>
  );
}
