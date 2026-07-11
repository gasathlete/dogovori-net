import { AlertTriangle, AlertCircle, Info, Lightbulb, Lock, ShieldCheck, CheckCircle2 } from "lucide-react";
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
  strengths,
  isPro = true,
}: {
  level: RiskLevel;
  issues: RiskIssue[];
  recommendations: string[];
  strengths?: string[];
  /** When false, content stays fully visible but a Pro teaser banner is appended. */
  isPro?: boolean;
}) {
  if (level === "unknown") return null;
  const hasStrengths = Array.isArray(strengths) && strengths.length > 0;

  return (
    <div className="space-y-4">
      {hasStrengths && (
        <div className="rounded-lg border border-success/30 bg-success/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <ShieldCheck className="h-4 w-4 text-success" />
            <h4 className="text-sm font-semibold text-success">
              Силни страни на документа ({strengths!.length})
            </h4>
          </div>
          <ul className="space-y-1.5 text-xs text-muted-foreground">
            {strengths!.map((s, i) => (
              <li key={i} className="flex gap-2">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-success" />
                <span className="leading-relaxed">{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div>
        <h3 className="font-serif text-lg font-bold">
          {issues.length === 0
            ? (strengths && strengths.length > 0
              ? `Документът е готов за подпис — ${strengths.length} защитни клаузи в него`
              : "Няма установени слаби места")
            : "Идентифицирани слаби места"}
        </h3>
        <p className="text-xs text-muted-foreground">
          {issues.length === 0
            ? "Документът покрива необходимите за вида клаузи. Прегледайте препоръките за следващи стъпки."
            : "Прегледайте преди да подпишете — системата отбелязва типични правни рискове."}
        </p>
      </div>

      {issues.length > 0 && (
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
      )}

      {recommendations?.length > 0 && (
        <div className="rounded-lg border border-gold/30 bg-gold/5 p-4">
          <div className="mb-2 flex items-center gap-2">
            <Lightbulb className="h-4 w-4 text-gold" />
            <h4 className="text-sm font-semibold text-gold">Следващи стъпки</h4>
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

      {!isPro && (issues.length + (recommendations?.length ?? 0)) > 0 && (
        <div className="flex items-center justify-between gap-3 rounded-lg border border-gold/40 bg-gold/10 p-3">
          <div className="flex items-start gap-2">
            <Lock className="mt-0.5 h-4 w-4 text-gold" />
            <div>
              <div className="text-sm font-semibold text-foreground">
                Прилагаш до 2 безплатни вълни корекции
              </div>
              <p className="text-xs text-muted-foreground">
                С Предприемач: неограничени корекции + експорт с track changes.
              </p>
            </div>
          </div>
          <Link
            to="/plans"
            className="shrink-0 rounded-md bg-gradient-gold px-3 py-1.5 text-xs font-semibold text-navy shadow-gold hover:opacity-90"
          >
            Виж Предприемач
          </Link>
        </div>
      )}
    </div>
  );
}

