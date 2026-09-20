import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Download, RefreshCw, ShieldAlert, ShieldCheck, AlertTriangle,
  Loader2, FileText, Trash2, Bird, Wand2, Copy, Save, Users, PenLine,
} from "@/icons";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ShareForSignDialog } from "@/components/ShareForSignDialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/clipboard";
import { emptyIssuesMessage, emptyMissingClausesMessage, presentAnalysisScore } from "@/lib/analysisVerification";
import {
  historicalFindingsNotice,
  isSnapshotActionable,
  type AnalysisSourceBinding,
} from "@/lib/analysisSourceBinding";
import { useSourceFreshness } from "@/hooks/useSourceFreshness";
import {
  useUploadedContractDoc,
  type Issue,
} from "@/hooks/useUploadedContractDoc";
import {
  validatePendingAiAction,
  PENDING_REJECTION_MESSAGES,
  type PendingAiAction,
} from "@/lib/pendingAiAction";
import {
  buildCorrectionRequest,
  buildCorrectionSelection,
  isCorrectionStale,
  isSameViewIdentity,
  validateCorrectionResponse,
  CORRECTION_REQUEST_MESSAGES,
  CORRECTION_RESPONSE_MESSAGES,
  STALE_CORRECTION_NOTICE,
  type CorrectionResult,
} from "@/lib/uploadedContractOps";
import { SensitiveDataWarning } from "@/components/SensitiveDataWarning";
import { AnalysisUpgradeCta } from "@/components/analysis/AnalysisUpgradeCta";
import { useIsPro } from "@/hooks/useIsPro";
import { trackGenerate } from "@/lib/docFunnel";
import {
  parseSensitiveResponse,
  isConfirmationRequired,
  isSpecialCategoryBlocked,
  type ClassificationSummary,
} from "@/lib/aiSensitiveData";
import { classifyGenerationError, type GenerationError } from "@/lib/generationErrors";
import { getStableOpKey, releaseStableOpKey, opaqueOpScope } from "@/lib/opSession";




const sevColor = (s: Issue["severity"]) =>
  s === "high" ? "border-red-400/40 bg-red-400/10 text-red-300"
  : s === "medium" ? "border-amber-300/40 bg-amber-300/10 text-amber-200"
  : "border-emerald-400/30 bg-emerald-400/5 text-emerald-200";
const sevLabel = (s: Issue["severity"]) => s === "high" ? "ВИСОК" : s === "medium" ? "СРЕДЕН" : "НИСЪК";

