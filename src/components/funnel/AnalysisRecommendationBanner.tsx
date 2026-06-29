/**
 * Shown on /plans when the user arrived from /analiz and we have a saved
 * AnalysisSession. Personalizes Step 4 (Convert) with the exact risk count
 * and the matching recommended plan.
 */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Sparkles, ArrowRight, X } from "lucide-react";
import { loadAnalysisSession, type AnalysisSession } from "@/lib/funnel";

const PLAN_LABEL: Record<AnalysisSession["recommendedPlan"], string> = {
  free: "Безплатен",
  professional: "Професионалист",
  entrepreneur: "Предприемач",
};

export function AnalysisRecommendationBanner() {
  const [session, setSession] = useState<AnalysisSession | null>(null);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    setSession(loadAnalysisSession());
  }, []);

  if (!session || dismissed) return null;
  const remainingH = Math.max(0, Math.round((session.expiresAt - Date.now()) / 3_600_000));

  return (
    <div className="relative mx-auto mb-6 max-w-4xl overflow-hidden rounded-2xl border border-brand/40 bg-gradient-to-br from-brand/10 via-card/80 to-card/60 p-4 shadow-brand sm:p-6">
      <button
        type="button"
        onClick={() => setDismissed(true)}
        className="absolute right-3 top-3 rounded-full p-1 text-muted-foreground transition-colors hover:bg-card/80 hover:text-foreground"
        aria-label="Затвори препоръката"
      >
        <X className="h-4 w-4" />
      </button>

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 pr-6">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-brand/15 px-2.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-brand">
            <Sparkles className="h-3 w-3" /> На база твоя анализ
          </div>
          <h3 className="mt-2 font-serif text-lg font-bold leading-snug sm:text-xl">
            Открихме <span className="text-brand">{session.risks.length} риска</span>{" "}
            в твоя {session.documentKind?.toLowerCase()} — препоръчваме{" "}
            <span className="text-brand">{PLAN_LABEL[session.recommendedPlan]}</span>
          </h3>
          <p className="mt-1 text-sm text-muted-foreground">
            Запазваме резултата ти още <strong>{remainingH} часа</strong>. Активирай
            7-дневен trial без карта.
          </p>
        </div>
        <Link
          to="/auth?tab=signup&redirect=%2Faccount%3Ftab%3Dsubscription%26plan%3Dentrepreneur"
          className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-gradient-brand px-5 py-3 text-sm font-semibold text-white shadow-brand transition-transform hover:-translate-y-0.5"
        >
          Активирай 7-дневен trial
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>
    </div>
  );
}
