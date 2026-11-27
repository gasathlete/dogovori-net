import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, Loader2, ExternalLink, AlertTriangle, Info } from "@/icons";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/useAuth";
import { NegotiationStrategyPanel } from "@/components/NegotiationStrategyPanel";
import { emptyIssuesMessage, presentAnalysisScore } from "@/lib/analysisVerification";
import { historicalFindingsNotice, isSnapshotActionable } from "@/lib/analysisSourceBinding";
import { useSourceFreshness } from "@/hooks/useSourceFreshness";
import { AskDogovaryAIButton } from "@/components/console/AskDogovaryAIButton";

type AnalysisRow = {
  id: string;
  uploaded_contract_id: string | null;
  contract_type: string | null;
  summary: string | null;
  score: number | null;
  model: string | null;
  created_at: string;
  issues?: unknown;
  missing_clauses?: unknown;
  verification?: unknown;
  negotiation_strategy?: unknown;
};

type LinkedSource = { id: string; title: string; extracted_text: string } | null;

/** Анализът и свързаният източник се показват само като ЕДНА разрешена снимка. */
type Snapshot = { identity: string; analysis: AnalysisRow | null; source: LinkedSource };

export function AnalysisPane({ analysisId }: { analysisId: string }) {
  const { user } = useAuth();
  const identity = `${user?.id ?? ""}|${analysisId}`;
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [loading, setLoading] = useState(true);

  // Q2b2 — закъснели заявки не могат да напълнят изгледа за друг анализ/потребител.
  const tokenRef = useRef(0);
  const identityRef = useRef(identity);
  identityRef.current = identity;

  const load = useCallback(
    async (opts?: { silent?: boolean }) => {
      const scope = `${user?.id ?? ""}|${analysisId}`;
      const token = ++tokenRef.current;
      const live = () => token === tokenRef.current && identityRef.current === scope;
      if (!user || !analysisId) {
        setSnapshot({ identity: scope, analysis: null, source: null });
        setLoading(false);
        return;
      }
      if (!opts?.silent) setLoading(true);
      const { data } = await supabase
        .from("risk_analyses")
        .select("*")
        .eq("id", analysisId)
        .maybeSingle();
      if (!live()) return;
      const row = (data as AnalysisRow | null) ?? null;
      let linked: LinkedSource = null;
      if (row?.uploaded_contract_id) {
        const { data: up } = await supabase
          .from("uploaded_contracts")
          .select("id, title, extracted_text")
          .eq("id", row.uploaded_contract_id)
          .maybeSingle();
        if (!live()) return;
        const u = up as { id: string; title: string | null; extracted_text: string | null } | null;
        linked = u ? { id: u.id, title: u.title ?? "", extracted_text: u.extracted_text ?? "" } : null;
      }
      // Анализ и източник влизат заедно — никога нов анализ върху стар източник.
      setSnapshot({ identity: scope, analysis: row, source: linked });
      setLoading(false);
    },
    [analysisId, user],
  );

  useEffect(() => {
    // Нов обхват: старата снимка изчезва веднага.
    setSnapshot(null);
    setLoading(true);
    void load();
    return () => {
      tokenRef.current++;
    };
  }, [load]);

  // Ревалидация при връщане към прозореца — документът може да е сменен другаде.
  useEffect(() => {
    const onFocus = () => {
      if (document.visibilityState === "hidden") return;
      void load({ silent: true });
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [load]);

  const ready = snapshot?.identity === identity ? snapshot : null;
  const a = ready?.analysis ?? null;
  const source = ready?.source ?? null;

  const { freshness } = useSourceFreshness({
    userId: user?.id ?? null,
    docId: source?.id ?? null,
    savedText: source?.extracted_text ?? null,
    savedTitle: source?.title ?? null,
    verification: a?.verification,
    hasUnsavedChanges: false,
  });

  if (loading || !ready) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!a) {
    return <div className="p-6 text-sm text-muted-foreground">Анализът не е намерен.</div>;
  }

  const issues: Array<Record<string, unknown>> = Array.isArray(a.issues)
    ? (a.issues as Array<Record<string, unknown>>)
    : [];
  const missing: Array<Record<string, unknown> | string> = Array.isArray(a.missing_clauses)
    ? (a.missing_clauses as Array<Record<string, unknown> | string>)
    : [];
  const present = presentAnalysisScore({ score: a.score, verification: a.verification, freshness });
  const actionable = isSnapshotActionable(freshness);
  const historyNotice = historicalFindingsNotice(freshness);
  const str = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5 text-gold" /> Риск анализ
          </div>
          <h1 className="mt-1 font-serif text-2xl font-bold">{a.contract_type || "Договор"}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(a.created_at).toLocaleString("bg-BG")} · модел {a.model}
          </p>
        </div>
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:shrink-0 sm:justify-end">
          <a
            href={`/uploaded/${a.uploaded_contract_id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 rounded-md bg-gold/15 px-3 py-2 text-sm text-gold hover:bg-gold/25"
          >
            <ExternalLink className="h-4 w-4" /> Към документа
          </a>
          <AskDogovaryAIButton
            kind="analysis"
            entityId={a.id}
            displayTitle={a.contract_type || "Риск анализ"}
            disabled={!actionable}
            disabledReason="Този анализ е направен върху друга версия на текста. Направете нов анализ на документа, за да разговаряте по него."
          />

        </div>
      </div>

      <div className={cn("mt-5 flex items-start gap-4 rounded-xl border p-4", present.tone)}>
        <div className="text-4xl font-bold">{present.showScore ? `${present.score}/10` : "—"}</div>
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-wider opacity-80">{present.label}</div>
          {/* Резюмето също е историческо, когато снимката не е актуална. */}
          <p className="mt-0.5 text-sm leading-relaxed">
            {actionable ? a.summary || "—" : a.summary ? `Резюме от предишната проверка: ${a.summary}` : "—"}
          </p>
          {present.notice && (
            <p className="mt-2 text-xs leading-relaxed opacity-90">{present.notice}</p>
          )}
        </div>
      </div>

      {historyNotice && (
        <p className="mt-3 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
          {historyNotice}
        </p>
      )}

      {issues.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">{emptyIssuesMessage(a.verification, freshness)}</p>
      )}

      {issues.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Открити проблеми ({issues.length})
          </h2>
          <ul className="mt-3 space-y-2">
            {issues.map((it, i) => (
              <li key={i} className="rounded-lg border border-border/60 bg-card/40 p-3">
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{str(it.title) || `Проблем ${i + 1}`}</div>
                    {str(it.clause) && (
                      <blockquote className="mt-1 border-l-2 border-border/60 pl-2 text-xs italic text-muted-foreground">
                        „{str(it.clause)}"
                      </blockquote>
                    )}
                    {str(it.explanation) && (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        {str(it.explanation)}
                      </p>
                    )}
                    {str(it.suggestion) && (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                        <span className="font-semibold">Препоръка: </span>
                        {str(it.suggestion)}
                      </p>
                    )}
                    {str(it.severity) && (
                      <span className="mt-2 inline-block rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {str(it.severity)}
                      </span>
                    )}
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {missing.length > 0 && (
        <section className="mt-6">
          <h2 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Липсващи клаузи ({missing.length})
          </h2>
          <ul className="mt-3 space-y-2">
            {missing.map((m, i) => (
              <li key={i} className="flex items-start gap-2 rounded-lg border border-border/60 bg-card/40 p-3">
                <Info className="mt-0.5 h-4 w-4 shrink-0 text-blue-300" />
                <div className="min-w-0">
                  <div className="text-sm">{typeof m === "string" ? m : str(m.name) || `Клауза ${i + 1}`}</div>
                  {typeof m !== "string" && str(m.why) && (
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{str(m.why)}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {actionable ? (
        <NegotiationStrategyPanel analysisId={a.id} initial={a.negotiation_strategy ?? null} />
      ) : (
        <p className="mt-6 rounded-lg border border-border/60 bg-muted/20 p-3 text-xs text-muted-foreground">
          Преговорна стратегия може да се изготви само върху анализ на текущия текст. Направете нов
          анализ на документа.
        </p>
      )}
    </div>
  );
}
