/**
 * Следваща стъпка след проверка на качен документ.
 *
 * Показва се само на безплатни профили, след като резултатът вече е видим.
 * Не скрива нищо от показания резултат и не обещава повече от реалното: план
 * Професионалист дава 50 действия по документи на месец, а еднократната
 * поправка на един документ е 3,99 €.
 */
import { Link } from "react-router-dom";
import { ArrowRight, ShieldCheck, Wand2 } from "@/icons";
import { Button } from "@/components/ui/button";
import { PRICING_PLANS, fmtEur, opsLabel } from "@/lib/pricing";
import { trackMetric } from "@/lib/metrics";
import { useEffect } from "react";

interface Props {
  /** Колко проблемни клаузи е намерила проверката. */
  issuesCount: number;
  /** Ключ на документа — за проследяване без лични данни. */
  docKey?: string;
}

export function AnalysisUpgradeCta({ issuesCount, docKey }: Props) {
  useEffect(() => {
    trackMetric("analysis_upgrade_cta_shown", { issues: issuesCount, doc_key: docKey });
  }, [issuesCount, docKey]);

  const pro = PRICING_PLANS.professional;

  return (
    <section
      data-testid="analysis-upgrade-cta"
      className="rounded-xl border border-gold/35 bg-gold/5 p-6"
    >
      <h2 className="font-serif text-xl font-bold">Следваща стъпка: поправете клаузите, преди да подпишете</h2>
      <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
        {issuesCount > 0
          ? `Проверката отбеляза ${issuesCount} клаузи за преглед. Поправката предлага три варианта на всяка съществена клауза — по-предпазлив, балансиран и по-настъпателен — с текст, който можете да изпратите на другата страна.`
          : "Поправката предлага три варианта на всяка съществена клауза — по-предпазлив, балансиран и по-настъпателен — с текст, който можете да изпратите на другата страна."}
      </p>
      <ul className="mt-4 space-y-2 text-sm">
        <li className="flex items-start gap-2">
          <Wand2 className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
          <span>
            Еднократно за този документ: подробна поправка — 3,99 €, пълен пакет за преговори — 7,99 €.
          </span>
        </li>
        <li className="flex items-start gap-2">
          <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
          <span>
            При редовна работа: план {pro.name} — {fmtEur(pro.monthly!)}/мес, {opsLabel("professional")} на месец
            (проверки, поправки, изготвяне и сваляне). Отказ по всяко време.
          </span>
        </li>
      </ul>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row">
        <Button asChild className="min-h-11">
          <Link
            to="/produkti/popravi-dokument"
            onClick={() => trackMetric("analysis_upgrade_cta_click", { target: "product_improve", doc_key: docKey })}
          >
            Поправка на този документ — 3,99 €
          </Link>
        </Button>
        <Button asChild variant="outline" className="min-h-11 gap-2 border-gold/40 text-gold hover:bg-gold/10">
          <Link
            to="/plans?plan=professional&billing=monthly"
            onClick={() => trackMetric("analysis_upgrade_cta_click", { target: "plan_professional", doc_key: docKey })}
          >
            Вижте план {pro.name}
            <ArrowRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </section>
  );
}

export default AnalysisUpgradeCta;
