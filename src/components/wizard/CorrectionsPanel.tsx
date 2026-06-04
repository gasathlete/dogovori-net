import { useMemo, useState } from "react";
import { Loader2, ShieldCheck, Lock, CheckCircle2, ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import type { RiskIssue } from "./RiskReport";

export interface CorrectionsSelection {
  issues: RiskIssue[];
  recommendations: string[];
}

export function CorrectionsPanel({
  isPro,
  issues,
  recommendations,
  loading,
  applied,
  onApply,
  onUpgrade,
}: {
  isPro: boolean;
  issues: RiskIssue[];
  recommendations: string[];
  loading: boolean;
  applied?: string[];
  onApply: (sel: CorrectionsSelection) => void;
  onUpgrade: () => void;
}) {
  const [issueSel, setIssueSel] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(issues.map((_, i) => [i, true])),
  );
  const [recSel, setRecSel] = useState<Record<number, boolean>>(() =>
    Object.fromEntries(recommendations.map((_, i) => [i, true])),
  );
  const [open, setOpen] = useState(false);

  const selectedIssues = useMemo(
    () => issues.filter((_, i) => issueSel[i]),
    [issues, issueSel],
  );
  const selectedRecs = useMemo(
    () => recommendations.filter((_, i) => recSel[i]),
    [recommendations, recSel],
  );
  const total = selectedIssues.length + selectedRecs.length;

  if (issues.length === 0 && recommendations.length === 0) return null;

  return (
    <div className="rounded-xl border border-gold/30 bg-gradient-card p-6 shadow-soft">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 text-left"
        aria-expanded={open}
      >
        <ShieldCheck className="h-4 w-4 text-gold" />
        <h3 className="font-serif text-lg font-bold">Автоматична корекция</h3>
        {!isPro && (
          <span className="ml-auto inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-gold">
            <Lock className="h-3 w-3" /> Pro
          </span>
        )}
        {open ? (
          <ChevronUp className={`h-4 w-4 text-muted-foreground ${isPro ? "ml-auto" : "ml-2"}`} />
        ) : (
          <ChevronDown className={`h-4 w-4 text-muted-foreground ${isPro ? "ml-auto" : "ml-2"}`} />
        )}
      </button>
      {!open && (
        <p className="mt-2 text-xs text-muted-foreground">
          {issues.length + recommendations.length} възможни подобрения. Натиснете, за да изберете кои да бъдат приложени.
        </p>
      )}
      {open && (
      <>
      <p className="mt-2 mb-4 text-xs text-muted-foreground">
        Изберете кои слаби места и препоръки да бъдат коригирани в договора. Системата
        ще пренапише само избраните части.
      </p>

      {applied && applied.length > 0 && (
        <div className="mb-4 rounded-lg border border-success/30 bg-success/5 p-3">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-success">
            <CheckCircle2 className="h-3.5 w-3.5" /> Приложени корекции
          </div>
          <ul className="space-y-1 text-xs text-muted-foreground">
            {applied.map((a, i) => (
              <li key={i} className="flex gap-2">
                <span className="text-success">✓</span>
                <span>{a}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {issues.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Слаби места {!isPro && issues.length > 2 && (
              <span className="ml-1 normal-case text-[10px] text-gold">(преглед: първите 2 от {issues.length})</span>
            )}
          </div>
          <div className="space-y-1.5">
            {issues.map((iss, i) => {
              const locked = !isPro && i >= 2;
              return (
                <label
                  key={i}
                  className={`flex cursor-pointer items-start gap-2 rounded-md border border-border/40 bg-card/40 p-2 transition-colors hover:border-gold/40 ${locked ? "select-none blur-sm pointer-events-none" : ""}`}
                  aria-hidden={locked || undefined}
                >
                  <Checkbox
                    checked={!!issueSel[i]}
                    onCheckedChange={(v) => setIssueSel((p) => ({ ...p, [i]: !!v }))}
                    disabled={!isPro || loading}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">{iss.title}</div>
                    <div className="line-clamp-2 text-xs text-muted-foreground">{iss.detail}</div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {recommendations.length > 0 && (
        <div className="mb-4">
          <div className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Препоръки {!isPro && recommendations.length > 2 && (
              <span className="ml-1 normal-case text-[10px] text-gold">(преглед: първите 2 от {recommendations.length})</span>
            )}
          </div>
          <div className="space-y-1.5">
            {recommendations.map((r, i) => {
              const locked = !isPro && i >= 2;
              return (
                <label
                  key={i}
                  className={`flex cursor-pointer items-start gap-2 rounded-md border border-border/40 bg-card/40 p-2 transition-colors hover:border-gold/40 ${locked ? "select-none blur-sm pointer-events-none" : ""}`}
                  aria-hidden={locked || undefined}
                >
                  <Checkbox
                    checked={!!recSel[i]}
                    onCheckedChange={(v) => setRecSel((p) => ({ ...p, [i]: !!v }))}
                    disabled={!isPro || loading}
                    className="mt-0.5"
                  />
                  <div className="text-xs text-foreground">{r}</div>
                </label>
              );
            })}
          </div>
        </div>
      )}

      {isPro ? (
        <Button
          onClick={() => onApply({ issues: selectedIssues, recommendations: selectedRecs })}
          disabled={loading || total === 0}
          className="w-full bg-gradient-gold text-navy hover:shadow-gold"
        >
          {loading ? (
            <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Прилагане…</>
          ) : (
            <><ShieldCheck className="mr-2 h-4 w-4" /> Приложи избраните ({total})</>
          )}
        </Button>
      ) : (
        <Button
          onClick={onUpgrade}
          variant="outline"
          className="w-full border-gold/40 text-gold hover:bg-gold/10"
        >
          <Lock className="mr-2 h-4 w-4" /> Отключи с Pro план
        </Button>
      )}
      </>
      )}
    </div>
  );
}
