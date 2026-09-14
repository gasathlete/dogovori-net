/**
 * RoiSavingsBanner — кратко ROI сравнение (само EUR) за пейуол и /plans.
 * Всички имена и цени идват от `src/lib/pricing.ts` (единствен източник).
 */
import { PiggyBank, Check } from "@/icons";
import { useAudience } from "@/hooks/useAudience";
import {
  PRICING_PLANS,
  monthlyLabel,
  opsLabel,
  fmtEur,
  teamMinYearlyTotal,
  yearlyLabel,
} from "@/lib/pricing";

export function RoiSavingsBanner({ className = "" }: { className?: string }) {
  const { audience } = useAudience();
  const isFreelancer = audience === "freelancer";
  const team = PRICING_PLANS.team;

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
            Какво включва абонаментът
          </p>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            {isFreelancer ? (
              <>
                План{" "}
                <span className="font-medium text-foreground">
                  {PRICING_PLANS.professional.name}
                </span>{" "}
                — {monthlyLabel("professional")} ({opsLabel("professional")}) на месец. Подходящ,
                когато изготвяте документи редовно, а не еднократно.
              </>
            ) : (
              <>
                План{" "}
                <span className="font-medium text-foreground">
                  {PRICING_PLANS.entrepreneur.name}
                </span>{" "}
                — {monthlyLabel("entrepreneur")} ({opsLabel("entrepreneur")}) за малки фирми, или{" "}
                <span className="font-medium text-foreground">{team.name}</span> —{" "}
                {yearlyLabel("team")} (само годишно, мин. {team.seatMin} места ={" "}
                {fmtEur(teamMinYearlyTotal())}/год). Сравнете тези суми с реалните си разходи за
                договорна работа през последната година.
              </>
            )}
          </p>
          <ul className="mt-2 space-y-1 text-[11px] text-muted-foreground">
            <li className="flex items-start gap-1.5">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" aria-hidden />
              Цените са в EUR, с включен ДДС 20%.
            </li>
            <li className="flex items-start gap-1.5">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" aria-hidden />
              1 действие = 1 сваляне, 1 анализ или 1 AI съобщение.
            </li>
            <li className="flex items-start gap-1.5">
              <Check className="mt-0.5 h-3 w-3 shrink-0 text-success" aria-hidden />
              Сравнението е илюстративно и не е обещан резултат.
            </li>
          </ul>
        </div>

      </div>
    </div>
  );
}

export default RoiSavingsBanner;
