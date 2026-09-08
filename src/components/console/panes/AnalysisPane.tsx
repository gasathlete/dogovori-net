import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ShieldAlert, Loader2, ExternalLink, AlertTriangle, Info } from "@/icons";
import { cn } from "@/lib/utils";
import { NegotiationStrategyPanel } from "@/components/NegotiationStrategyPanel";
import { emptyIssuesMessage, presentAnalysisScore } from "@/lib/analysisVerification";


export function AnalysisPane({ analysisId }: { analysisId: string }) {
  const [a, setA] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("risk_analyses")
        .select("*")
        .eq("id", analysisId)
        .maybeSingle();
      setA(data);
      setLoading(false);
    })();
  }, [analysisId]);

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!a) {
    return <div className="p-6 text-sm text-muted-foreground">Анализът не е намерен.</div>;
  }

  const issues: any[] = Array.isArray(a.issues) ? a.issues : [];
  const missing: any[] = Array.isArray(a.missing_clauses) ? a.missing_clauses : [];

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <ShieldAlert className="h-3.5 w-3.5 text-gold" /> Риск анализ
          </div>
          <h1 className="mt-1 font-serif text-2xl font-bold">{a.contract_type || "Договор"}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            {new Date(a.created_at).toLocaleString("bg-BG")} · модел {a.model}
          </p>
        </div>
        <a
          href={`/uploaded/${a.uploaded_contract_id}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2 rounded-md bg-gold/15 px-3 py-2 text-sm text-gold hover:bg-gold/25"
        >
          <ExternalLink className="h-4 w-4" /> Към документа
        </a>
      </div>

      <div className={cn("mt-5 flex items-start gap-4 rounded-xl border p-4", present.tone)}>
        <div className="text-4xl font-bold">{present.showScore ? `${present.score}/10` : "—"}</div>
        <div className="flex-1">
          <div className="text-xs font-semibold uppercase tracking-wider opacity-80">{present.label}</div>
          <p className="mt-0.5 text-sm leading-relaxed">{a.summary || "—"}</p>
          {present.notice && (
            <p className="mt-2 text-xs leading-relaxed opacity-90">{present.notice}</p>
          )}
        </div>
      </div>

      {issues.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">{emptyIssuesMessage(a.verification)}</p>
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
                    <div className="text-sm font-medium">{it.title || it.clause || `Проблем ${i + 1}`}</div>
                    {it.description && (
                      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{it.description}</p>
                    )}
                    {it.severity && (
                      <span className="mt-2 inline-block rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                        {it.severity}
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
                <div className="text-sm">{typeof m === "string" ? m : m.title || m.name}</div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <NegotiationStrategyPanel analysisId={a.id} initial={a.negotiation_strategy ?? null} />
    </div>
  );
}
