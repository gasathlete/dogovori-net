import { useMemo, useState, useRef, useEffect } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader2, Bird, FileDown, FileText, Save, User, Download, ShieldCheck, Search, FileSearch, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { getSector, getSubWizard, buildQuestions, flattenQuestions, type Question } from "@/data/sectors";
import { CATALOG } from "@/data/catalog";
import { QuestionField } from "@/components/wizard/QuestionField";
import { LiveDraft } from "@/components/wizard/LiveDraft";
import { RiskMeter, type RiskLevel } from "@/components/wizard/RiskMeter";
import { RiskReport, type RiskIssue } from "@/components/wizard/RiskReport";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { type GeneratedContract, type SignatureInfo } from "@/lib/exporters";
import { downloadDocument } from "@/lib/downloadDocument";
import { slugify } from "@/lib/slugify";
import { SignatureBlock, type SignatureData } from "@/components/wizard/SignatureBlock";
import { ArbitrationSelector, type ArbitrationValue } from "@/components/wizard/ArbitrationSelector";
import { FollowupSuggestions } from "@/components/wizard/FollowupSuggestions";
import { LegalDisclaimer } from "@/components/LegalDisclaimer";
import { getCourtById } from "@/data/arbitrationCourts";
import { CorrectionsPanel, type CorrectionsSelection } from "@/components/wizard/CorrectionsPanel";
import { ensureAIDisclaimerAccepted } from "@/lib/aiDisclaimerGate";
import { recordConsents } from "@/lib/consents";

import { useAuth } from "@/hooks/useAuth";
import { trackEvent } from "@/lib/analytics";

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

