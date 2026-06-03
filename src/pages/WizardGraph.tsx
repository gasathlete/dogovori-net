/**
 * Sprint 1 + 2 pilot page — graph-driven wizard with live preview.
 *
 * Route: /wizard-graph/:slug
 *
 * Loads:
 *   - The in-memory QuestionGraph by slug (src/data/questionGraphs).
 *   - The matching clauses from the `template_clauses` table.
 *
 * Renders the SplitWizard. On completion, persists the assembled markdown to
 * sessionStorage under `wizard-graph:last:<slug>` for the export pipeline to
 * pick up (export integration lands in a later sprint).
 */

import { useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, AlertCircle } from "lucide-react";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { SplitWizard } from "@/components/wizard/SplitWizard";
import { getQuestionGraph } from "@/data/questionGraphs/dogovor-za-naem-na-zhilishte";
import type { ClauseDefinition } from "@/lib/clauseEngine";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export default function WizardGraphPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const graph = slug ? getQuestionGraph(slug) : null;
  const [clauses, setClauses] = useState<ClauseDefinition[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!slug) return;
    let cancelled = false;
    (async () => {
      const { data, error: err } = await supabase
        .from("template_clauses")
        .select("clause_id, template_slug, title, body_md, include_when, order, severity")
        .eq("template_slug", slug)
        .eq("active", true)
        .order("order");

      if (cancelled) return;
      if (err) {
        setError(err.message);
        return;
      }
      setClauses(
        (data ?? []).map((r) => ({
          clause_id: r.clause_id,
          template_slug: r.template_slug,
          title: r.title,
          body_md: r.body_md,
          include_when: r.include_when ?? null,
          order: r.order ?? 0,
          severity: (r.severity as ClauseDefinition["severity"]) ?? undefined,
        })),
      );

    })();
    return () => { cancelled = true; };
  }, [slug]);

  if (!graph) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Шаблонът все още не е мигриран</h1>
          <p className="text-sm text-muted-foreground">
            Този документ още няма динамично дърво от въпроси. Опитайте от каталога.
          </p>
          <Button onClick={() => navigate("/catalog")}>Към каталога</Button>
        </main>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto max-w-xl px-4 py-16 text-center">
          <p className="text-sm text-destructive">Грешка при зареждане на клаузите: {error}</p>
        </main>
      </div>
    );
  }

  if (clauses === null) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="flex items-center justify-center py-32">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </main>
      </div>
    );
  }

  const handleComplete = ({ answers, body_md }: { answers: Record<string, unknown>; body_md: string }) => {
    try {
      sessionStorage.setItem(
        `wizard-graph:last:${slug}`,
        JSON.stringify({ answers, body_md, at: Date.now() }),
      );
    } catch { /* noop */ }
    toast.success("Документът е готов. Преминавате към преглед и експорт.");
  };

  return (
    <div className="min-h-screen bg-background">
      <Seo title={`${graph.title} — Динамичен уизард | Dogovori.net`} description={graph.title} />
      <Header />
      <main className="container py-6 md:py-8">
        <SplitWizard
          graph={graph}
          clauses={clauses}
          onComplete={handleComplete}
          ctaLabel="Финализирай документа"
        />
      </main>
    </div>
  );
}
