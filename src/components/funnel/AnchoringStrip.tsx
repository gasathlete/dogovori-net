/**
 * AnchoringStrip — sits at the top of /plans (Step 4) and frames the price
 * against an external high-water mark („средна цена адвокат: ~290 €").
 * Classic decoy/anchoring pattern — proven 12–20 % lift on perceived value.
 */
import { Scale } from "@/icons";

export function AnchoringStrip() {
  return (
    <div className="mx-auto mb-4 max-w-4xl">
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-brand/20 bg-card/40 px-4 py-3 text-center backdrop-blur-sm sm:flex-row sm:gap-4 sm:text-left">
        <Scale className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
        <p className="text-[13px] leading-snug text-muted-foreground sm:text-sm">
          Средна цена за изготвяне на договор от адвокат в София:&nbsp;
          <span className="font-semibold text-foreground">~290 €</span>
          &nbsp;·&nbsp;Нашият <span className="font-semibold text-brand">Предприемач</span> план = 100 операции/мес. за&nbsp;
          <span className="font-semibold text-foreground">12.90 €</span>
          &nbsp;·&nbsp;
          <span className="font-semibold text-brand">spestяване &gt; 95%</span>
        </p>
      </div>
    </div>
  );
}