export default function WizardPage() {
  const { sectorId } = useParams();
  const [searchParams] = useSearchParams();
  const docName = searchParams.get("doc") || undefined;
  const returnTo = searchParams.get("returnTo") || "/catalog";
  const bilingualMode = searchParams.get("bilingual") === "1";
  const navigate = useNavigate();
  const baseSector = sectorId ? getSector(sectorId) : undefined;
  const subWizard = getSubWizard(baseSector, docName);

  // Bilingual documents are normally generated through the dedicated bilingual
  // entry point, which redirects here with `?bilingual=1`. Only bounce to the
  // bilingual wizard when the URL is *not* already flagged as bilingual.
  useEffect(() => {
    if (!sectorId || !docName || bilingualMode) return;
    const isBilingual = CATALOG.some(
      (cat) => cat.sectorId === sectorId && cat.documents.some((d) => d.name === docName && d.bilingual),
    );
    if (isBilingual) {
      navigate(`/wizard-bilingual/${sectorId}?doc=${encodeURIComponent(docName)}`, { replace: true });
    }
  }, [sectorId, docName, navigate, bilingualMode]);


  const sector = useMemo(() => {
    if (!baseSector) return undefined;
    return {
      ...baseSector,
      contractName: subWizard?.contractName || baseSector.contractName,
      parties: subWizard?.parties || baseSector.parties,
      questions: buildQuestions(baseSector, subWizard),
    };
  }, [baseSector, subWizard]);

  const storageKey = useMemo(
    () => (baseSector ? `wizard:${baseSector.id}:${docName ?? "_"}` : null),
    [baseSector, docName]
  );

  // Restore persisted state (answers, step, result, signature, etc.).
  // Use localStorage so progress survives tab close; cleared on completion.
  const persisted = useMemo(() => {
    if (!storageKey) return null;
    try {
      const raw = localStorage.getItem(storageKey) ?? sessionStorage.getItem(storageKey);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, [storageKey]);

  const { user: authUser, loading: authLoading } = useAuth();
  const [answers, setAnswers] = useState<Record<string, string>>(persisted?.answers ?? {});
  const [stepIdx, setStepIdx] = useState<number>(persisted?.stepIdx ?? 0);
  const [generating, setGenerating] = useState(false);
  const [genStepIdx, setGenStepIdx] = useState(0);
  const [result, setResult] = useState<AIResult | null>(persisted?.result ?? null);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const [applyingCorrections, setApplyingCorrections] = useState(false);
  const [appliedNotes, setAppliedNotes] = useState<string[] | undefined>(persisted?.appliedNotes);

  // Filter top-level questions based on conditional logic. За групите — филтрираме самата група
  // ако всички ѝ полета се скрият; вътрешното филтриране на полета става в QuestionField.
  const visibleQuestions = useMemo<Question[]>(() => {
    if (!sector) return [];
    return sector.questions.filter((q) => {
      if (q.showIf && !q.showIf(answers)) return false;
      if (q.type === "group" && q.fields) {
        return q.fields.some((f) => !f.showIf || f.showIf(answers));
      }
      return true;
    });
  }, [sector, answers]);

  if (!sector) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <p className="text-muted-foreground">Невалиден сектор.</p>
          <Button onClick={() => navigate("/")} className="mt-4">
            Към началото
          </Button>
        </div>
      </div>
    );
  }

  const isAnswered = (q: Question): boolean => {
    if (q.type === "group" && q.fields) {
      return q.fields.every((f) => {
        if (f.showIf && !f.showIf(answers)) return true;
        if (!f.required) return true;
        return !!answers[f.id]?.trim();
      });
    }
    return !!answers[q.id]?.trim();
  };

  const total = visibleQuestions.length;
  const safeIdx = Math.min(stepIdx, total - 1);
  const current = visibleQuestions[safeIdx];
  const progress = result ? 100 : ((safeIdx + (current && isAnswered(current) ? 1 : 0)) / total) * 100;
  const canNext = current ? !current.required || isAnswered(current) : false;
  const isLast = safeIdx === total - 1;

  const GEN_STEPS = [
    "Проверяваме въведената информация…",
    "Подбираме приложимите правни клаузи…",
    "Комплектоваме структурата на договора…",
    "Съставяме текста и форматираме раздели…",
    "Извършваме оценка на риска…",
    "Финализираме документа — почти готово…",
  ];

  const handleGenerate = async () => {
    // Require login before generating. Wizard state is already persisted to
    // localStorage on every change, so the user returns to the same step.
    if (!authUser) {
      const dest = window.location.pathname + window.location.search;
      toast.info("Влезте, за да създадете договора", {
        description: "Прогресът ви е запазен и ще продължи след вход.",
      });
      navigate(`/auth?redirect=${encodeURIComponent(dest)}`);
      return;
    }
    setGenerating(true);
    setGenStepIdx(0);
    const interval = setInterval(() => {
      setGenStepIdx((i) => (i + 1) % GEN_STEPS.length);
    }, 5000);
    try {
      const flatQs = flattenQuestions(visibleQuestions);
      const arbitrationCourt = arbitration.enabled ? getCourtById(arbitration.courtId) : undefined;
      const { data, error } = await supabase.functions.invoke("generate-contract", {
        body: {
          sector: sector.title,
          contractName: sector.contractName,
          documentName: docName,
          parties: sector.parties,
          answers,
          questions: flatQs.map((q) => ({ id: q.id, label: q.label })),
          arbitration: arbitration.enabled ? {
            enabled: true,
            courtId: arbitration.courtId,
            courtName: arbitrationCourt?.name ?? arbitration.customName,
            courtLink: arbitrationCourt?.website ?? arbitration.customLink,
          } : { enabled: false },
          bilingual: bilingualMode,
        },
      });
      if (error) throw error;
      if (!data || data.error) {
        if (data?.requires_login) {
          toast.error(data.error);
          setTimeout(() => navigate(`/auth?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`), 1200);
          return;
        }
        throw new Error(data?.error || "Неуспешно създаване");
      }
      const payload = data as AIResult;
      if (bilingualMode && payload.contract) payload.contract.bilingual = true;
      setResult(payload);
      toast.success("Договорът е готов", { description: "Прегледайте Краен Договор отдясно." });
    } catch (e: any) {
      if (await (await import("@/lib/blockedContent")).handleBlockedIllegalContent(e)) return;
      const msg = String(e?.message || e);
      if (msg.includes("429")) toast.error("Достигнат е лимитът. Опитайте след малко.");
      else if (msg.includes("402")) toast.error("Изчерпан лимит на системата. Опитайте по-късно.");
      else toast.error("Възникна грешка", { description: msg });
    } finally {
      clearInterval(interval);
      setGenerating(false);
    }
  };

  const user = authUser;
  const [savedDocId, setSavedDocId] = useState<string | undefined>(persisted?.savedDocId);
  const [isPro, setIsPro] = useState(false);
  const [signature, setSignature] = useState<SignatureData>(
    persisted?.signature ?? { name_a: "", name_b: "", city: "", date: "" }
  );
  const [customTitle, setCustomTitle] = useState<string>(persisted?.customTitle ?? "");
  const [contactId, setContactId] = useState<string>(persisted?.contactId ?? "");
  const [contacts, setContacts] = useState<Array<{ id: string; name: string; type?: string }>>([]);
  const [arbitration, setArbitration] = useState<ArbitrationValue>(
    persisted?.arbitration ?? { enabled: false }
  );

  // Persist wizard state on every relevant change so navigation to /auth or /account doesn't lose progress.
  useEffect(() => {
    if (!storageKey) return;
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ answers, stepIdx, result, signature, savedDocId, appliedNotes, customTitle, contactId, arbitration })
      );
      sessionStorage.removeItem(storageKey);
    } catch {}
  }, [storageKey, answers, stepIdx, result, signature, savedDocId, appliedNotes, customTitle, contactId, arbitration]);

  // Build a redirect URL that preserves the current wizard route + query.
  const wizardHref = window.location.pathname + window.location.search;
  const goAuth = () => navigate(`/auth?redirect=${encodeURIComponent(wizardHref)}`);
  const goSubscription = () =>
    navigate(`/account?tab=subscription&redirect=${encodeURIComponent(wizardHref)}`);

  useEffect(() => {
    if (!user) { setIsPro(false); setContacts([]); return; }
    supabase.from("download_quota").select("plan, pro_until").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setIsPro(data.plan === "pro" || (!!data.pro_until && new Date(data.pro_until) > new Date()));
      });
    supabase.from("contacts").select("id, name, type").is("deleted_at", null).order("created_at", { ascending: false })
      .then(({ data }) => setContacts((data as any) ?? []));
  }, [user]);

  // Auto-seed the editable title once the contract is generated.
  useEffect(() => {
    if (result && !customTitle) setCustomTitle(result.contract.title);
    if (result) trackEvent("wizard_complete", { sectorId, doc: docName });
  }, [result, customTitle, sectorId, docName]);

  // Track wizard_start once on mount.
  useEffect(() => {
    trackEvent("wizard_start", { sectorId, doc: docName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleExport = async (format: "pdf" | "docx") => {
    if (!result) return;
    if (!user) {
      toast.error("Влезте в профила си", { description: "Прогресът е запазен — ще се възстанови след вход." });
      goAuth();
      return;
    }
    setExporting(format);
    try {
      const sigPayload: SignatureInfo = {
        name_a: signature.name_a || answers.party_a_name || "",
        name_b: signature.name_b || answers.party_b_name || "",
        city: signature.city,
        date: signature.date,
        image_a: isPro ? signature.image_a : undefined,
        image_b: isPro ? signature.image_b : undefined,
      };
      const finalTitle = (customTitle || result.contract.title).trim() || result.contract.title;
      const contractWithSig: GeneratedContract = { ...result.contract, title: finalTitle, signature: sigPayload };
      const res = await downloadDocument({
        kind: "contract",
        format,
        title: finalTitle,
        payload: contractWithSig,
        source_id: sector.id,
        contact_id: contactId || undefined,
        saved_document_id: savedDocId,
      });
      if (!res.ok) {
        if (res.error === "quota_exceeded") {
          toast.error("Изчерпан безплатен лимит", {
            description: "Купете единичен договор за 1.90€ или преминете към Pro — прогресът е запазен.",
            action: { label: "Виж опции", onClick: () => goSubscription() },
          });
        } else {
          toast.error("Грешка при експорт", { description: res.error });
        }
        return;
      }
      if (res.saved_document_id) setSavedDocId(res.saved_document_id);
      toast.success(format === "pdf" ? "PDF изтеглен" : "DOCX изтеглен", {
        description: res.free ? "Повторно сваляне (безплатно)" : "Запазен в Документи → Всички",
      });
    } catch (e: any) {
      toast.error("Грешка при експорт", { description: String(e?.message ?? e) });
    } finally {
      setExporting(null);
    }
  };

  const handleApplyCorrections = async (sel: CorrectionsSelection) => {
    if (!result) return;
    if (!user) {
      toast.error("Влезте в профила си", { description: "Прогресът е запазен." });
      goAuth();
      return;
    }
    if (sel.issues.length === 0 && sel.recommendations.length === 0) {
      toast.message("Изберете поне една препоръка за корекция");
      return;
    }
    setApplyingCorrections(true);
    try {
      const { getOpSessionId, newOpBatchId } = await import("@/lib/opSession");
      const { data, error } = await supabase.functions.invoke("apply-corrections", {
        body: {
          contract: result.contract,
          risk: result.risk,
          selectedIssues: sel.issues,
          selectedRecommendations: sel.recommendations,
          answers,
          session_id: getOpSessionId(),
          batch_id: newOpBatchId(),
        },
      });
      if (error || data?.error) {
        if (data?.error === "pro_required") {
          toast.error("Нужен е Pro план", {
            description: "Прогресът е запазен.",
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
      setAppliedNotes(Array.isArray(data.applied) ? data.applied : ["Корекциите са приложени"]);
      setSavedDocId(undefined); // forces re-save as new version
      toast.success("Корекциите са приложени", { description: "Прегледайте обновения договор отдясно." });
    } catch (e: any) {
      if (await (await import("@/lib/blockedContent")).handleBlockedIllegalContent(e)) return;
      toast.error("Грешка при корекция", { description: String(e?.message ?? e) });
    } finally {
      setApplyingCorrections(false);
    }
  };

  const [saving, setSaving] = useState(false);
  const handleSaveToProfile = async () => {
    if (!result) return;
    if (!user) {
      toast.error("Влезте в профила си", { description: "Прогресът е запазен." });
      goAuth();
      return;
    }
    if (savedDocId) {
      toast.message("Договорът вече е запазен", { description: "Намерете го в Документи → Всички." });
      return;
    }
    setSaving(true);
    try {
      const finalTitle = (customTitle || result.contract.title).trim() || result.contract.title;
      const { data, error } = await supabase.functions.invoke("save-document", {
        body: {
          kind: "contract",
          title: finalTitle,
          payload: { ...result.contract, title: finalTitle },
          source_id: sector.id,
          contact_id: contactId || undefined,
        },
      });
      if (error || data?.error) throw new Error(data?.error || error?.message || "Грешка");
      setSavedDocId(data.saved_document_id);
      toast.success("Запазено в профила", { description: "Документи → Всички" });
    } catch (e: any) {
      toast.error("Грешка при запазване", { description: String(e?.message ?? e) });
    } finally {
      setSaving(false);
    }
  };

  const [downloadingBlank, setDownloadingBlank] = useState(false);
  const [blankStep, setBlankStep] = useState(0);
  const todayLabel = new Date().toLocaleDateString("bg-BG", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  const blankSteps = [
    { icon: ShieldCheck, label: "Проверка на сигурността на IP адреса…" },
    { icon: Search, label: "Подготовка на правната бланка…" },
    {
      icon: FileSearch,
      label: `Проверка за липсващи клаузи и реквизити към дата ${todayLabel}…`,
    },
    { icon: Download, label: "Бланката ще бъде свалена до 10 секунди…" },
  ];
  const runBlankDownload = async () => {
    if (!user) {
      toast.error("Влезте, за да изтеглите бланка", { description: "Прогресът е запазен." });
      goAuth();
      return;
    }
    setDownloadingBlank(true);
    setBlankStep(0);
    const t1 = setTimeout(() => setBlankStep(1), 2000);
    const t2 = setTimeout(() => setBlankStep(2), 4500);
    const clearStepTimers = () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
    try {
      const { data, error } = await supabase.functions.invoke("download-blank", {
        body: {
          sector_id: sector.id,
          sector_title: sector.title,
          document_name: docName ?? sector.contractName,
          bilingual: bilingualMode,
        },
      });
      if (error || data?.error) {
        clearStepTimers();
        const msg = (data?.error || error?.message || "Грешка при свалянето").toString();
        toast.error("Грешка", { description: msg });
        return;
      }
      clearStepTimers();
      setBlankStep(3);
      const url: string = data.url;
      // Override server filename with a human-readable, document-named filename.
      const baseName = (docName ?? sector.contractName ?? "blanka").trim();
      const ext = (data.filename as string | undefined)?.match(/\.[a-z0-9]+$/i)?.[0] ?? ".docx";
      const dateStamp = new Date().toISOString().slice(0, 10);
      const filename = `${slugify(baseName) || "blanka"}-${dateStamp}${ext}`;
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      toast.success("Бланката е готова");
    } catch (e) {
      clearStepTimers();
      toast.error("Грешка", { description: (e as Error).message });
    } finally {
      setTimeout(() => setDownloadingBlank(false), 600);
    }
  };

  const handleDownloadBlank = async () => {
    try {
      await ensureAIDisclaimerAccepted();
    } catch {
      return; // user dismissed disclaimer
    }
    recordConsents([{ consent_type: "ai_disclaimer", granted: true }]).catch(() => undefined);
    await runBlankDownload();
  };

  // Auto-trigger blank download when arriving with ?blank=1
  const autoBlankTriggered = useRef(false);
  useEffect(() => {
    if (autoBlankTriggered.current) return;
    if (searchParams.get("blank") !== "1") return;
    if (authLoading) return;
    if (!authUser) {
      autoBlankTriggered.current = true;
      toast.error("Влезте, за да изтеглите бланка", { description: "Прогресът е запазен." });
      goAuth();
      return;
    }
    autoBlankTriggered.current = true;
    (async () => {
      try {
        await ensureAIDisclaimerAccepted();
      } catch {
        return;
      }
      recordConsents([{ consent_type: "ai_disclaimer", granted: true }]).catch(() => undefined);
      await runBlankDownload();
      setTimeout(() => {
        navigate(returnTo, { replace: true });
      }, 1500);
    })();
  }, [searchParams, authUser, authLoading, navigate, returnTo]);



  return (
    <div className="min-h-screen">
      <Header />


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
                      active
                        ? "bg-gold/10 text-foreground"
                        : done
                        ? "text-muted-foreground"
                        : "text-muted-foreground/60"
                    }`}
                  >
                    {done ? (
                      <Check className="h-4 w-4 shrink-0 text-emerald-500" />
                    ) : active ? (
                      <Loader2 className="h-4 w-4 shrink-0 animate-spin text-gold" />
                    ) : (
                      <Icon className="h-4 w-4 shrink-0" />
                    )}
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

      {/* Progress strip */}
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
              <span className="text-muted-foreground">/</span>
              <span className="font-medium text-foreground">{sector.title}</span>
              <span className="hidden text-muted-foreground sm:inline">·</span>
              <span className="hidden font-serif italic text-gold sm:inline">{sector.contractName}</span>
            </div>
            <div className="text-muted-foreground">
              {result ? "Готово" : `Стъпка ${safeIdx + 1} от ${total}`}
            </div>
          </div>
          <Progress value={progress} className="h-1.5 bg-secondary" />
        </div>
      </div>

      {/* Blank-template download — always available, before answering questions */}
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
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* LEFT — interview / risk report */}
          <section className="space-y-5">
            <RiskMeter
              level={result?.risk.level ?? "unknown"}
              score={result?.risk.score}
              summary={result?.risk.summary}
            />

            {!result && current && (
              <div className="rounded-xl border border-border/60 bg-gradient-card p-6 shadow-soft animate-fade-in">
                <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-wider text-gold">
                  <span>Въпрос {safeIdx + 1}</span>
                  <span className="text-muted-foreground">/ {total}</span>
                </div>
                <QuestionField
                  q={current}
                  value={answers[current.id] ?? ""}
                  onChange={(v) => setAnswers((p) => ({ ...p, [current.id]: v }))}
                  answers={answers}
                  onAnswerChange={(id, v) => setAnswers((p) => ({ ...p, [id]: v }))}
                  contacts={contacts}
                />

                {isLast && (
                  <div className="mt-6">
                    <FollowupSuggestions
                      sectorId={sector?.id}
                      contractType={(sector as { selectedDocument?: string })?.selectedDocument}
                      answers={answers}
                      onAnswer={(id, v) => setAnswers((p) => ({ ...p, [id]: v }))}
                    />
                  </div>
                )}



                <div className="mt-8 flex items-center justify-between gap-3">
                  <Button
                    variant="ghost"
                    onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                    disabled={safeIdx === 0}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="mr-1 h-4 w-4" /> Назад
                  </Button>
                  {isLast ? (
                    <Button
                      onClick={handleGenerate}
                      disabled={!canNext || generating}
                      size="lg"
                      className="bg-gradient-gold text-navy shadow-gold hover:shadow-[0_15px_50px_-10px_hsl(43_55%_54%_/_0.5)]"
                    >
                      {generating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Изготвяне…
                        </>
                      ) : (
                        <>
                          <Bird className="mr-2 h-4 w-4" />
                          Анализирай и създай
                        </>
                      )}
                    </Button>
                  ) : (
                    <Button
                      onClick={() => setStepIdx((i) => i + 1)}
                      disabled={!canNext}
                      className="bg-gradient-gold text-navy hover:shadow-gold"
                    >
                      Напред <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  )}
                </div>
                {generating && (
                  <div className="mt-4 rounded-lg border border-gold/30 bg-gold/5 p-4 animate-fade-in">
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
                )}
              </div>
            )}

            {result && (
              <div className="space-y-5 animate-fade-in">
                <CorrectionsPanel
                  isPro={isPro}
                  issues={result.risk.issues || []}
                  recommendations={result.risk.recommendations || []}
                  loading={applyingCorrections}
                  applied={appliedNotes}
                  onApply={handleApplyCorrections}
                  onUpgrade={() => navigate("/account?tab=subscription")}
                />

                <div className="rounded-xl border border-border/60 bg-gradient-card p-6 shadow-soft">
                  <RiskReport
                    level={result.risk.level}
                    issues={result.risk.issues || []}
                    recommendations={result.risk.recommendations || []}
                  />
                </div>

                {/* Cash payment disclaimer — shown when any answer mentions cash. */}
                {Object.values(answers).some((v) =>
                  typeof v === "string" && /\bбро[йя]\b|\bкеш\b|\bcash\b/i.test(v)
                ) && (
                  <LegalDisclaimer variant="warning">
                    <strong>Плащане в брой:</strong> Съгласно чл. 3 от Закона за ограничаване на плащанията в брой (ЗОПБ) плащания на стойност <strong>равна или над 5 000 €</strong> (както и серия от свързани плащания, надхвърлящи прага) задължително се извършват само чрез превод по платежна сметка. Уверете се, че сумата по договора попада в позволения праг — в противен случай преминете към банков превод, за да избегнете санкции.
                  </LegalDisclaimer>
                )}

                <ArbitrationSelector value={arbitration} onChange={setArbitration} />

                <SignatureBlock
                  isPro={isPro}
                  defaultPartyA={answers.party_a_name}
                  defaultPartyB={answers.party_b_name}
                  value={signature}
                  onChange={setSignature}
                />


                <div className="rounded-xl border border-gold/30 bg-gradient-card p-6 shadow-soft">
                  <h3 className="mb-1 font-serif text-lg font-bold">Финализиране</h3>
                  <p className="mb-4 text-xs text-muted-foreground">
                    Именувайте договора и (по избор) го свържете с контрагент. Запазва се във „Всички" — после може да го преместите в папка от профила си.
                  </p>

                  <div className="mb-4 grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5">
                      <Label htmlFor="doc-title" className="text-xs uppercase tracking-wider text-muted-foreground">
                        Име на договора
                      </Label>
                      <Input
                        id="doc-title"
                        value={customTitle}
                        onChange={(e) => { setCustomTitle(e.target.value); setSavedDocId(undefined); }}
                        placeholder={result.contract.title}
                        className="bg-card/60"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                        <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> Контрагент</span>
                      </Label>
                      <Select
                        value={contactId || "none"}
                        onValueChange={(v) => { setContactId(v === "none" ? "" : v); setSavedDocId(undefined); }}
                      >
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
                      {user && contacts.length === 0 && (
                        <button
                          type="button"
                          onClick={() => navigate(`/account?tab=contacts&redirect=${encodeURIComponent(wizardHref)}`)}
                          className="text-[11px] text-gold hover:underline"
                        >
                          + Добави контрагент
                        </button>
                      )}
                    </div>
                  </div>

                  <h4 className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Експорт</h4>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      onClick={() => handleExport("pdf")}
                      disabled={!!exporting}
                      className="flex-1 bg-gradient-gold text-navy hover:shadow-gold"
                    >
                      {exporting === "pdf" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <FileDown className="mr-2 h-4 w-4" />
                      )}
                      Свали PDF
                    </Button>
                    <Button
                      onClick={() => handleExport("docx")}
                      disabled={!!exporting}
                      variant="outline"
                      className="flex-1 border-gold/40 hover:bg-gold/10 hover:text-gold"
                    >
                      {exporting === "docx" ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <FileText className="mr-2 h-4 w-4" />
                      )}
                      Свали DOCX
                    </Button>
                  </div>
                  <Button
                    onClick={handleSaveToProfile}
                    disabled={saving || !!savedDocId}
                    variant="outline"
                    className="mt-2 w-full border-gold/40 hover:bg-gold/10 hover:text-gold"
                  >
                    {saving ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Save className="mr-2 h-4 w-4" />
                    )}
                    {savedDocId ? "Запазено в профила" : "Запази в профила"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      if (storageKey) sessionStorage.removeItem(storageKey);
                      setResult(null);
                      setStepIdx(0);
                      setAnswers({});
                      setSavedDocId(undefined);
                      setAppliedNotes(undefined);
                      setSignature({ name_a: "", name_b: "", city: "", date: "" });
                      setCustomTitle("");
                      setContactId("");
                    }}
                    className="mt-3 w-full text-xs text-muted-foreground hover:text-gold"
                  >
                    Започни нов договор
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* RIGHT — Live draft */}
          <section className="lg:sticky lg:top-32 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gold">
                <FileText className="h-3.5 w-3.5" />
                Работен документ
              </div>
              {!result && (
                <span className="text-xs text-muted-foreground">Актуализация в реално време</span>
              )}
            </div>
            <LiveDraft
              sector={sector}
              answers={answers}
              generated={result?.contract}
              signature={result ? signature : undefined}
              isPro={isPro}
              docName={docName}
              bilingual={bilingualMode}
              onContractChange={(next) => {
                if (!result) return;
                setResult({ ...result, contract: { ...result.contract, ...next } });
                setSavedDocId(undefined); // invalidate saved version
              }}
              onDownloadBlank={handleDownloadBlank}
            />

          </section>
        </div>
      </main>
    </div>
  );
}
