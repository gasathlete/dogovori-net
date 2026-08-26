import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ArrowRight, PiggyBank, X } from "@/icons";
import { LAWYER_FEE_MIN_EUR, PRICING_PLANS, monthlyLabel, opsLabel, yearlyLabel } from "@/lib/pricing";

interface Props {
  /** Скрива банера (запомня се от страницата, която го показва). */
  onDismiss?: () => void;
  /** Брой сваляния в текущата сесия — усилва аргумента за абонамент. */
  downloads?: number;
}

/**
 * Показва се веднага след успешно сваляне на документ.
 *
 * Целта е контекстуално надграждане: потребителят вече е усетил стойността,
 * затова говорим на езика на спестените юридически разходи, а не на функции.
 * Всички цени идват от `src/lib/pricing.ts` (EUR, с ДДС).
 */
export function PostDownloadUpgradeBanner({ onDismiss, downloads }: Props) {
  const saved = LAWYER_FEE_MIN_EUR * Math.max(1, downloads ?? 1);
  return (
    <div className="relative mt-4 overflow-hidden rounded-2xl border border-emerald-500/30 bg-emerald-500/[0.06] p-5 shadow-soft animate-fade-in">
      {onDismiss && (
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Скрий предложението"
          className="absolute right-3 top-3 inline-flex h-7 w-7 items-center justify-center rounded-full border border-border/60 text-muted-foreground transition-colors hover:border-gold/40 hover:text-gold"
        >
          <X className="h-3.5 w-3.5" aria-hidden />
        </button>
      )}
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-emerald-500/40 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
          <PiggyBank className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-base text-foreground sm:text-lg">
            Документът е свален — спестихте над {saved} EUR юридически разходи
          </h3>
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">
            За малка фирма или самостоятелна практика план{" "}
            <span className="font-medium text-foreground">{PRICING_PLANS.professional.name}</span> е
            най-краткият път до предвидими разходи:{" "}
            <span className="font-medium text-foreground">
              {monthlyLabel("professional")} или {yearlyLabel("professional")}
            </span>{" "}
            за {opsLabel("professional")} — договори, анализ на риска, корекции и електронен подпис
            без допълнително договаряне на хонорар.
          </p>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button asChild className="gap-2 bg-gradient-gold text-navy hover:shadow-gold">
              <Link to="/plans?plan=professional&from=post_download">
                Виж всички планове
                <ArrowRight className="h-4 w-4" aria-hidden />
              </Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
