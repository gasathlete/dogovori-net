/**
 * Sprint 1 + 2 pilot page — graph-driven wizard with live preview.
 *
 * Route: /wizard-graph/:slug
 *
 * Renders the legacy /wizard chrome (sticky breadcrumb + progress, blank
 * download bar, RiskMeter) around the new graph-driven SplitWizard, so the
 * two flows feel identical to the user.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import {
  Loader2, AlertCircle, ArrowLeft, Download, Check, ShieldCheck,
  Search, FileSearch,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { SplitWizard } from "@/components/wizard/SplitWizard";
import { RiskMeter } from "@/components/wizard/RiskMeter";
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
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const graph = slug ? getQuestionGraph(slug) : null;
  const [clauses, setClauses] = useState<ClauseDefinition[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ stepIdx: 0, total: 1, progress: 0 });
  const { user } = useAuth();

  // Locate the catalog category that owns this document (for breadcrumb +
  // blank-template download metadata). Match by slugified document name.
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

  // -------- Blank template download (mirrors legacy Wizard.tsx) ----------
  const [downloadingBlank, setDownloadingBlank] = useState(false);
  const [blankStep, setBlankStep] = useState(0);
  const todayLabel = new Date().toLocaleDateString("bg-BG", {
    day: "2-digit", month: "2-digit", year: "numeric",
  });
  const blankSteps = [
    { icon: ShieldCheck, label: "Проверка на сигурността на IP адреса…" },
    { icon: Search, label: "Подготовка на правната бланка…" },
    { icon: FileSearch, label: `Проверка за липсващи клаузи и реквизити към дата ${todayLabel}…` },
    { icon: Download, label: "Бланката ще бъде свалена до 10 секунди…" },
  ];
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

  // ----- Early returns --------------------------------------------------
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

  const sectorTitle = catalogHit?.category.title;
  const docName = catalogHit?.doc.name ?? graph.title;

  return (
    <div className="min-h-screen">
      <Seo title={`${graph.title} — Динамичен уизард | Dogovori.net`} description={graph.title} />
      <Header />

      {/* Blank-download progress modal */}
      {downloadingBlank && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-background/80 backdrop-blur-sm">
          <div className="mx-4 w-full max-w-md rounded-2xl border border-gold/30 bg-card p-6 shadow-2xl">
            <div className="mb-4 flex items-center gap-3">
              <Loader2 className="h-5 w-5 animate-spin text-gold" />
              <h3 className="font-serif text-lg text-foreground">Подготвяме бланката…</h3>
            </div>
            <ul className="space-y-2.5">
              {blankSteps.map((s, i) => {
                const Icon = s.icon;
                const active = i === blankStep;
                const done = i < blankStep;
                return (
                  <li
                    key={i}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all ${
                      active ? "bg-gold/10 text-foreground"
                      : done ? "text-muted-foreground"
                      : "text-muted-foreground/60"
                    }`}
                  >
                    {done ? <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                      : active ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gold" />
                      : <Icon className="h-4 w-4 shrink-0" />}
                    <span>{s.label}</span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-4 text-center text-xs text-muted-foreground">
              Свалянето ще започне автоматично.
            </p>
          </div>
        </div>
      )}

      {/* Sticky breadcrumb + progress strip */}
      <div className="sticky top-16 z-30 border-b border-border/60 bg-navy/90 backdrop-blur-xl">
        <div className="container py-3">
          <div className="mb-2 flex items-center justify-between text-xs">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/")}
                className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-gold"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Сектори
              </button>
              {sectorTitle && (
                <>
                  <span className="text-muted-foreground">/</span>
                  <span className="font-medium text-foreground">{sectorTitle}</span>
                </>
              )}
              <span className="hidden text-muted-foreground sm:inline">·</span>
              <span className="hidden font-serif italic text-gold sm:inline">{docName}</span>
            </div>
            <div className="text-muted-foreground">
              Стъпка {progress.stepIdx + 1} от {Math.max(progress.total, 1)}
            </div>
          </div>
          <Progress value={progress.progress} className="h-1.5 bg-secondary" />
        </div>
      </div>

      {/* Blank-template download bar */}
      <div className="border-b border-border/40 bg-card/30">
        <div className="container flex flex-wrap items-center justify-between gap-3 py-3">
          <div className="text-xs text-muted-foreground">
            Нужна Ви е само празна бланка за разпечатване?
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownloadBlank}
            disabled={downloadingBlank}
            className="border-gold/40 text-gold hover:bg-gold/10 hover:text-gold"
          >
            {downloadingBlank ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-1.5 h-4 w-4" />
            )}
            Изтегли празна бланка (.docx)
          </Button>
        </div>
      </div>

      <main className="container py-6 md:py-8">
        <SplitWizard
          graph={graph}
          clauses={clauses}
          onComplete={handleComplete}
          ctaLabel="Финализирай документа"
          onProgress={setProgress}
          leftHeader={<RiskMeter level="unknown" />}
        />
      </main>
    </div>
  );
}
