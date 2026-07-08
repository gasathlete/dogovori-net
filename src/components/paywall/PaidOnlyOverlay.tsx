/**
 * PaidOnlyOverlay — Wraps premium content and renders it blurred with a
 * value-first upgrade CTA on top for free users. Track `paywall_shown` per pillar.
 *
 * Usage:
 *   <PaidOnlyOverlay pillar="assistant" headline="Правен AI Асистент" sub="…">
 *     <RealAssistantContent />
 *   </PaidOnlyOverlay>
 */
import { useEffect, useState, type ReactNode } from "react";
import { Crown, Sparkles, ArrowRight, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useIsPro } from "@/hooks/useIsPro";
import { trackEvent, trackPillarView, trackPillarCta } from "@/lib/analytics";
import { ProUpgradeDialog, type ProUpgradeTrigger } from "@/components/ProUpgradeDialog";
import { cn } from "@/lib/utils";

export type Pillar =
  | "assistant"
  | "risk_analysis"
  | "bilingual"
  | "signing"
  | "kits"
  | "corrections";

interface Props {
  pillar: Pillar;
  headline: string;
  sub: string;
  /** Copy for the CTA button. Defaults to "Виж Предприемач". */
  ctaLabel?: string;
  /** Trigger passed to ProUpgradeDialog. Defaults to "generic". */
  trigger?: ProUpgradeTrigger;
  /** When false, renders children without overlay (Pro users / bypass). */
  enabled?: boolean;
  /** Minimum height so the blurred content has substance to preview. */
  minHeight?: string;
  children: ReactNode;
}

const PILLAR_TO_TRIGGER: Record<Pillar, ProUpgradeTrigger> = {
  assistant: "generic",
  risk_analysis: "generic",
  bilingual: "generic",
  signing: "generic",
  kits: "generic",
  corrections: "corrections",
};

export function PaidOnlyOverlay({
  pillar,
  headline,
  sub,
  ctaLabel = "Виж Предприемач",
  trigger,
  enabled,
  minHeight = "22rem",
  children,
}: Props) {
  const { isPro, loading } = useIsPro();
  const [open, setOpen] = useState(false);

  const showOverlay = enabled ?? (!loading && !isPro);

  useEffect(() => {
    if (showOverlay) {
      trackEvent("paywall_shown", { pillar });
    }
  }, [showOverlay, pillar]);

  if (!showOverlay) return <>{children}</>;

  return (
    <>
      <div className="relative overflow-hidden rounded-xl border border-border/60" style={{ minHeight }}>
        {/* Blurred preview */}
        <div
          aria-hidden
          className="pointer-events-none select-none"
          style={{ filter: "blur(6px) saturate(0.7)", opacity: 0.55 }}
        >
          {children}
        </div>

        {/* Glass CTA card */}
        <div className="absolute inset-0 flex items-center justify-center bg-gradient-to-b from-background/40 via-background/70 to-background/85 backdrop-blur-[2px]">
          <div className={cn(
            "mx-4 max-w-md rounded-2xl border border-gold/40 bg-card/95 p-6 text-center shadow-gold",
          )}>
            <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-full bg-gold/15">
              <Lock className="h-5 w-5 text-gold" />
            </div>
            <h3 className="font-serif text-lg font-bold text-foreground">{headline}</h3>
            <p className="mt-1.5 text-sm text-muted-foreground">{sub}</p>

            <ul className="mx-auto mt-4 max-w-xs space-y-1.5 text-left text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <Sparkles className="h-3.5 w-3.5 text-gold" /> 100 операции/мес.
              </li>
              <li className="flex items-center gap-2">
                <Crown className="h-3.5 w-3.5 text-gold" /> Пълен достъп до всички AI функции
              </li>
              <li className="flex items-center gap-2">
                <ArrowRight className="h-3.5 w-3.5 text-gold" /> Отмени по всяко време
              </li>
            </ul>

            <Button
              size="sm"
              onClick={() => {
                trackEvent("paywall_cta_click", { pillar });
                setOpen(true);
              }}
              className="mt-5 w-full bg-gradient-gold text-navy hover:shadow-gold"
            >
              {ctaLabel}
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Button>
            <p className="mt-2 text-[11px] text-muted-foreground">
              Предприемач 19.90 €/мес. · Проф. 12.90 €/мес.
            </p>
          </div>
        </div>
      </div>
      <ProUpgradeDialog
        open={open}
        onOpenChange={setOpen}
        trigger={trigger ?? PILLAR_TO_TRIGGER[pillar]}
      />
    </>
  );
}
