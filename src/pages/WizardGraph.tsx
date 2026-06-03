/**
 * Sprint 1 + 2 pilot page — graph-driven wizard with live preview.
 *
 * Route: /wizard-graph/:slug
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Loader2, AlertCircle } from "lucide-react";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { SplitWizard } from "@/components/wizard/SplitWizard";
import { RiskMeter } from "@/components/wizard/RiskMeter";
import { WizardShell } from "@/components/wizard/WizardShell";
import { getQuestionGraph } from "@/data/questionGraphs/dogovor-za-naem-na-zhilishte";
import type { ClauseDefinition } from "@/lib/clauseEngine";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CATALOG } from "@/data/catalog";
import { slugify } from "@/lib/slugify";
import { ensureAIDisclaimerAccepted } from "@/lib/aiDisclaimerGate";
import { recordConsents } from "@/lib/consents";
import { useAuth } from "@/hooks/useAuth";
import { getOpSessionId, getOpDocKey } from "@/lib/opSession";

export default function WizardGraphPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const graph = slug ? getQuestionGraph(slug) : null;
  const [clauses, setClauses] = useState<ClauseDefinition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ stepIdx: 0, total: 1, progress: 0 });
  const { user } = useAuth();

  const catalogHit = useMemo(() => {
    if (!graph) return null;
    for (const cat of CATALOG) {
      const doc = cat.documents.find((d) => slugify(d.name) === slug);
      if (doc) return { category: cat, doc };
    }
    return null;
  }, [graph, slug]);

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
      if (err) { setError(err.message); return; }
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

  // -------- Blank template download -----------------------------------
  const [downloadingBlank, setDownloadingBlank] = useState(false);
  const [blankStep, setBlankStep] = useState(0);

  const goAuth = () => {
    const ret = `/wizard-graph/${slug}`;
    navigate(`/auth?returnTo=${encodeURIComponent(ret)}`);
  };
  const runBlankDownload = async () => {
    if (!graph) return;
    if (!user) {
      toast.error("Влезте, за да изтеглите бланка", { description: "Прогресът е запазен." });
      goAuth();
      return;
    }
    setDownloadingBlank(true);
    setBlankStep(0);
    const t1 = setTimeout(() => setBlankStep(1), 2000);
    const t2 = setTimeout(() => setBlankStep(2), 4500);
    const clearStepTimers = () => { clearTimeout(t1); clearTimeout(t2); };
    try {
      const docName = catalogHit?.doc.name ?? graph.title;
      const sectorId = catalogHit?.category.sectorId ?? "general";
      const sectorTitle = catalogHit?.category.title ?? graph.title;
      const { data, error: err } = await supabase.functions.invoke("download-blank", {
        body: {
          sector_id: sectorId,
          sector_title: sectorTitle,
          document_name: docName,
          bilingual: false,
          session_id: getOpSessionId(),
          doc_key: getOpDocKey(docName),
        },
      });
      if (err || data?.error) {
        clearStepTimers();
        toast.error("Грешка", { description: (data?.error || err?.message || "Грешка при свалянето").toString() });
        return;
      }
      clearStepTimers();
      setBlankStep(3);
      const url: string = data.url;
      const ext = (data.filename as string | undefined)?.match(/\.[a-z0-9]+$/i)?.[0] ?? ".docx";
      const dateStamp = new Date().toISOString().slice(0, 10);
      const filename = `${slugify(docName) || "blanka"}-${dateStamp}${ext}`;
      const a = document.createElement("a");
      a.href = url; a.download = filename;
      document.body.appendChild(a); a.click(); a.remove();
      toast.success("Бланката е готова");
    } catch (e) {
      clearStepTimers();
      toast.error("Грешка", { description: (e as Error).message });
    } finally {
      setTimeout(() => setDownloadingBlank(false), 600);
    }
  };
  const handleDownloadBlank = async () => {
    try { await ensureAIDisclaimerAccepted(); } catch { return; }
    recordConsents([{ consent_type: "ai_disclaimer", granted: true }]).catch(() => undefined);
    await runBlankDownload();
  };

  // ----- Early returns -------------------------------------------------
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
    navigate(`/wizard-graph/${slug}/review`);
  };

  const sectorTitle = catalogHit?.category.title;
  const docName = catalogHit?.doc.name ?? graph.title;

  return (
    <>
      <Seo title={`${graph.title} — Динамичен уизард | Dogovori.net`} description={graph.title} />
      <WizardShell
        sectorTitle={sectorTitle}
        docName={docName}
        progress={progress}
        blankDownload={{
          onClick: handleDownloadBlank,
          downloading: downloadingBlank,
          step: blankStep,
        }}
      >
        <SplitWizard
          graph={graph}
          clauses={clauses}
          onComplete={handleComplete}
          ctaLabel="Финализирай документа"
          onProgress={setProgress}
          leftHeader={<RiskMeter level="unknown" />}
          onDownloadBlank={handleDownloadBlank}
        />
      </WizardShell>
    </>
  );
}
