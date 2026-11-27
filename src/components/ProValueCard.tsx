/**
 * Inline tease card shown inside wizard/review left column for free users.
 * Adapts copy by free-journey stage and opens the unified ProUpgradeDialog.
 */

import { useEffect, useState } from "react";
import { Crown, Sparkles, Trophy, Zap, ArrowRight } from "@/icons";
import { Button } from "@/components/ui/button";
import { useFreeJourneyStage } from "@/hooks/useFreeJourneyStage";
import { ProUpgradeDialog, type ProUpgradeTrigger } from "@/components/ProUpgradeDialog";
import { trackEvent } from "@/lib/analytics";

interface Props {
  /** Trigger label for analytics + dialog copy. */
  source?: ProUpgradeTrigger;
  /** Hide on stage 0 by default; pass true to always show for logged-in free. */
  alwaysShow?: boolean;
}

export function ProValueCard({ source = "generic", alwaysShow = false }: Props) {
  const { isPro, stage, opsLeft, opsCap, loading } = useFreeJourneyStage();
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!loading && !isPro && (alwaysShow || stage >= 1)) {
      trackEvent("tease_shown", { channel: "value_card", stage, source });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, isPro, stage]);

  if (loading || isPro) return null;
  if (!alwaysShow && stage === 0) return null;

  const stageCopy =
    stage >= 3
      ? {
          headline: "Изчерпа безплатния си лимит",
          sub: `${opsCap}/${opsCap} операции за месеца. Продължи без прекъсване с Pro.`,
          cta: "Активирай Pro",
          tone: "urgent" as const,
        }
      : stage === 2
        ? {
            headline: `Остава ти ${opsLeft} безплатна операция`,
            sub: "Виж какво отключваш с Pro — преди следващото действие.",
            cta: "Виж плановете",
            tone: "warm" as const,
          }
        : {
            headline: "Получи повече с Pro",
            sub: `Използва ${opsCap - opsLeft}/${opsCap} безплатни. Pro = 100/месец и пълен достъп.`,
            cta: "Виж какво включва",
            tone: "soft" as const,
          };

  const handleClick = () => {
    trackEvent("tease_clicked", { channel: "value_card", stage, source });
    setOpen(true);
  };

  const borderTone =
    stageCopy.tone === "urgent"
      ? "border-gold/60 bg-gradient-to-br from-gold/15 to-gold/5"
      : stageCopy.tone === "warm"
        ? "border-gold/40 bg-gold/8"
        : "border-border/60 bg-gradient-card";

  return (
    <>
      <div className={`rounded-xl border p-4 shadow-soft ${borderTone}`}>
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/15">
            <Crown className="h-4 w-4 text-gold" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="font-serif text-base font-bold">{stageCopy.headline}</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">{stageCopy.sub}</p>

            <ul className="mt-3 grid grid-cols-1 gap-1.5 text-xs">
              <li className="flex items-center gap-1.5">
                <Zap className="h-3 w-3 text-gold" /> 100 операции/мес
              </li>
              <li className="flex items-center gap-1.5">
                <Sparkles className="h-3 w-3 text-gold" /> Анализ и поправки на документи
              </li>
              <li className="flex items-center gap-1.5">
                <Trophy className="h-3 w-3 text-gold" /> Loyalty: 5–15% доживот
              </li>
            </ul>

            <Button
              onClick={handleClick}
              size="sm"
              className="mt-3 w-full bg-gradient-gold text-navy hover:shadow-gold"
            >
              {stageCopy.cta}
              <ArrowRight className="ml-1 h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      </div>

      <ProUpgradeDialog open={open} onOpenChange={setOpen} trigger={source} />
    </>
  );
}
