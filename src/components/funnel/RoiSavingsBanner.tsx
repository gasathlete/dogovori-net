/**
 * RoiSavingsBanner — кратко ROI сравнение (само EUR) за пейуол и /plans.
 * Показва спестената сума спрямо адвокатски хонорар за съответния сегмент.
 */
import { PiggyBank, Check } from "@/icons";
import { useAudience } from "@/hooks/useAudience";

export function RoiSavingsBanner({ className = "" }: { className?: string }) {
  const { audience } = useAudience();
  const isFreelancer = audience === "freelancer";

  return (
    <div
      className={`rounded-xl border border-gold/40 bg-gold/5 p-4 ${className}`}
      aria-label="ROI сравнение"
    >
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold">
          <PiggyBank className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-foreground">
            Спести над <span className="text-gold">150 EUR</span> за адвокатски хонорар
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {isFreelancer ? (
              <>
                План <span className="font-medium text-foreground">Професионалист</span> — 12,90
                €/мес (50 операции). Един изготвен договор при адвокат струва 150–400 EUR, тук се
                изплаща от първия документ.
              </>
            ) : (
              <>
                План <span className="font-medium text-foreground">Предприемач</span> — 19,90 €/мес
                (100 операции) за малки фирми, или{" "}
                <span className="font-medium text-foreground">Екип</span> — 109 €/място/год (само
                годишно, мин. 3 места = 327 €/год). Едно юридическо становище месечно вече
                надхвърля годишния абонамент.
              </>
            )}
          </p>
          <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
            <li className="flex items-start gap-1.5">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-gold" aria-hidden />
              Цените са в EUR, с включен ДДС 20%.
            </li>
            <li className="flex items-start gap-1.5">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-emerald-600 dark:text-gold" aria-hidden />
              1 операция = 1 сваляне, 1 анализ или 1 AI съобщение.
            </li>
          </ul>
        </div>
      </div>
    </div>
  );
}

export default RoiSavingsBanner;
