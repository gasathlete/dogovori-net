/**
 * AnchoringStrip — sits at the top of /plans (Step 4) and frames the price
 * against an external high-water mark („средна цена адвокат: ~290 €").
 * Classic decoy/anchoring pattern — proven 12–20 % lift on perceived value.
 */
import { Scale } from "@/icons";
import { useAudience } from "@/hooks/useAudience";

export function AnchoringStrip() {
  const { copy } = useAudience();
  return (
    <div className="mx-auto mb-4 max-w-4xl">
      <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-brand/20 bg-card/40 px-4 py-3 text-center backdrop-blur-sm sm:flex-row sm:gap-4 sm:text-left">
        <Scale className="h-5 w-5 shrink-0 text-brand" aria-hidden="true" />
        <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[13px] leading-snug text-muted-foreground sm:text-sm">
          {copy.anchors.map((line, i) => (
            <span key={line} className="inline-flex items-center gap-3">
              {i > 0 && <span aria-hidden="true" className="text-brand/40">·</span>}
              <span
                className={
                  i === copy.anchors.length - 1
                    ? "font-semibold text-brand"
                    : "text-muted-foreground"
                }
              >
                {line}
              </span>
            </span>
          ))}
          <span className="font-semibold text-brand">спестяване &gt; 95%</span>
        </div>
      </div>
    </div>
  );
}
