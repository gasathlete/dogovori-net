/**
 * WizardReview — finalize screen for graph-driven wizards.
 *
 * Route: /wizard-graph/:slug/review
 *
 * Picks up the assembled draft from `sessionStorage` (saved by WizardGraph's
 * `handleComplete`), invokes the `generate-contract` edge function for AI
 * risk analysis + polished contract, and shows RiskMeter + RiskReport +
 * PDF/DOCX export, mirroring the legacy Wizard finalize UX.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, Bird, FileDown, FileText, Loader2, AlertCircle, Save, Folder, User, CheckCircle2, ChevronDown, FileSignature, Printer } from "lucide-react";
import { toast } from "sonner";

import { Header } from "@/components/Header";
import { Seo } from "@/components/Seo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { RiskMeter, type RiskLevel } from "@/components/wizard/RiskMeter";
import { RiskReport, type RiskIssue } from "@/components/wizard/RiskReport";
import { CorrectionsPanel, type CorrectionsSelection } from "@/components/wizard/CorrectionsPanel";
import { ContractPreview } from "@/components/wizard/ContractPreview";
import { AppendixSuggestions } from "@/components/wizard/AppendixSuggestions";
import { LegalDisclaimer } from "@/components/LegalDisclaimer";
import { MultiPartySigningDialog } from "@/components/MultiPartySigningDialog";
import { ProValueCard } from "@/components/ProValueCard";
import { FreeOpsChip } from "@/components/FreeOpsChip";
import { useProConversionToast } from "@/components/ProConversionToast";

import { getQuestionGraph } from "@/data/questionGraphs/dogovor-za-naem-na-zhilishte";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { downloadDocument } from "@/lib/downloadDocument";

import { getOpSessionId, getOpDocKey, newOpBatchId } from "@/lib/opSession";
import {
  detectAppendixReferences,
  contractToPlainText,
  type AppendixReference,
} from "@/lib/detectAppendixReferences";
import type { GeneratedContract, SignatureInfo } from "@/lib/exporters";


interface AIResult {
  risk: {
    level: RiskLevel;
    score: number;
    summary: string;
    issues: RiskIssue[];
    recommendations: string[];
  };
  contract: GeneratedContract;
}

interface StoredDraft {
  answers: Record<string, unknown>;
  body_md: string;
  at: number;
}

const GEN_STEPS = [
  "Проверяваме въведената информация…",
  "Подбираме приложимите правни клаузи…",
  "Комплектоваме структурата на договора…",
  "Съставяме текста и форматираме раздели…",
  "Извършваме оценка на риска…",
  "Финализираме документа — почти готово…",
];

export default function WizardReviewPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();

  const graph = slug ? getQuestionGraph(slug) : null;

  const draft = useMemo<StoredDraft | null>(() => {
    if (!slug) return null;
    try {
      const raw = sessionStorage.getItem(`wizard-graph:last:${slug}`);
      return raw ? (JSON.parse(raw) as StoredDraft) : null;
    } catch {
      return null;
    }
  }, [slug]);

  const [generating, setGenerating] = useState(false);
  const [genStepIdx, setGenStepIdx] = useState(0);
  const [result, setResult] = useState<AIResult | null>(null);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const showProToast = useProConversionToast();
  const [customTitle, setCustomTitle] = useState("");
  const [applyingCorrections, setApplyingCorrections] = useState(false);
  const [appliedNotes, setAppliedNotes] = useState<string[] | undefined>(undefined);
  const [isPro, setIsPro] = useState(false);
  const [freeWaveAvailable, setFreeWaveAvailable] = useState(false);
  const [signingFreeAvailable, setSigningFreeAvailable] = useState(false);
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const [savedDocId, setSavedDocId] = useState<string | undefined>(undefined);
  const [contactId, setContactId] = useState<string>("");
  const [folderId, setFolderId] = useState<string>("");
  const [contacts, setContacts] = useState<Array<{ id: string; name: string }>>([]);
  const [folders, setFolders] = useState<Array<{ id: string; name: string; is_favorites: boolean }>>([]);
  const [saving, setSaving] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);


  const reviewHref = `/wizard-graph/${slug}/review`;
  const goAuth = () => navigate(`/auth?redirect=${encodeURIComponent(reviewHref)}`);
  const goSubscription = () =>
    navigate(`/account?tab=subscription&redirect=${encodeURIComponent(reviewHref)}`);

  // Detect Pro status when authenticated.
  const refreshQuota = () => {
    if (!user) {
      setIsPro(false);
      setFreeWaveAvailable(false);
      setSigningFreeAvailable(false);
      return;
    }
    supabase
      .from("download_quota")
      .select("plan, pro_until, corrections_free_used, free_signing_used")
      .eq("user_id", user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setIsPro(
          data.plan === "pro" ||
            (!!data.pro_until && new Date(data.pro_until) > new Date()),
        );
        setFreeWaveAvailable(!(data as any).corrections_free_used);
        setSigningFreeAvailable(!(data as any).free_signing_used);
      });
  };
  useEffect(() => {
    refreshQuota();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Load user's contacts and folders for the finalize selectors.
  useEffect(() => {
    if (!user) {
      setContacts([]);
      setFolders([]);
      return;
    }
    Promise.all([
      supabase.from("contacts").select("id, name").is("deleted_at", null).order("name", { ascending: true }),
      supabase.from("folders").select("id, name, is_favorites").order("is_favorites", { ascending: false }).order("name", { ascending: true }),
    ]).then(([c, f]) => {
      setContacts((c.data ?? []) as Array<{ id: string; name: string }>);
      setFolders((f.data ?? []) as Array<{ id: string; name: string; is_favorites: boolean }>);
    });
  }, [user]);

  // Seed custom title once result is in.
  useEffect(() => {
    if (result && !customTitle) setCustomTitle(result.contract.title);
  }, [result, customTitle]);

  // Auto-save the generated document to the user's profile (status: draft) so
  // their progress is never lost. Fires once when the analysis completes, and
  // re-fires on contract edits / applied corrections to update the snapshot.
  useEffect(() => {
    if (!result || !user) return;
    let cancelled = false;
    (async () => {
      try {
        const finalTitle = (customTitle || result.contract.title).trim() || result.contract.title;
        if (!savedDocId) {
          const { data, error } = await supabase
            .from("saved_documents")
            .insert({
              user_id: user.id,
              kind: "contract",
              title: finalTitle,
              payload: { ...result.contract, title: finalTitle } as never,
              source_id: slug ?? null,
            })
            .select("id")
            .single();
          if (error) throw error;
          if (!cancelled) {
            setSavedDocId(data.id);
            setAutoSaved(true);
          }
        } else {
          const { error } = await supabase
            .from("saved_documents")
            .update({
              title: finalTitle,
              payload: { ...result.contract, title: finalTitle } as never,
            })
            .eq("id", savedDocId);
          if (error) throw error;
          if (!cancelled) setAutoSaved(true);
        }
      } catch (e) {
        console.error("auto-save saved_documents:", e);
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, user]);

  // Generate a new wizard session for a referenced appendix and route there.
  const handleCreateAppendix = (ref: AppendixReference) => {
    const title = ref.label;
    try {
      sessionStorage.setItem(
        `appendix:prefill:${slug}`,
        JSON.stringify({ kind: ref.kind, number: ref.number, label: title, parent_slug: slug }),
      );
    } catch { /* noop */ }
    toast.success(`Стартираме ${title}`, {
      description: "Изберете шаблон, който отговаря на приложението.",
    });
    navigate(`/catalog?appendix=${encodeURIComponent(title)}&parent=${encodeURIComponent(slug ?? "")}`);
  };


  const handleSaveToProfile = async () => {
    if (!result) return;
    if (!user) { goAuth(); return; }
    if (savedDocId) {
      // Update existing save with selected folder/contact.
      setSaving(true);
      try {
        const { error } = await supabase
          .from("saved_documents")
          .update({
            folder_id: folderId || null,
            contact_id: contactId || null,
          })
          .eq("id", savedDocId);
        if (error) throw error;
        toast.success("Обновено в профила");
      } catch (e: unknown) {
        toast.error("Грешка", { description: e instanceof Error ? e.message : String(e) });
      } finally {
        setSaving(false);
      }
      return;
    }
    setSaving(true);
    try {
      const finalTitle = (customTitle || result.contract.title).trim() || result.contract.title;
      const { data, error } = await supabase
        .from("saved_documents")
        .insert({
          user_id: user.id,
          kind: "contract",
          title: finalTitle,
          payload: { ...result.contract, title: finalTitle } as never,
          source_id: slug ?? null,
          folder_id: folderId || null,
          contact_id: contactId || null,
        })
        .select("id")
        .single();
      if (error) throw error;
      setSavedDocId(data.id);
      toast.success("Запазено в профила", { description: "Документи → Всички" });
    } catch (e: unknown) {
      toast.error("Грешка при запазване", { description: e instanceof Error ? e.message : String(e) });
    } finally {
      setSaving(false);
    }
  };


  const runAnalysis = async () => {
    if (!graph || !draft) return;
    if (!user) {
      toast.info("Влезте, за да финализирате договора", {
        description: "Прогресът е запазен.",
      });
      goAuth();
      return;
    }
    setGenerating(true);
    setGenStepIdx(0);
    const interval = setInterval(() => {
      setGenStepIdx((i) => (i + 1) % GEN_STEPS.length);
    }, 5000);
    try {
      const questions = graph.questions.map((q) => ({ id: q.id, label: q.label }));
      // Stringify non-string answers so the edge function receives a flat
      // Record<string, string> as it expects.
      const flatAnswers: Record<string, string> = {};
      for (const [k, v] of Object.entries(draft.answers ?? {})) {
        if (v == null) continue;
        flatAnswers[k] = typeof v === "string" ? v : JSON.stringify(v);
      }
      const { data, error } = await supabase.functions.invoke("generate-contract", {
        body: {
          sector: graph.title,
          contractName: graph.title,
          documentName: graph.title,
          parties: [],
          answers: flatAnswers,
          questions,
          arbitration: { enabled: false },
          bilingual: false,
          // Pass the locally assembled body so the model can refine instead
          // of starting from scratch.
          draft_body_md: draft.body_md,
          // Session-aware quota: same (session_id, doc_key) in tab = free.
          session_id: getOpSessionId(),
          doc_key: getOpDocKey(slug),
        },
      });
      if (error) throw error;
      if (!data || data.error) {
        if (data?.requires_login) {
          toast.error(data.error);
          setTimeout(() => goAuth(), 1200);
          return;
        }
        if (data?.code === "quota_exceeded") {
          toast.error("Изчерпан безплатен лимит", {
            description: "Активирайте Pro или закупете пакет операции.",
            action: { label: "Виж опции", onClick: () => goSubscription() },
          });
          return;
        }
        throw new Error(data?.error || "Неуспешно създаване");
      }

      setResult(data as AIResult);
      toast.success("Договорът е готов", {
        description: "Прегледайте анализа и експортирайте.",
      });
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes("429"))
        toast.error("Достигнат е лимитът. Опитайте след малко.");
      else if (msg.includes("402"))
        toast.error("Изчерпан лимит на системата. Опитайте по-късно.");
      else toast.error("Възникна грешка", { description: msg });
    } finally {
      clearInterval(interval);
      setGenerating(false);
    }
  };

  // Auto-run analysis once on mount when prerequisites are met.
  useEffect(() => {
    if (authLoading) return;
    if (!graph || !draft) return;
    if (result || generating) return;
    if (!user) return; // wait for explicit click → triggers auth gate
    runAnalysis();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [authLoading, graph, draft, user]);

  const handleExport = async (format: "pdf" | "docx") => {
    if (!result) return;
    if (!user) {
      toast.error("Влезте в профила си");
      goAuth();
      return;
    }
    setExporting(format);
    try {
      // Build a polished signature block from graph `party_list` answers.
      const TYPE_FULL: Record<string, string> = {
        "ЮЛ": "Юридическо лице",
        "ФЛ": "Физическо лице",
        "ЕТ": "ЕТ / Самоосигуряващо",
      };
      const partyQs = (graph?.questions ?? []).filter(
        (q) => (q as any).field_type === "party_list",
      );
      const signatureParties = partyQs.flatMap((q) => {
        const raw = (draft?.answers?.[q.id] as string) ?? "";
        if (!raw.trim()) return [];
        return raw
          .split(/\r?\n/)
          .map((line) => line.trim())
          .filter(Boolean)
          .map((line) => {
            const m = line.match(/^(.*?)\s+[—\-|]\s+(ФЛ|ЮЛ|ЕТ)\s*$/);
            const rawName = m ? m[1].trim() : line;
            const code = m ? m[2] : "ЮЛ";
            const name = rawName === "(име не е посочено)" ? "" : rawName;
            return { role: q.label || "СТРАНА", name, type: TYPE_FULL[code] || code };
          });
      });

      const sig: SignatureInfo = {
        name_a: signatureParties[0]?.name ?? "",
        name_b: signatureParties[1]?.name ?? "",
        city: "",
        date: "",
        parties: signatureParties.length > 0 ? signatureParties : undefined,
      };
      const finalTitle =
        (customTitle || result.contract.title).trim() || result.contract.title;
      const contractWithSig: GeneratedContract = {
        ...result.contract,
        title: finalTitle,
        signature: sig,
      };
      const res = await downloadDocument({
        kind: "contract",
        format,
        title: finalTitle,
        payload: contractWithSig,
        source_id: slug,
        saved_document_id: savedDocId,
        folder_id: folderId || undefined,
        contact_id: contactId || undefined,
        doc_key: slug,
      });
      if (!res.ok) {
        if (res.error === "quota_exceeded") {
          toast.error("Изчерпан безплатен лимит", {
            description:
              "Купете единичен договор за 2.90€ или преминете към Pro — прогресът е запазен.",
            action: { label: "Виж опции", onClick: () => goSubscription() },
          });
        } else if (res.error === "auth_required") {
          goAuth();
        } else {
          toast.error("Грешка при експорт", { description: res.error });
        }
        return;
      }
      if (res.saved_document_id) setSavedDocId(res.saved_document_id);
      toast.success(format === "pdf" ? "PDF изтеглен" : "DOCX изтеглен", {
        description: res.free
          ? "Повторно сваляне (безплатно)"
          : "Запазен в Документи → Всички",
      });
      if (!res.free) showProToast("download");
    } catch (e: unknown) {
      toast.error("Грешка при експорт", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setExporting(null);
    }
  };

  const handleApplyCorrections = async (sel: CorrectionsSelection) => {
    if (!result) return;
    if (!user) {
      goAuth();
      return;
    }
    if (sel.issues.length === 0 && sel.recommendations.length === 0) {
      toast.message("Изберете поне една препоръка за корекция");
      return;
    }
    setApplyingCorrections(true);
    try {
      const { data, error } = await supabase.functions.invoke("apply-corrections", {

        body: {
          contract: result.contract,
          risk: result.risk,
          selectedIssues: sel.issues,
          selectedRecommendations: sel.recommendations,
          answers: draft?.answers ?? {},
          session_id: getOpSessionId(),
          batch_id: newOpBatchId(),
        },
      });
      if (error || data?.error) {
        if (data?.error === "pro_required") {
          toast.error("Нужен е Pro план", {
            action: { label: "Pro", onClick: () => goSubscription() },
          });
          return;
        }
        throw new Error(data?.error || error?.message || "Грешка");
      }
      setResult({
        risk: data.risk ?? result.risk,
        contract: data.contract ?? result.contract,
      });
      setAppliedNotes(
        Array.isArray(data.applied) ? data.applied : ["Корекциите са приложени"],
      );
      setSavedDocId(undefined);
      toast.success("Корекциите са приложени");
      showProToast("corrections_applied");
    } catch (e: unknown) {
      toast.error("Грешка при корекция", {
        description: e instanceof Error ? e.message : String(e),
      });
    } finally {
      setApplyingCorrections(false);
    }
  };

  // ----- guard rails ---------------------------------------------------
  if (!graph) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Шаблонът не е намерен</h1>
          <Button onClick={() => navigate("/catalog")}>Към каталога</Button>
        </main>
      </div>
    );
  }

  if (!draft) {
    return (
      <div className="min-h-screen bg-background">
        <Header />
        <main className="container mx-auto flex max-w-xl flex-col items-center gap-4 px-4 py-16 text-center">
          <AlertCircle className="h-10 w-10 text-muted-foreground" />
          <h1 className="text-xl font-semibold">Няма чернова за финализиране</h1>
          <p className="text-sm text-muted-foreground">
            Първо попълнете въпросника и натиснете „Финализирай документа“.
          </p>
          <Button onClick={() => navigate(`/wizard-graph/${slug}`)}>
            Към въпросника
          </Button>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Seo
        title={`${graph.title} — Финализиране | Dogovori.net`}
        description={graph.title}
      />
      <Header />

      <div className="sticky top-16 z-30 border-b border-border/60 bg-navy/90 backdrop-blur-xl">
        <div className="container py-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <button
              onClick={() => navigate(`/wizard-graph/${slug}`)}
              className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-gold"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              Назад към въпросника
            </button>
            <div className="flex items-center gap-3">
              <FreeOpsChip />
              <span className="hidden font-serif italic text-gold sm:inline">{graph.title}</span>
            </div>
          </div>
        </div>
      </div>

      <main className="container py-6 md:py-8">
        <div className="mx-auto max-w-7xl">
          {!result ? (
            <div className="mx-auto max-w-3xl space-y-5">
              <RiskMeter
                level={result?.risk.level ?? "unknown"}
                score={result?.risk.score}
                summary={result?.risk.summary}
              />
              <div className="rounded-xl border border-border/60 bg-gradient-card p-6 shadow-soft">
                {generating ? (
                  <div className="rounded-lg border border-gold/30 bg-gold/5 p-4">
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-gold" />
                      <div className="flex-1 min-w-0">
                        <div key={genStepIdx} className="text-sm font-medium text-foreground animate-fade-in">
                          {GEN_STEPS[genStepIdx]}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Процесът отнема около 60 секунди — благодарим за търпението.
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col items-center gap-4 text-center">
                    <h2 className="font-serif text-lg font-semibold">Готови за анализ и финално изготвяне</h2>
                    <p className="text-sm text-muted-foreground">
                      Ще приложим AI правен анализ и ще съставим окончателния договор. Можете да го изтеглите като PDF или DOCX.
                    </p>
                    <Button onClick={runAnalysis} size="lg" className="bg-gradient-gold text-navy shadow-gold">
                      <Bird className="mr-2 h-4 w-4" />
                      Анализирай и създай
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ) : (() => {
            const appendices = detectAppendixReferences(
              [contractToPlainText(result.contract), draft.body_md].filter(Boolean).join("\n\n"),
            );
            const hasCashPayment = Object.values(draft.answers ?? {}).some(
              (v) => typeof v === "string" && /\bбро[йя]\b|\bкеш\b|\bcash\b/i.test(v),
            );
            return (
              <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)] lg:gap-8 animate-fade-in">
                {/* LEFT — actions & suggestions */}
                <div className="space-y-4 min-w-0">
                  <RiskMeter
                    level={result.risk.level}
                    score={result.risk.score}
                    summary={result.risk.summary}
                  />

                  <div className="rounded-xl border border-success/40 bg-success/5 p-4 shadow-soft">
                    <div className="flex items-start gap-3">
                      <CheckCircle2 className="mt-0.5 h-5 w-5 flex-shrink-0 text-success" />
                      <div className="min-w-0 flex-1">
                        <h2 className="font-serif text-base font-bold leading-tight">Документът е готов</h2>
                        <p className="mt-0.5 text-xs text-muted-foreground">
                          {autoSaved ? (
                            <span className="inline-flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3 text-success" />
                              Записан в профила · Документи → Всички
                            </span>
                          ) : (
                            "Записва се автоматично в профила ви…"
                          )}
                        </p>
                      </div>
                    </div>
                  </div>

                  <ProValueCard source="corrections" />

                  <AppendixSuggestions appendices={appendices} onCreate={handleCreateAppendix} />

                  <CorrectionsPanel
                    isPro={isPro}
                    freeWaveAvailable={freeWaveAvailable}
                    issues={result.risk.issues || []}
                    recommendations={result.risk.recommendations || []}
                    loading={applyingCorrections}
                    applied={appliedNotes}
                    onApply={handleApplyCorrections}
                    onUpgrade={() => navigate("/account?tab=subscription")}
                  />

                  <Collapsible defaultOpen={false}>
                    <div className="rounded-xl border border-border/60 bg-gradient-card shadow-soft">
                      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 p-4">
                        <div className="text-left">
                          <div className="font-serif text-base font-bold">Подробен риск анализ</div>
                          <div className="text-xs text-muted-foreground">
                            {(result.risk.issues?.length ?? 0)} слаби места · {(result.risk.recommendations?.length ?? 0)} препоръки
                          </div>
                        </div>
                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-t border-border/40 p-4">
                          <RiskReport
                            level={result.risk.level}
                            issues={result.risk.issues || []}
                            recommendations={result.risk.recommendations || []}
                            isPro={isPro}
                          />
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>

                  {hasCashPayment && (
                    <LegalDisclaimer variant="warning">
                      <strong>Плащане в брой:</strong> Съгласно чл. 3 ЗОПБ плащания на стойност <strong>равна или над 5 000 €</strong> се извършват само по платежна сметка.
                    </LegalDisclaimer>
                  )}

                  <Collapsible defaultOpen>
                    <div className="rounded-xl border border-gold/30 bg-gradient-card shadow-soft">
                      <CollapsibleTrigger className="flex w-full items-center justify-between gap-2 p-4">
                        <div className="text-left">
                          <div className="font-serif text-base font-bold">Финализиране и експорт</div>
                          <div className="text-xs text-muted-foreground">Изтегли като PDF или DOCX</div>
                        </div>
                        <ChevronDown className="h-4 w-4 text-muted-foreground transition-transform data-[state=open]:rotate-180" />
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="border-t border-border/40 p-4">
                          <div className="mb-4 space-y-1.5">
                            <Label htmlFor="doc-title" className="text-xs uppercase tracking-wider text-muted-foreground">
                              Име на договора
                            </Label>
                            <Input
                              id="doc-title"
                              value={customTitle}
                              onChange={(e) => setCustomTitle(e.target.value)}
                              placeholder={result.contract.title}
                              className="bg-card/60"
                            />
                          </div>

                          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                            <div className="space-y-1.5">
                              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                                <span className="inline-flex items-center gap-1"><Folder className="h-3 w-3" /> Папка</span>
                              </Label>
                              <Select value={folderId || "none"} onValueChange={(v) => setFolderId(v === "none" ? "" : v)}>
                                <SelectTrigger className="bg-card/60">
                                  <SelectValue placeholder="— Без папка —" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">— Без папка —</SelectItem>
                                  {folders.map((f) => (
                                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                            <div className="space-y-1.5">
                              <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                                <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> Контрагент</span>
                              </Label>
                              <Select value={contactId || "none"} onValueChange={(v) => setContactId(v === "none" ? "" : v)}>
                                <SelectTrigger className="bg-card/60">
                                  <SelectValue placeholder="— Без контрагент —" />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="none">— Без контрагент —</SelectItem>
                                  {contacts.map((c) => (
                                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </div>
                          </div>

                          <div className="flex flex-col gap-2 sm:flex-row">
                            <Button onClick={() => handleExport("pdf")} disabled={!!exporting} className="flex-1 bg-gradient-gold text-navy hover:shadow-gold">
                              {exporting === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                              Свали PDF
                            </Button>
                            <Button onClick={() => handleExport("docx")} disabled={!!exporting} variant="outline" className="flex-1 border-gold/40 hover:bg-gold/10 hover:text-gold">
                              {exporting === "docx" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                              Свали DOCX
                            </Button>
                          </div>

                          <Button onClick={handleSaveToProfile} disabled={saving} variant="outline" className="mt-2 w-full border-gold/40 hover:bg-gold/10 hover:text-gold">
                            {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                            {savedDocId ? "Обнови запазеното" : "Запиши в профила"}
                          </Button>

                          <Button
                            variant="ghost"
                            onClick={() => {
                              try {
                                sessionStorage.removeItem(`wizard-graph:last:${slug}`);
                                localStorage.removeItem(`splitwizard:${graph.template_slug}`);
                              } catch { /* noop */ }
                              navigate(`/wizard-graph/${slug}`);
                            }}
                            className="mt-3 w-full text-xs text-muted-foreground hover:text-gold"
                          >
                            Започни нов договор
                          </Button>
                        </div>
                      </CollapsibleContent>
                    </div>
                  </Collapsible>

                  <LegalDisclaimer>
                    Документът е изготвен с помощта на AI. За съществени правни въпроси препоръчваме консултация с адвокат.
                  </LegalDisclaimer>
                </div>

                {/* RIGHT — contract preview (sticky on desktop) */}
                <div className="min-w-0">
                  <div className="lg:sticky lg:top-32">
                    <div className="rounded-xl border border-border/60 bg-gradient-card shadow-soft">
                      <div className="hidden border-b border-border/40 p-4 lg:block">
                        <div className="font-serif text-base font-bold">Преглед на документа</div>
                        <div className="text-xs text-muted-foreground">Изготвеният договор се актуализира в реално време</div>
                      </div>
                      <ContractPreview
                        contract={result.contract}
                        onChange={(next) => {
                          setResult({ ...result, contract: next });
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            );
          })()}
        </div>
      </main>
    </div>
  );
}