export default function UploadedContractPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const { isPro } = useIsPro();
  const navigate = useNavigate();

  const [analyzing, setAnalyzing] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  // Пази от двойно изпращане при ръчен повторен опит от правната преграда.
  const busyRef = useRef(false);
  const [corrections, setCorrections] = useState<CorrectionResult | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [issueSel, setIssueSel] = useState<Record<number, boolean>>({});
  const [missingSel, setMissingSel] = useState<Record<number, boolean>>({});

  // Потвърждение за чувствителни данни — отложеното действие носи ЗАПОМНЕН обхват.
  const [sensitiveOpen, setSensitiveOpen] = useState(false);
  const [sensitiveBlocked, setSensitiveBlocked] = useState(false);
  const [sensitiveClass, setSensitiveClass] = useState<ClassificationSummary | null>(null);
  const [pending, setPending] = useState<PendingAiAction | null>(null);

  const identity = useMemo(() => ({ docId: id ?? null, userId: user?.id ?? null }), [id, user?.id]);
  const identityRef = useRef(identity);
  identityRef.current = identity;
  const analyzeTokenRef = useRef(0);
  const correctTokenRef = useRef(0);

  const isCurrentRequest = (token: number, tokenRef: { current: number }, startedIdentity: typeof identity) =>
    token === tokenRef.current && isSameViewIdentity(startedIdentity, identityRef.current);

  // Документът, черновите, конфликтите и записите живеят в контролера.
  const doc = useUploadedContractDoc({
    docId: id,
    userId: user?.id ?? null,
    onNotice: (kind, message) => (kind === "success" ? toast.success(message) : toast.error(message)),
  });
  const {
    contract, analysis, contacts, savedDocId, loading, loadError, retryLoad,
    editText, titleDraft, contactId, setEditText, setTitleDraft,
    dirtyText, dirtyTitle, hasUnsavedChanges, remoteConflict, conflictUnresolved,
    savingText, savingTitle, savingContact, creatingShare,
  } = doc;

  // Смяна на документ/потребител: нито един стар диалог, резултат или „заето"
  // състояние не остава върху новия изглед.
  useEffect(() => {
    setAnalyzing(false);
    setCorrecting(false);
    setCorrections(null);
    setIssueSel({});
    setMissingSel({});
    setPickerOpen(false);
    setConfirmDelete(false);
    setDeleting(false);
    setSensitiveOpen(false);
    setSensitiveBlocked(false);
    setSensitiveClass(null);
    setPending(null);
    return () => {
      analyzeTokenRef.current++;
      correctTokenRef.current++;
    };
  }, [id, user?.id]);

  const refreshAnalysisOnly = doc.refreshAnalysisOnly;

  // ---------------------------------------------------------------------------
  // Актуалност на анализа спрямо ТОЧНО запазения текст и име
  // ---------------------------------------------------------------------------
  const { freshness, currentBinding, hashUnavailable } = useSourceFreshness({
    userId: user?.id ?? null,
    docId: contract?.id ?? null,
    savedText: contract?.extracted_text ?? null,
    savedTitle: contract?.title ?? null,
    verification: analysis?.verification,
    hasUnsavedChanges,
  });
  const scope = useMemo(
    () => ({ identity, savedRevision: doc.savedRevision, savedSnapshotKey: doc.savedSnapshotKey }),
    [identity, doc.savedRevision, doc.savedSnapshotKey],
  );
  const scopeRef = useRef(scope);
  scopeRef.current = scope;
  const actionable = isSnapshotActionable(freshness);
  const historyNotice = historicalFindingsNotice(freshness);

  // Проверка при връщане на фокуса — за промени, направени другаде.
  // Проверка при връщане на фокуса. Дали черновите да се пазят се решава при
  // ПРИЛАГАНЕ на резултата, вътре в контролера — не по стойност оттук.
  useEffect(() => {
    const recheck = () => {
      if (document.visibilityState === "hidden") return;
      void doc.load({ silent: true });
    };
    window.addEventListener("focus", recheck);
    document.addEventListener("visibilitychange", recheck);
    return () => {
      window.removeEventListener("focus", recheck);
      document.removeEventListener("visibilitychange", recheck);
    };
  }, [doc.load]);

  const runAnalyze = async (userConfirmed: boolean) => {
    if (!id || hasUnsavedChanges) return;
    const startedIdentity = { docId: id, userId: user?.id ?? null };
    const scopeAtStart = scopeRef.current;
    const token = ++analyzeTokenRef.current;
    if (busyRef.current) return;
    busyRef.current = true;
    setAnalyzing(true);
    trackGenerate("started", { source: "reanalyze" });
    // НЕПРОЗРАЧЕН обхват от целия товар: същият ключ при повторен опит,
    // двойно натискане или загубена връзка — сървърът не таксува втори път.
    const analyzePayloadScope = await opaqueOpScope("analyze_contract", { uploadedContractId: id, userConfirmed });
    const opScope = `op:${analyzePayloadScope}`;
    const operationId = getStableOpKey(opScope);
    const { data, error } = await supabase.functions.invoke("analyze-contract", {
      body: { uploadedContractId: id, userConfirmed, operation_id: operationId },
    });
    busyRef.current = false;
    if (!isCurrentRequest(token, analyzeTokenRef, startedIdentity)) return;
    setAnalyzing(false);
    // Ограничената правна преграда е възстановимо състояние: нищо не се губи.
    if ((await import("@/lib/legalGateClient")).handleLegalVerificationUnavailable(
      { error, data },
      () => { if (!busyRef.current) void runAnalyze(userConfirmed); },
    )) return;
    if (error || (data as { error?: string } | null)?.error) {
      const sensitive = await parseSensitiveResponse(error, data);
      if (!isCurrentRequest(token, analyzeTokenRef, startedIdentity)) return;
      if (isSpecialCategoryBlocked(sensitive)) {
        trackGenerate("fail", { source: "reanalyze", reason: "sensitive_blocked" });
        setSensitiveClass(sensitive!.classification ?? null);
        setSensitiveBlocked(true);
        setPending(null);
        setSensitiveOpen(true);
        return;
      }
      if (isConfirmationRequired(sensitive)) {
        trackGenerate("fail", { source: "reanalyze", reason: "confirmation_required" });
        setSensitiveClass(sensitive!.classification ?? null);
        setSensitiveBlocked(false);
        setPending({ kind: "analyze", scope: scopeAtStart });
        setSensitiveOpen(true);
        return;
      }
      if (await (await import("@/lib/blockedContent")).handleBlockedIllegalContent(error)) {
        trackGenerate("fail", { source: "reanalyze", reason: "blocked_content" });
        return;
      }
      const gen: GenerationError = classifyGenerationError({ error, data: data ?? null });
      if (gen.code === "operation_conflict") {
        // Доказан конфликт на ключа за идемпотентност — освобождаваме го.
        // Въведеното се пази; следващото ИЗРИЧНО действие ще получи нов ключ.
        releaseStableOpKey(opScope);
        trackGenerate("fail", { source: "reanalyze", reason: gen.code });
        toast.error("Заявката се промени. Изпратете отново.");
        return;
      }
      if (
        gen.code === "operation_in_progress" ||
        gen.code === "quota_unavailable" ||
        gen.code === "entitlement_unavailable" ||
        gen.code === "reconciliation_required"
      ) {
        // Операцията все още не е приключила — ключът се пази, същият
        // повторен опит е безопасен.
        trackGenerate("fail", { source: "reanalyze", reason: gen.code });
        toast.error(gen.message);
        return;
      }
      const msg = (data as { error?: string } | null)?.error ?? error?.message ?? "Грешка";
      trackGenerate("fail", { source: "reanalyze", reason: String(msg).slice(0, 80) });
      toast.error(msg);
      return;
    }
    // ДОКАЗАН КРАЕН УСПЕХ: единственият момент, в който ключът пада.
    releaseStableOpKey(opScope);
    trackGenerate("success", { source: "reanalyze" });
    toast.success("Анализът е обновен");
    // Само резултатът от анализа — това, което пишете в редактора, остава.
    await refreshAnalysisOnly();
  };


  const reanalyze = () => runAnalyze(false);

  const openPicker = () => {
    if (!analysis || !actionable) return;
    setIssueSel(Object.fromEntries(analysis.issues.map((_, i) => [i, true])));
    setMissingSel(Object.fromEntries(analysis.missing_clauses.map((_, i) => [i, true])));
    setPickerOpen(true);
  };

  const runCorrect = async (
    payload: {
      analysisId: string;
      binding: AnalysisSourceBinding;
      selectedIssueIndices: number[];
      selectedMissingIndices: number[];
    },
    userConfirmed: boolean,
  ) => {
    if (!id) return;
    const startedIdentity = { docId: id, userId: user?.id ?? null };
    const scopeAtStart = scopeRef.current;
    const token = ++correctTokenRef.current;
    if (busyRef.current) return;
    if (!user?.id) {
      toast.error("Влезте в профила си, за да изготвим корекциите.");
      return;
    }
    busyRef.current = true;
    setCorrecting(true);
    // Устойчив идентификатор на операцията: същият при двойно натискане,
    // повторно показване, презареждане, временна грешка и загубен отговор.
    const {
      clearDocumentOperation, documentOperationScope, documentOperationUserKey, getOrCreateDocumentOperationId,
    } = await import("@/lib/documentOperationKey");
    const userKey = await documentOperationUserKey(user.id);
    const opScopeKey = await documentOperationScope({
      purpose: "correct_uploaded",
      userId: user.id,
      resourceId: id,
      resourceVersion: payload.binding.text_sha256 ?? null,
      options: {
        analysis_id: payload.analysisId,
        issues: payload.selectedIssueIndices,
        missing: payload.selectedMissingIndices,
        user_confirmed: userConfirmed,
      },
    });
    const operationId = getOrCreateDocumentOperationId("correct_uploaded", userKey, opScopeKey);
    const { data, error } = await supabase.functions.invoke("correct-uploaded", {
      body: {
        uploadedContractId: id,
        analysisId: payload.analysisId,
        expectedSourceBinding: payload.binding,
        selectedIssueIndices: payload.selectedIssueIndices,
        selectedMissingIndices: payload.selectedMissingIndices,
        userConfirmed,
        operation_id: operationId,
      },
    });
    // Ключът пада САМО при доказан изход: успех, конфликт или изтекъл резултат.
    const ledgerStatus = Number((error as { context?: { status?: number } } | null)?.context?.status ?? 0);
    if (!error || ledgerStatus === 409 || ledgerStatus === 410) {
      clearDocumentOperation("correct_uploaded", userKey, opScopeKey);
    }
    busyRef.current = false;
    if (!isCurrentRequest(token, correctTokenRef, startedIdentity)) return;
    setCorrecting(false);
    // Ограничената правна преграда е възстановимо състояние: нищо не се губи.
    if ((await import("@/lib/legalGateClient")).handleLegalVerificationUnavailable(
      { error, data },
      () => { if (!busyRef.current) void runCorrect(payload, userConfirmed); },
    )) return;
    if (error || (data as { error?: string } | null)?.error) {
      const sensitive = await parseSensitiveResponse(error, data);
      if (!isCurrentRequest(token, correctTokenRef, startedIdentity)) return;
      if (isSpecialCategoryBlocked(sensitive)) {
        setSensitiveClass(sensitive!.classification ?? null);
        setSensitiveBlocked(true);
        setPending(null);
        setSensitiveOpen(true);
        return;
      }
      if (isConfirmationRequired(sensitive)) {
        setSensitiveClass(sensitive!.classification ?? null);
        setSensitiveBlocked(false);
        setPending({
          kind: "correct",
          scope: scopeAtStart,
          analysisId: payload.analysisId,
          binding: payload.binding,
          selectedIssueIndices: payload.selectedIssueIndices,
          selectedMissingIndices: payload.selectedMissingIndices,
        });
        setSensitiveOpen(true);
        return;
      }
      if (await (await import("@/lib/blockedContent")).handleBlockedIllegalContent(error)) return;
      const msg = (data as { error?: string } | null)?.error ?? error?.message ?? "Грешка";
      if (msg === "pro_required") {
        toast.error("Тази функция е достъпна само за платен индивидуален план");
        navigate("/account?tab=plan");
      } else {
        toast.error(msg);
      }
      return;
    }
    // Резултатът се приема САМО ако носи точно заявения анализ и обвързване.
    const checked = validateCorrectionResponse({
      response: data,
      requestedAnalysisId: payload.analysisId,
      requestedBinding: payload.binding,
    });
    if (checked.ok !== true) {
      toast.error(CORRECTION_RESPONSE_MESSAGES[checked.reason]);
      return;
    }
    setCorrections(checked.result);
  };

  const suggestCorrections = async () => {
    if (!analysis) return;
    const selection = buildCorrectionSelection({
      issuesCount: analysis.issues.length,
      missingCount: analysis.missing_clauses.length,
      issueSel,
      missingSel,
    });
    const built = buildCorrectionRequest({
      uploadedContractId: id,
      analysisId: analysis.id,
      currentBinding,
      freshness,
      selection,
      userConfirmed: false,
    });
    if (built.ok !== true) {
      toast.error(CORRECTION_REQUEST_MESSAGES[built.reason]);
      return;
    }
    setPickerOpen(false);
    await runCorrect(
      {
        analysisId: built.payload.analysisId,
        binding: built.payload.expectedSourceBinding,
        selectedIssueIndices: built.payload.selectedIssueIndices,
        selectedMissingIndices: built.payload.selectedMissingIndices,
      },
      false,
    );
  };

  const handleSensitiveConfirm = async () => {
    setSensitiveOpen(false);
    // Потвърждението важи само за ЗАПОМНЕНАТА снимка на документа.
    const check = validatePendingAiAction(pending, {
      scope,
      hasUnsavedChanges,
      analysisId: analysis?.id ?? null,
      currentBinding,
      freshness,
    });
    setPending(null);
    if (check.ok === false) {
      toast.error(PENDING_REJECTION_MESSAGES[check.reason]);
      return;
    }
    if (check.action.kind === "analyze") {
      await runAnalyze(true);
      return;
    }
    await runCorrect(
      {
        analysisId: check.action.analysisId,
        binding: check.action.binding,
        selectedIssueIndices: check.action.selectedIssueIndices,
        selectedMissingIndices: check.action.selectedMissingIndices,
      },
      true,
    );
  };


  const downloadOriginal = async () => {
    if (!contract?.storage_path) {
      toast.error("Този договор няма прикачен оригинален файл (бил е въведен като текст).");
      return;
    }
    const { data, error } = await supabase.storage.from("user-contracts").createSignedUrl(contract.storage_path, 60);
    if (error || !data) { toast.error("Грешка при изтегляне"); return; }
    window.open(data.signedUrl, "_blank");
  };

  const remove = async () => {
    if (!contract) return;
    setDeleting(true);
    if (contract.storage_path) {
      await supabase.storage.from("user-contracts").remove([contract.storage_path]);
    }
    const { error } = await supabase.from("uploaded_contracts").delete().eq("id", contract.id);
    setDeleting(false);
    setConfirmDelete(false);
    if (error) toast.error(error.message);
    else { toast.success("Изтрит"); navigate("/account?tab=documents"); }
  };

  const saveText = () => { void doc.saveText(); };
  const saveTitle = () => { void doc.saveTitle(); };
  const saveContact = (next: string) => { void doc.saveContact(next); };
  const prepareForSigning = () => { void doc.prepareForSigning(); };


  const issuesByLevel = useMemo(() => {
    if (!analysis) return { high: 0, medium: 0, low: 0 };
    return analysis.issues.reduce(
      (acc, i) => { acc[i.severity] = (acc[i.severity] ?? 0) + 1; return acc; },
      { high: 0, medium: 0, low: 0 } as Record<string, number>,
    );
  }, [analysis]);

  const scorePresentation = useMemo(
    () => presentAnalysisScore({ score: analysis?.score, verification: analysis?.verification, freshness }),
    [analysis, freshness],
  );

  const correctionStale = isCorrectionStale({
    correction: corrections,
    analysisId: analysis?.id ?? null,
    currentBinding,
    freshness,
  });




  if (loading) {
    return (
      <div className="min-h-dvh">
        <Header />
        <main className="container py-10 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </main>
      </div>
    );
  }

  if (loadError && !contract) {
    return (
      <div className="min-h-dvh">
        <Header />
        <main className="container py-10 space-y-4">
          <p className="text-sm text-muted-foreground">{loadError}</p>
          <Button variant="outline" size="sm" onClick={retryLoad}>Опитай пак</Button>
          <div><Link to="/account?tab=documents" className="text-gold">← Към профила</Link></div>
        </main>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="min-h-dvh">
        <Header />
        <main className="container py-10">
          <p>Договорът не е намерен.</p>
          <Link to="/account?tab=documents" className="text-gold">← Към профила</Link>
        </main>
      </div>
    );
  }


  return (
    <div className="min-h-dvh">
      <Header />
      <main className="container py-6 md:py-10">
        <Link to="/account?tab=documents" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gold">
          <ArrowLeft className="h-3 w-3" /> Към моите документи
        </Link>

        <div className="mt-3 flex flex-col items-start justify-between gap-3 md:flex-row md:flex-wrap">
          <div className="w-full min-w-0 md:flex-1">
            <Textarea
              value={titleDraft}
              onChange={(e) => setTitleDraft(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); (e.target as HTMLTextAreaElement).blur(); } }}
              disabled={savingTitle}
              rows={1}
              aria-label="Име на договора"
              className="block min-h-0 w-full resize-none overflow-hidden break-words border-transparent bg-transparent px-0 py-0 font-serif text-2xl font-bold leading-tight shadow-none focus-visible:border-gold/40 focus-visible:bg-card/40 focus-visible:px-2 focus-visible:py-1 md:text-3xl"
              style={{ height: "auto" }}
              ref={(el) => {
                if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; }
              }}
            />
            <div className="mt-1 break-words text-xs text-muted-foreground">
              Качен на {new Date(contract.created_at).toLocaleDateString("bg-BG")} · {contract.source.toUpperCase()}
              {contract.original_filename && <> · {contract.original_filename}</>}
            </div>
            {hasUnsavedChanges && (
              <p className="mt-2 rounded-md border border-amber-300/40 bg-amber-300/10 p-2 text-xs text-amber-200">
                Има незапазени промени{dirtyText && dirtyTitle ? " в текста и името" : dirtyTitle ? " в името" : " в текста"}.
                Оценката е скрита, а анализът и корекциите са спрени, докато не запазите.
              </p>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {contract.storage_path && (
              <Button variant="outline" onClick={downloadOriginal}>
                <Download className="mr-2 h-4 w-4" /> Свали оригинала
              </Button>
            )}
            <Button
              onClick={reanalyze}
              disabled={analyzing || hasUnsavedChanges}
              title={hasUnsavedChanges ? "Запазете промените, преди да анализирате." : undefined}
              className="bg-gradient-gold text-navy"
            >
              {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {analysis ? "Анализирай отново" : "Стартирай анализ"}
            </Button>
            {analysis && (
              <Button
                onClick={openPicker}
                disabled={correcting || !actionable}
                title={!actionable ? "Нужен е анализ на текущия запазен текст." : undefined}
                variant="outline"
                className="border-gold/40 hover:bg-gold/10 hover:text-gold"
              >
                {correcting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                Предложи корекции
              </Button>
            )}
            <Button variant="ghost" className="text-destructive" onClick={() => setConfirmDelete(true)}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Изтриване на договора?</AlertDialogTitle>
              <AlertDialogDescription>
                Това ще изтрие договора и всички свързани анализи. Действието е необратимо.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={deleting}>Отказ</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); remove(); }}
                disabled={deleting}
                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              >
                {deleting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                Изтрий
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-serif">Изберете корекции за прилагане</DialogTitle>
              <DialogDescription>
                Маркирайте кои проблемни клаузи и липсващи елементи да бъдат включени в редакцията. Ще бъдат пренаписани само избраните части.
              </DialogDescription>
            </DialogHeader>
            {analysis && (
              <div className="space-y-5">
                {analysis.issues.length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Проблемни клаузи ({analysis.issues.length})
                      </div>
                      <button
                        type="button"
                        className="text-xs text-gold hover:underline"
                        onClick={() => {
                          const all = Object.values(issueSel).every(Boolean);
                          setIssueSel(Object.fromEntries(analysis.issues.map((_, i) => [i, !all])));
                        }}
                      >
                        {Object.values(issueSel).every(Boolean) ? "Премахни всички" : "Избери всички"}
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {analysis.issues.map((iss, i) => (
                        <label key={i} className="flex cursor-pointer items-start gap-2 rounded-md border border-border/40 bg-card/40 p-2 transition-colors hover:border-gold/40">
                          <Checkbox
                            checked={!!issueSel[i]}
                            onCheckedChange={(v) => setIssueSel((p) => ({ ...p, [i]: !!v }))}
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-foreground">{iss.title}</span>
                              <span className={`rounded-full border px-1.5 py-0.5 text-[9px] uppercase tracking-wider ${sevColor(iss.severity)}`}>
                                {sevLabel(iss.severity)}
                              </span>
                            </div>
                            <div className="line-clamp-2 text-xs text-muted-foreground">{iss.explanation}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}

                {analysis.missing_clauses.length > 0 && (
                  <div>
                    <div className="mb-2 flex items-center justify-between">
                      <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                        Липсващи клаузи ({analysis.missing_clauses.length})
                      </div>
                      <button
                        type="button"
                        className="text-xs text-gold hover:underline"
                        onClick={() => {
                          const all = Object.values(missingSel).every(Boolean);
                          setMissingSel(Object.fromEntries(analysis.missing_clauses.map((_, i) => [i, !all])));
                        }}
                      >
                        {Object.values(missingSel).every(Boolean) ? "Премахни всички" : "Избери всички"}
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {analysis.missing_clauses.map((m, i) => (
                        <label key={i} className="flex cursor-pointer items-start gap-2 rounded-md border border-border/40 bg-card/40 p-2 transition-colors hover:border-gold/40">
                          <Checkbox
                            checked={!!missingSel[i]}
                            onCheckedChange={(v) => setMissingSel((p) => ({ ...p, [i]: !!v }))}
                            className="mt-0.5"
                          />
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium text-foreground">{m.name}</div>
                            <div className="line-clamp-2 text-xs text-muted-foreground">{m.why}</div>
                          </div>
                        </label>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setPickerOpen(false)}>Отказ</Button>
              <Button onClick={suggestCorrections} disabled={correcting} className="bg-gradient-gold text-navy">
                {correcting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                Приложи избраните
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>


        <Dialog open={!!corrections} onOpenChange={(o) => !o && setCorrections(null)}>
          <DialogContent className="max-w-3xl max-h-[min(85vh,900px)] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-serif">Предложени корекции</DialogTitle>
            </DialogHeader>
            {corrections && (
              <div className="space-y-4">
                {correctionStale && (
                  <p className="rounded-lg border border-amber-300/40 bg-amber-300/10 p-3 text-xs text-amber-200">
                    {STALE_CORRECTION_NOTICE}
                  </p>
                )}
                {corrections.changes?.length > 0 && (
                  <div className="rounded-lg border border-gold/30 bg-gold/5 p-3">
                    <div className="text-xs uppercase tracking-wider text-gold mb-2">Ключови промени</div>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {corrections.changes.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                )}
                <div className="rounded-lg bg-white p-4 text-sm leading-relaxed text-gray-900 whitespace-pre-wrap font-serif max-h-[40vh] overflow-y-auto lg:max-h-[55vh]">
                  {corrections.corrected_text}
                </div>
                <div className="flex gap-2">
                  <Button disabled={correctionStale} onClick={async () => { const ok = await copyToClipboard(corrections.corrected_text); if (ok) { toast.success("Копирано"); } else { toast.error("Копирането не е разрешено"); } }} className="bg-gradient-gold text-navy">
                    <Copy className="mr-2 h-4 w-4" /> Копирай
                  </Button>
                  <Button variant="outline" disabled={correctionStale} onClick={() => {
                    const blob = new Blob([corrections.corrected_text], { type: "text/plain;charset=utf-8" });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement("a");
                    a.href = url; a.download = `${contract?.title || "contract"}-corrected.txt`; a.click();
                    URL.revokeObjectURL(url);
                  }}>
                    <Download className="mr-2 h-4 w-4" /> Свали .txt
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* DOCUMENT EDITOR + LINKED CONTACT + SIGNING — always visible */}
        {loadError && contract && (
          <section className="mt-6 flex flex-wrap items-center gap-3 rounded-xl border border-border/60 bg-card/50 p-4 text-sm text-muted-foreground">
            <span>{loadError}</span>
            <Button variant="outline" size="sm" onClick={retryLoad}>Опитай пак</Button>
          </section>
        )}

        {conflictUnresolved && (
          <section className="mt-6 rounded-xl border border-amber-300/50 bg-amber-300/10 p-4 text-sm text-amber-100">
            <h2 className="font-serif text-lg font-bold">Документът е променен и на друго място</h2>
            <p className="mt-1 text-xs">
              Вашите незапазени промени са запазени тук. Записването е спряно, докато не изберете какво остане —
              нищо не се презаписва без Вашето решение.
            </p>
            {remoteConflict ? (
              <>
                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <div className="rounded-md border border-amber-300/30 bg-background/40 p-3">
                    <div className="text-xs uppercase tracking-wider">Версия на другото място</div>
                    <div className="mt-1 text-xs font-semibold">{remoteConflict.title}</div>
                    <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed">
                      {remoteConflict.extracted_text}
                    </pre>
                  </div>
                  <div className="rounded-md border border-amber-300/30 bg-background/40 p-3">
                    <div className="text-xs uppercase tracking-wider">Вашият текст</div>
                    <div className="mt-1 text-xs font-semibold">{titleDraft}</div>
                    <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed">
                      {editText}
                    </pre>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button size="sm" variant="outline" onClick={() => doc.useRemoteVersion()}>
                    Използвай другата версия
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => doc.keepLocalVersion()}>
                    Запази моя текст
                  </Button>
                </div>
              </>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <p className="text-xs">
                  Другата версия още не е заредена. Опитайте да я заредите, за да изберете.
                </p>
                <Button size="sm" variant="outline" onClick={() => void doc.load({ silent: true })}>
                  Зареди другата версия
                </Button>
              </div>
            )}
          </section>
        )}

        <section className="mt-6 rounded-xl border border-border/60 bg-gradient-card p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-xl font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-gold" /> Документ
            </h2>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={saveText}
                disabled={savingText || conflictUnresolved || editText === contract.extracted_text}
                title={conflictUnresolved ? "Изберете коя версия остава, преди да записвате." : undefined}
                className="bg-gradient-gold text-navy"
              >
                {savingText ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Запази текста
              </Button>
            </div>
          </div>

          <div className="mt-4 grid gap-4 md:grid-cols-[1fr_260px]">
            <div className="legal-paper rounded-md p-6 shadow-elegant md:p-8">
              <textarea
                value={editText}
                onChange={(e) => setEditText(e.target.value)}
                rows={Math.max(20, editText.split("\n").length + 2)}
                spellCheck={false}
                placeholder="Извлеченият текст на договора..."
                className="block w-full resize-y border-0 bg-transparent p-0 outline-none focus:ring-0"
                style={{
                  fontFamily: "'Libre Baskerville', Georgia, serif",
                  fontSize: "15px",
                  lineHeight: "1.7",
                  color: "hsl(220 30% 12%)",
                  whiteSpace: "pre-wrap",
                }}
              />
            </div>
            <div className="space-y-4">
              <div>
                <Label className="flex items-center gap-1.5 text-xs">
                  <Users className="h-3.5 w-3.5" /> Контрагент
                </Label>
                <Select value={contactId} onValueChange={saveContact} disabled={savingContact}>
                  <SelectTrigger className="mt-1.5"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">— Без контрагент —</SelectItem>
                    {contacts.map((c) => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                  </SelectContent>
                </Select>
                <p className="mt-1.5 text-[11px] text-muted-foreground">
                  Свържете договора с контакт от <Link to="/account?tab=contacts" className="text-gold hover:underline">контрагентите</Link>.
                </p>
              </div>

              <div className="rounded-lg border border-gold/30 bg-gold/5 p-3">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-gold">
                  <PenLine className="h-3.5 w-3.5" /> Подписване
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Изпратете линк към насрещната страна за електронен подпис. След като бъде подписан документът отива в "ПОДПИСАНИ" и ще очаква Вашият подпис.
                </p>
                {savedDocId ? (
                  <div className="mt-2">
                    <ShareForSignDialog documentId={savedDocId} documentTitle={contract.title} />
                  </div>
                ) : (
                  <Button
                    size="sm"
                    onClick={prepareForSigning}
                    disabled={creatingShare}
                    variant="outline"
                    className="mt-2 w-full border-gold/40 hover:bg-gold/10 hover:text-gold"
                  >
                    {creatingShare ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <PenLine className="mr-2 h-4 w-4" />}
                    Подготви за подпис
                  </Button>
                )}
              </div>
            </div>
          </div>
        </section>

        {!analysis ? (
          <div className="mt-8 rounded-xl border border-border/60 bg-gradient-card p-10 text-center">
            <Bird className="mx-auto h-8 w-8 text-gold" />
            <p className="mt-3 text-sm text-muted-foreground">Все още няма анализ за този договор.</p>
            <Button onClick={reanalyze} disabled={analyzing || hasUnsavedChanges} className="mt-4 bg-gradient-gold text-navy">
              {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bird className="mr-2 h-4 w-4" />}
              Стартирай AI риск-анализ
            </Button>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
            {/* SCORE PANEL */}
            <aside className="space-y-4">
              <div className={`rounded-xl border p-6 text-center ${scorePresentation.tone}`}>
                <div className="text-xs uppercase tracking-wider opacity-80">Risk Score</div>
                {scorePresentation.showScore ? (
                  <div className="mt-2 font-serif text-5xl font-bold">{scorePresentation.score}<span className="text-xl opacity-60">/10</span></div>
                ) : (
                  <div className="mt-2 font-serif text-4xl font-bold">—</div>
                )}
                <div className="mt-2 text-sm font-semibold">{scorePresentation.label}</div>
                <div className="mt-1 text-xs opacity-80">{scorePresentation.subtext}</div>
                {scorePresentation.notice && (
                  <p className="mt-3 border-t border-current/20 pt-3 text-xs leading-relaxed opacity-90">
                    {scorePresentation.notice}
                  </p>
                )}
              </div>

              {/* SCALE LEGEND */}
              <div className="rounded-xl border border-border/60 bg-gradient-card p-4">
                <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Скала на оценката</div>
                <ul className="space-y-1.5 text-xs">
                  <li className="flex items-start gap-2"><span className="mt-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full bg-emerald-400" /><span><strong className="text-emerald-300">9-10</strong> · Изряден — балансиран, без установен риск в обхвата на проверката</span></li>
                  <li className="flex items-start gap-2"><span className="mt-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full bg-emerald-400/60" /><span><strong className="text-emerald-300">7-8</strong> · Добър — малки несъвършенства, без установен риск</span></li>
                  <li className="flex items-start gap-2"><span className="mt-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full bg-amber-300" /><span><strong className="text-amber-200">5-6</strong> · Приемлив — препоръчителни корекции</span></li>
                  <li className="flex items-start gap-2"><span className="mt-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full bg-orange-400" /><span><strong className="text-orange-300">3-4</strong> · Проблемен — преговаряй преди подпис</span></li>
                  <li className="flex items-start gap-2"><span className="mt-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full bg-red-400" /><span><strong className="text-red-300">1-2</strong> · Опасен — не подписвай без юрист</span></li>
                </ul>
              </div>

              <div className="rounded-xl border border-border/60 bg-gradient-card p-4 space-y-2 text-sm">
                <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Сигнали по тежест</div>
                <div className="flex items-center justify-between"><span className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-red-400" />Висок</span><strong>{issuesByLevel.high}</strong></div>
                <div className="flex items-center justify-between"><span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-300" />Среден</span><strong>{issuesByLevel.medium}</strong></div>
                <div className="flex items-center justify-between"><span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" />Нисък</span><strong>{issuesByLevel.low}</strong></div>
                <div className="mt-2 pt-2 border-t border-border/60 text-[11px] leading-relaxed text-muted-foreground">
                  <strong className="text-red-300">Висок</strong> се вдига само при престъпна, нищожна или крайно неравнопоставена клауза. <strong className="text-amber-200">Среден</strong> е за съществени, но решими проблеми. <strong className="text-emerald-200">Нисък</strong> е стилова забележка.
                </div>
              </div>
              <div className="rounded-xl border border-border/60 bg-gradient-card p-4 text-xs text-muted-foreground">
                <div className="mb-1 uppercase tracking-wider">Анализ от</div>
                <div>{new Date(analysis.created_at).toLocaleString("bg-BG")}</div>
                <div className="mt-2">Модел: {analysis.model}</div>
                {historyNotice && (
                  <div className="mt-2 rounded bg-muted/30 p-2 text-muted-foreground">{historyNotice}</div>
                )}
              </div>
            </aside>

            <div className="space-y-6">
              {/* TYPE & SUMMARY */}
              <section className="rounded-xl border border-border/60 bg-gradient-card p-6">
                <div className="text-xs uppercase tracking-wider text-gold">{analysis.contract_type || "Тип договор"}</div>
                <h2 className="mt-2 font-serif text-xl font-bold">
                  {actionable ? "Резюме" : "Резюме от предишната проверка"}
                </h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{analysis.summary}</p>
                {historyNotice && (
                  <p className="mt-2 text-xs text-muted-foreground">{historyNotice}</p>
                )}
              </section>

              {/* ISSUES */}
              <section className="rounded-xl border border-border/60 bg-gradient-card p-6">
                <h2 className="font-serif text-xl font-bold">Проблемни клаузи ({analysis.issues.length})</h2>
                {analysis.issues.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">{emptyIssuesMessage(analysis.verification, freshness)}</p>
                ) : (
                  <ul className="mt-4 space-y-3">
                    {analysis.issues.map((iss, idx) => (
                      <li key={idx} className={`rounded-lg border p-4 ${sevColor(iss.severity)}`}>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h3 className="font-bold">{iss.title}</h3>
                          <span className="rounded-full border px-2 py-0.5 text-[10px] uppercase tracking-wider">{sevLabel(iss.severity)}</span>
                        </div>
                        {iss.clause && (
                          <blockquote className="mt-2 border-l-2 border-current/40 pl-3 text-xs italic opacity-80">
                            „{iss.clause}"
                          </blockquote>
                        )}
                        <p className="mt-2 text-sm">{iss.explanation}</p>
                        {iss.suggestion && (
                          <div className="mt-2 rounded bg-background/40 p-2 text-xs">
                            <span className="font-bold">Препоръка: </span>{iss.suggestion}
                          </div>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              {!isPro && (
                <AnalysisUpgradeCta
                  issuesCount={analysis.issues.length}
                  docKey={analysis.contract_type ?? undefined}
                  signedIn={!!user}
                />
              )}

              {/* MISSING */}
              <section className="rounded-xl border border-border/60 bg-gradient-card p-6">
                <h2 className="font-serif text-xl font-bold">Липсващи стандартни клаузи ({analysis.missing_clauses.length})</h2>
                {analysis.missing_clauses.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">{emptyMissingClausesMessage(analysis.verification, freshness)}</p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {analysis.missing_clauses.map((m, idx) => (
                      <li key={idx} className="rounded-lg border border-border/40 bg-background/40 p-3 text-sm">
                        <div className="font-bold text-gold">{m.name}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{m.why}</div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

            </div>
          </div>
        )}
      </main>

      <SensitiveDataWarning
        open={sensitiveOpen}
        onClose={() => {
          setSensitiveOpen(false);
          setPending(null);
          
        }}
        onConfirm={handleSensitiveConfirm}
        classification={sensitiveClass}
        blocked={sensitiveBlocked}
        operationLabel={pending?.kind === "correct" ? "корекция" : "анализ"}
      />
    </div>
  );
}
