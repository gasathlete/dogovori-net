import { useState } from "react";
import { Handshake, Loader2, Sparkles, Target, ShieldCheck, MessageSquareQuote, ListChecks, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useIsPro } from "@/hooks/useIsPro";
import { ProUpgradeDialog } from "@/components/ProUpgradeDialog";
import { toast } from "sonner";

interface Strategy {
  summary?: string;
  leverage_points?: { title: string; rationale: string }[];
  concessions?: { title: string; rationale: string }[];
  batna?: string;
  talking_points?: string[];
  counter_clauses?: { clause: string; proposal: string; why: string }[];
  next_steps?: string[];
}

export function NegotiationStrategyPanel({
  analysisId,
  initial,
}: {
  analysisId: string;
  initial?: Strategy | null;
}) {
  const { isEntrepreneur } = useIsPro();
  const [strategy, setStrategy] = useState<Strategy | null>(initial ?? null);
  const [loading, setLoading] = useState(false);
  const [paywall, setPaywall] = useState(false);

  const generate = async (force = false) => {
    if (!isEntrepreneur) {
      setPaywall(true);
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke("negotiation-strategy", {
        body: { analysis_id: analysisId, force },
      });
      if (error) {
        const ctx: any = (error as any).context;
        let body: any = null;
        try {
          if (ctx && typeof ctx.json === "function") body = await ctx.json();
        } catch {}
        if (body?.error === "entrepreneur_required") {
          setPaywall(true);
          return;
        }
        throw new Error(error.message);
      }
      if (data?.strategy) setStrategy(data.strategy);
    } catch (e: any) {
      toast.error(e?.message || "Грешка при генериране на стратегията");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mt-6 rounded-xl border border-gold/30 bg-gradient-to-br from-gold/5 to-transparent p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Handshake className="h-5 w-5 text-gold" />
          <h2 className="font-serif text-lg font-bold">Стратегия за преговори</h2>
          <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[10px] uppercase tracking-wider text-gold">
            Предприемач · GPT-5
          </span>
        </div>
        {strategy ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => generate(true)}
            disabled={loading}
            className="border-gold/40 hover:bg-gold/10"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
            Генерирай отново
          </Button>
        ) : (
          <Button
            size="sm"
            onClick={() => generate(false)}
            disabled={loading}
            className="bg-gradient-gold text-navy hover:shadow-gold"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            Изготви стратегия
          </Button>
        )}
      </div>

      {!strategy && !loading && (
        <p className="mt-3 text-sm text-muted-foreground">
          Получавате персонална стратегия с позиции, BATNA, готови реплики и контра-клаузи —
          базирана на анализа на договора.
        </p>
      )}

      {strategy && (
        <div className="mt-5 space-y-5 text-sm">
          {strategy.summary && (
            <p className="rounded-lg border border-border/60 bg-card/40 p-3 leading-relaxed">
              {strategy.summary}
            </p>
          )}

          {strategy.leverage_points?.length ? (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-emerald-400">
                <Target className="h-3.5 w-3.5" /> Силни позиции
              </h3>
              <ul className="space-y-2">
                {strategy.leverage_points.map((p, i) => (
                  <li key={i} className="rounded-lg border border-border/60 bg-card/40 p-3">
                    <div className="font-medium">{p.title}</div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{p.rationale}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {strategy.concessions?.length ? (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-amber-400">
                <ShieldCheck className="h-3.5 w-3.5" /> Възможни отстъпки
              </h3>
              <ul className="space-y-2">
                {strategy.concessions.map((p, i) => (
                  <li key={i} className="rounded-lg border border-border/60 bg-card/40 p-3">
                    <div className="font-medium">{p.title}</div>
                    <p className="mt-0.5 text-xs text-muted-foreground">{p.rationale}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {strategy.batna && (
            <div className="rounded-lg border border-blue-500/30 bg-blue-500/5 p-3">
              <div className="text-[10px] font-semibold uppercase tracking-wider text-blue-300">BATNA</div>
              <p className="mt-1 text-sm leading-relaxed">{strategy.batna}</p>
            </div>
          )}

          {strategy.talking_points?.length ? (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <MessageSquareQuote className="h-3.5 w-3.5" /> Готови реплики
              </h3>
              <ul className="space-y-1.5">
                {strategy.talking_points.map((t, i) => (
                  <li key={i} className="flex gap-2 rounded border border-border/40 bg-card/30 p-2 text-xs leading-relaxed">
                    <span className="text-gold">→</span>
                    <span>{t}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {strategy.counter_clauses?.length ? (
            <div>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Контра-клаузи
              </h3>
              <ul className="space-y-2">
                {strategy.counter_clauses.map((c, i) => (
                  <li key={i} className="rounded-lg border border-border/60 bg-card/40 p-3">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">{c.clause}</div>
                    <p className="mt-1 text-sm font-medium">{c.proposal}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{c.why}</p>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {strategy.next_steps?.length ? (
            <div>
              <h3 className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <ListChecks className="h-3.5 w-3.5" /> Следващи стъпки
              </h3>
              <ol className="ml-4 list-decimal space-y-1 text-sm">
                {strategy.next_steps.map((s, i) => <li key={i}>{s}</li>)}
              </ol>
            </div>
          ) : null}
        </div>
      )}

      <ProUpgradeDialog
        open={paywall}
        onOpenChange={setPaywall}
        trigger="negotiation_strategy"
      />
    </section>
  );
}
