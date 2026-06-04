import { AlertTriangle, AlertCircle, Info, Lightbulb, Lock } from "lucide-react";
import { Link } from "react-router-dom";
import type { RiskLevel } from "./RiskMeter";

export interface RiskIssue {
  severity: "low" | "medium" | "high";
  title: string;
  detail: string;
}

const sevMap = {
  high: { Icon: AlertTriangle, color: "text-danger", bg: "bg-danger/5 border-danger/30" },
  medium: { Icon: AlertCircle, color: "text-warning", bg: "bg-warning/5 border-warning/30" },
  low: { Icon: Info, color: "text-success", bg: "bg-success/5 border-success/30" },
} as const;

export function RiskReport({
  level,
  issues,
  recommendations,
  isPro = true,
}: {
  level: RiskLevel;
  issues: RiskIssue[];
  recommendations: string[];
  /** When false, only the first issue and first recommendation are revealed; rest are blurred behind a PRO upgrade CTA. */
  isPro?: boolean;
}) {
  if (level === "unknown") return null;

  const lockedIssues = !isPro && issues.length > 1;
  const lockedRecs = !isPro && (recommendations?.length ?? 0) > 1;
  const hiddenIssueCount = lockedIssues ? issues.length - 1 : 0;
  const hiddenRecCount = lockedRecs ? (recommendations.length - 1) : 0;
  const totalHidden = hiddenIssueCount + hiddenRecCount;

  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-serif text-lg font-bold">Идентифицирани слаби места</h3>
        <p className="text-xs text-muted-foreground">
          {isPro
            ? "Прегледайте преди да подпишете – системата отбелязва типични правни рискове."
            : "Безплатният преглед показва само първия риск и първата препоръка."}
        </p>
      </div>

      <div className="space-y-2">
        {issues.map((iss, i) => {
          const m = sevMap[iss.severity];
          const locked = !isPro && i >= 1;
          return (
            <div
              key={i}
              className={`rounded-lg border p-3 ${m.bg} ${locked ? "select-none blur-sm pointer-events-none" : ""}`}
              aria-hidden={locked || undefined}
            >
              <div className="flex items-start gap-3">
                <m.Icon className={`mt-0.5 h-4 w-4 flex-shrink-0 ${m.color}`} />
                <div>
                  <div className="text-sm font-semibold text-foreground">{iss.title}</div>
                  <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{iss.detail}</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {recommendations?.length > 0 && (
        <div className="rounded-lg border border-gold/30 bg-gold/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-gold" />
            <h4 className="text-sm font-semibold text-gold">Препоръки</h4>
          </div>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {recommendations.map((r, i) => {
              const locked = !isPro && i >= 1;
              return (
                <li
                  key={i}
                  className={`flex gap-2 ${locked ? "select-none blur-sm pointer-events-none" : ""}`}
                  aria-hidden={locked || undefined}
                >
                  <span className="text-gold">›</span>
                  <span>{r}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {!isPro && totalHidden > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-gold/40 bg-gold/10 p-3">
          <div className="flex items-start gap-2">
            <Lock className="mt-0.5 h-4 w-4 text-gold" />
            <div>
              <div className="text-sm font-semibold text-foreground">
                Още {totalHidden} находки са скрити
              </div>
              <p className="text-xs text-muted-foreground">
                PRO отключва пълния risk report — всички рискове и препоръки.
              </p>
            </div>
          </div>
          <Link
            to="/account?tab=subscription"
            className="shrink-0 rounded-md bg-gradient-gold px-3 py-1.5 text-xs font-semibold text-navy shadow-gold hover:opacity-90"
          >
            Отключи PRO
          </Link>
        </div>
      )}
    </div>
  );
}
