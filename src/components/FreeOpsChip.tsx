/**
 * Compact chip showing free-ops counter in wizard chrome.
 * Click opens unified ProUpgradeDialog. Hides for Pro users.
 */

import { useState } from "react";
import { Sparkles } from "@/icons";
import { useFreeJourneyStage } from "@/hooks/useFreeJourneyStage";
import { ProUpgradeDialog } from "@/components/ProUpgradeDialog";
import { trackEvent } from "@/lib/analytics";
import { cn } from "@/lib/utils";

export function FreeOpsChip() {
  const { isPro, loading, stage, opsUsed, opsCap, opsLeft } = useFreeJourneyStage();
  const [open, setOpen] = useState(false);

  if (loading || isPro) return null;

  const tone =
    stage >= 3
      ? "border-gold/60 bg-gold/15 text-gold"
      : stage === 2
        ? "border-gold/40 bg-gold/10 text-gold"
        : "border-border/60 bg-card/40 text-foreground/80";

  const label =
    stage >= 3
      ? "Изчерпан лимит · Pro"
      : stage === 2
        ? `Остава ${opsLeft} — виж Pro`
        : `${opsUsed}/${opsCap} безплатни`;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          trackEvent("tease_clicked", { channel: "ops_chip", stage });
          setOpen(true);
        }}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors hover:border-gold/60",
          tone,
        )}
        aria-label="Безплатни операции — отвори Pro оферта"
      >
        <Sparkles className="h-3 w-3" />
        {label}
      </button>
      <ProUpgradeDialog
        open={open}
        onOpenChange={setOpen}
        trigger={stage >= 3 ? "ops_exhausted" : "generic"}
      />
    </>
  );
}
