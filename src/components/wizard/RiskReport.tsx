import { AlertTriangle, AlertCircle, Info, Lightbulb } from "lucide-react";
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
}: {
  level: RiskLevel;
  issues: RiskIssue[];
  recommendations: string[];
}) {
  if (level === "unknown") return null;
  return (
    <div className="space-y-4">
      <div>
        <h3 className="font-serif text-lg font-bold">Идентифицирани слаби места</h3>
        <p className="text-xs text-muted-foreground">
          Прегледайте преди да подпишете – системата отбелязва типични правни рискове.
        </p>
      </div>

      <div className="space-y-2">
        {issues.map((iss, i) => {
          const m = sevMap[iss.severity];
          return (
            <div key={i} className={`rounded-lg border p-3 ${m.bg}`}>
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
            {recommendations.map((r, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-gold">›</span>
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
