import { ShieldAlert, ShieldCheck, ShieldQuestion } from "@/icons";
import { cn } from "@/lib/utils";

export type RiskLevel = "low" | "medium" | "high" | "unknown";

const META: Record<RiskLevel, { label: string; color: string; bar: string; Icon: typeof ShieldCheck; tone: string }> = {
  low: { label: "Нисък риск", color: "text-success", bar: "bg-success", Icon: ShieldCheck, tone: "border-success/30 bg-success/5" },
  medium: { label: "Среден риск", color: "text-warning", bar: "bg-warning", Icon: ShieldAlert, tone: "border-warning/30 bg-warning/5" },
  high: { label: "Висок риск", color: "text-danger", bar: "bg-danger", Icon: ShieldAlert, tone: "border-danger/30 bg-danger/5" },
  unknown: { label: "Анализ предстои", color: "text-muted-foreground", bar: "bg-muted", Icon: ShieldQuestion, tone: "border-border bg-muted/20" },
};

export function RiskMeter({
  level,
  score,
  summary,
}: {
  level: RiskLevel;
  score?: number;
  summary?: string;
}) {
  const m = META[level];
  const pct = typeof score === "number" ? Math.max(2, Math.min(100, score)) : 0;
  return (
    <div className={cn("rounded-lg border p-4", m.tone)}>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <m.Icon className={cn("h-4 w-4", m.color)} />
          <span className={cn("text-xs font-semibold uppercase tracking-wider", m.color)}>
            Оценка на риска · {m.label}
          </span>
        </div>
        {typeof score === "number" && (
          <span className={cn("font-serif text-lg font-bold", m.color)}>{score}/100</span>
        )}
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-full bg-background/40">
        <div className={cn("h-full transition-all duration-700", m.bar)} style={{ width: `${pct}%` }} />
      </div>
      {summary && <p className="mt-3 text-xs leading-relaxed text-muted-foreground">{summary}</p>}
    </div>
  );
}
