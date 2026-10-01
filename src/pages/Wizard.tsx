import { useMemo, useState, useRef, useEffect, useCallback } from "react";
import { useNavigate, useParams, useSearchParams, Link } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader2, Bird, FileDown, FileText, Save, User, Download, ShieldCheck, Search, FileSearch, Check, AlertCircle, RefreshCcw } from "@/icons";
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
import { getFillLaterPersonalData } from "@/lib/placeholderGate";
import { AIReviewCard } from "@/components/wizard/AIReviewCard";
import {
  acceptedReviewContext as pickAcceptedReviewContext,
  captureReviewContext,
  type ReviewContextInput,
} from "@/lib/reviewSnapshot";

import { FillLaterPersonalData } from "@/components/wizard/FillLaterPersonalData";
import { TOPUP_PACK_CONFIG, fmtEur, roiSubtitle, monthlyLabel, PRICING_PLANS, FREE_OPS_PER_MONTH } from "@/lib/pricing";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getPreferredFormat, setPreferredFormat, type DocFormat } from "@/lib/preferredFormat";
import { useKeyboardInset } from "@/hooks/useKeyboardOpen";
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
import { getQuestionGraph } from "@/data/questionGraphs/dogovor-za-naem-na-zhilishte";
import { adaptGraphToWizardQuestions } from "@/data/questionGraphs/adapter";
import { parseExtraPartyTypes } from "@/components/wizard/liveDraft/clauseBuilders";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { generateContractJob, GENERATION_PRELAUNCH_CODE } from "@/lib/generateContractJob";
import { findRestrictedIdentifiersDeep, restrictedIdentifierMessage } from "@/lib/privacyGate";
import { canStartNewProcessing } from "@/lib/prelaunch";
import { openPrelaunchWaitlist } from "@/lib/prelaunchWaitlist";
import { classifyGenerationError, errorClassOf, type GenerationError } from "@/lib/generationErrors";
import { getOpSessionId, getStableOpKey, releaseStableOpKey, opaqueOpScope } from "@/lib/opSession";

import { SensitiveDataNotice } from "@/components/wizard/SensitiveDataNotice";
import { buildDraftOutline } from "@/lib/draftOutline";
import {
  parseSensitiveResponse,
  isConfirmationRequired,
  isSpecialCategoryBlocked,
  type ClassificationSummary,
} from "@/lib/aiSensitiveData";
import { RefineDraftBox } from "@/components/wizard/RefineDraftBox";

import { useAuth } from "@/hooks/useAuth";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { openInlineAuth } from "@/lib/inlineAuth";
import { smartDefaultsFor } from "@/lib/smartDefaults";
import { DownloadRoiDialog } from "@/components/wizard/DownloadRoiDialog";
import {
  GenerationBlockedDialog,
  type BlockedReason,
} from "@/components/wizard/GenerationBlockedDialog";
import { trackEvent } from "@/lib/analytics";
import {
  trackDocStart,
  trackGenerate,
  trackFillStep,
  trackReviewResult,
  trackDocEvent,
  trackResultViewed,
  trackAuthPromptShown,
  trackPaywallShown,
  trackDocumentSaved,
} from "@/lib/docFunnel";
import { getVariant, trackAbExposure, applyAbOverridesFromUrl } from "@/lib/ab";

import { useDocumentAccess } from "@/hooks/useDocumentAccess";
import { StrictDocumentPaywall } from "@/components/wizard/StrictDocumentPaywall";
import { AnonymousPreviewNotice } from "@/components/wizard/AnonymousPreviewNotice";
import { PostDownloadUpgradeBanner } from "@/components/wizard/PostDownloadUpgradeBanner";
import { OpsHintBar } from "@/components/wizard/OpsHintBar";

import { ResultActionBar } from "@/components/wizard/ResultActionBar";
import { ResultShell } from "@/components/wizard/ResultShell";
import { useEnterFocusNext } from "@/hooks/useEnterFocusNext";

import { BlurredPreviewOverlay } from "@/components/wizard/BlurredPreviewOverlay";
import {
  WizardFeedbackPrompt,
  shouldShowWizardFeedbackPrompt,
  markWizardFeedbackPromptShown,
} from "@/components/wizard/WizardFeedbackPrompt";
import { MessageSquarePlus } from "@/icons";
import { useActivationDraft } from "@/hooks/useActivationDraft";
import { currentDraftRoute } from "@/lib/activationDraft";
import { safeReturnPath } from "@/lib/safeRoute";
import { KitPrefillBridge } from "@/components/wizard/KitPrefillBridge";



interface AIResult {
  risk: {
    level: RiskLevel;
    score: number;
    summary: string;
    issues: RiskIssue[];
    recommendations: string[];
  };
  contract: GeneratedContract;
  /**
   * Q4a — подписан манифест за качество от сървъра. Пази се заедно с резултата
   * и се маха при ВСЯКА локална редакция на документа, за да не се подава
   * остарял манифест (сървърът и без това би го отхвърлил по отпечатък).
   */
  quality_manifest?: unknown;
  /**
   * ЕДНОКРАТЕН пропуск за ревизия, издаден от СЪРВЪРА за точно този текст.
   * Пази се само докато документът е непроменен — при локална редакция пада
   * заедно с манифеста.
   */
  review_grant?: unknown;
}

export default function WizardPage() {
  const { sectorId } = useParams();
  const [searchParams] = useSearchParams();
  const docName = searchParams.get("doc") || undefined;
  const returnTo = safeReturnPath(searchParams.get("returnTo"), "/catalog");
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
    // If this document has a rich QuestionGraph, feed those (deeper, conditional)
    // questions into the classic wizard renderer instead of the default set.
    // Both flows converge into the same generate-contract / apply-corrections
    // pipeline downstream — no separate UI, no separate logic.
    const graph = docName ? getQuestionGraph(slugify(docName)) : null;
    const questions = graph
      ? adaptGraphToWizardQuestions(graph)
      : buildQuestions(baseSector, subWizard);
    return {
      ...baseSector,
      contractName: subWizard?.contractName || baseSector.contractName,
      parties: subWizard?.parties || baseSector.parties,
      questions,
    };
  }, [baseSector, subWizard, docName]);

  const storageKey = useMemo(
    () => (baseSector ? `wizard:${baseSector.id}:${docName ?? "_"}` : null),
    [baseSector, docName]
  );

  // Restore persisted state (answers, step, result, signature, etc.).
  // Use localStorage so progress survives navigation to /auth и затваряне на таб.
  // Черновата има срок на валидност (7 дни) — след това се изтрива, за да не
  // остават лични данни в браузъра за неопределено време.
  const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
  const persisted = useMemo(() => {
    if (!storageKey) return null;
    try {
      const raw = localStorage.getItem(storageKey) ?? sessionStorage.getItem(storageKey);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      if (parsed?.ts && Date.now() - parsed.ts > DRAFT_TTL_MS) {
        localStorage.removeItem(storageKey);
        sessionStorage.removeItem(storageKey);
        return null;
      }
      return parsed;
    } catch { return null; }
  }, [storageKey]);


  const { user: authUser, loading: authLoading } = useAuth();
  const [answers, setAnswers] = useState<Record<string, string>>(persisted?.answers ?? {});
  const [stepIdx, setStepIdx] = useState<number>(persisted?.stepIdx ?? 0);
  const [generating, setGenerating] = useState(false);
  /** Синхронен щит срещу двойно кликване по бутона за генериране. */
  const generatingRef = useRef(false);
  /** Идентификатор на текущия опит — по-стар отговор се игнорира. */
  const genRunRef = useRef(0);
  const [genStepIdx, setGenStepIdx] = useState(0);

  // Диалог за лични / чувствителни данни. Показва се САМО при твърд блокаж
  // (специална категория данни). При висок риск (ЕГН/IBAN/лична карта/3+ имена)
  // сървърът изисква изрично GDPR съгласие — показваме инлайн панел с
  // конкретните открити данни и едно ясно действие за продължаване.
  const [sensitiveOpen, setSensitiveOpen] = useState(false);
  const [sensitiveBlocked, setSensitiveBlocked] = useState(false);
  const [sensitiveClass, setSensitiveClass] = useState<ClassificationSummary | null>(null);
  /** Сървърът изисква изрично съгласие — показваме панел с конкретните полета. */
  const [consentRequired, setConsentRequired] = useState(false);
  /** Последният опит за генериране е неуспешен → бутонът става „Опитай отново". */
  const [genFailed, setGenFailed] = useState(false);
  /** Спряно генериране (квота / потвърждение) → ясен модал с 1-click изход. */
  const [blockedReason, setBlockedReason] = useState<BlockedReason | null>(null);


  const [correctionsPending, setCorrectionsPending] = useState<CorrectionsSelection | null>(null);
  const [result, setResult] = useState<AIResult | null>(persisted?.result ?? null);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const [applyingCorrections, setApplyingCorrections] = useState(false);
  const [appliedNotes, setAppliedNotes] = useState<string[] | undefined>(persisted?.appliedNotes);
  const [attemptedNext, setAttemptedNext] = useState(false);
  const questionCardRef = useRef<HTMLDivElement>(null);
  /** Панелът за GDPR съгласие — скролираме към него, когато се появи. */
  const consentRef = useRef<HTMLDivElement | null>(null);
  /** Блокът с готовия документ — фокус след успешно генериране. */
  const resultRef = useRef<HTMLDivElement | null>(null);
  /** Последно избраният формат — първа опция при следващо сваляне. */
  const [preferredFmt, setPreferredFmt] = useState<DocFormat>(() => getPreferredFormat());
  /** Контекстен модал при сваляне от нерегистриран потребител. */
  const [downloadModal, setDownloadModal] = useState<{ open: boolean; format: DocFormat }>({
    open: false,
    format: "pdf",
  });
  /** Височина на софтуерната клавиатура — повдига фиксираната лента, за да няма застъпване. */
  const keyboardInset = useKeyboardInset();

  /**
   * Дискретен тост след успешно генериране с двете действия за сваляне,
   * за да не е нужно превъртане до долната лента.
   */
  const showReadyToast = () => {
    const order: DocFormat[] = preferredFmt === "docx" ? ["docx", "pdf"] : ["pdf", "docx"];
    toast.custom(
      (id) => (
        <div className="w-[min(92vw,360px)] rounded-xl border border-gold/30 bg-card px-4 py-3 shadow-elegant">
          <p className="text-sm font-semibold text-foreground">Документът е готов</p>
          <p className="mt-0.5 text-xs text-muted-foreground">Свали го в предпочитания формат.</p>
          <div className="mt-2.5 flex gap-2">
            {order.map((f, i) => (
              <Button
                key={f}
                size="sm"
                variant={i === 0 ? "default" : "outline"}
                className={
                  i === 0
                    ? "h-9 flex-1 bg-gradient-gold text-navy hover:shadow-gold"
                    : "h-9 flex-1 border-gold/40 hover:bg-gold/10 hover:text-gold"
                }
                onClick={() => {
                  toast.dismiss(id);
                  void handleExport(f);
                }}
              >
                {f.toUpperCase()}
              </Button>
            ))}
          </div>
        </div>
      ),
      { duration: 9000 },
    );
  };
  const handleEnterFocusNext = useEnterFocusNext();


  const focusFirstEmpty = () => {
    requestAnimationFrame(() => {
      const root = questionCardRef.current;
      if (!root) return;
      const candidates = Array.from(
        root.querySelectorAll<HTMLElement>(
          'input:not([type="hidden"]):not([disabled]), textarea:not([disabled]), [role="combobox"]:not([disabled])',
        ),
      );
      const target =
        candidates.find((el) => {
          if (el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement) {
            return !el.value?.trim();
          }
          // Radix Select trigger
          return el.getAttribute("data-placeholder") != null || !el.textContent?.trim();
        }) ?? candidates[0];
      if (target) {
        target.scrollIntoView({ behavior: "smooth", block: "nearest" });
        setTimeout(() => {
          try { target.focus({ preventScroll: true }); } catch { /* ignore */ }
        }, 300);
      } else {
        root.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  };

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

  /**
   * Минимален изричен контекст за независимата ревизия: само СЪЩЕСТВЕНИ
   * попълнени решения на потребителя. Полета за лични данни и контакти НЕ
   * влизат — те се вписват локално и не са предмет на ревизията.
   *
   * Дълъг отговор НЕ се реже по средата — отрязана стойност може да преобърне
   * смисъла (например отрицание). Такова решение просто не влиза в контекста.
   */
  const reviewContext = useMemo<ReviewContextInput | null>(() => {
    if (!sector) return null;
    const PERSONAL_KEY = /egn|eik|iban|bulstat|phone|telefon|email|mail|address|adres|passport|lk_|id_card|име|адрес|телефон|имейл|егн|лична карта|банкова сметка/i;
    const flat = flattenQuestions(visibleQuestions);
    const decisions: ReviewContextInput["decisions"] = [];
    for (const q of flat) {
      if (decisions.length >= 20) break;
      const value = (answers[q.id] ?? "").trim();
      if (!value) continue;
      if (PERSONAL_KEY.test(`${q.id} ${q.label ?? ""}`)) continue;
      const label = (q.label ?? q.id).trim();
      if (!label || label.length > 120 || value.length > 400) continue;
      decisions.push({ label, value });
    }
    if (decisions.length === 0) return null;
    return { decisions };
  }, [sector, visibleQuestions, answers]);

  /**
   * Скрит преглед за екрана за потвърждение: показваме какво човекът вече е
   * попълнил (с маскирани лични данни) и какво липсва, вместо празна спирачка.
   */
  const draftOutline = useMemo(
    () =>
      buildDraftOutline(
        flattenQuestions(visibleQuestions).map((q) => ({
          id: q.id,
          label: q.label ?? q.id,
          value: answers[q.id] ?? "",
        })),
      ),
    [visibleQuestions, answers],
  );

  /**
   * Ревизията получава контекста, с който документът е РЕАЛНО генериран.
   * Ако потребителят промени отговорите след това, приетият контекст се
   * обезсилва и не се подава — нищо не се домисля за възстановени резултати.
   */
  const [acceptedReviewContext, setAcceptedReviewContext] = useState<
    { key: string; context: ReviewContextInput | null } | null
  >(null);
  const reviewContextKey = useMemo(() => JSON.stringify(reviewContext), [reviewContext]);
  const reviewContextRef = useRef<{ key: string; context: ReviewContextInput | null }>({
    key: reviewContextKey,
    context: reviewContext,
  });
  reviewContextRef.current = { key: reviewContextKey, context: reviewContext };
  const acceptedContextForReview = acceptedReviewContext
    ? pickAcceptedReviewContext(acceptedReviewContext, reviewContextKey)
    : null;




  // Интелигентни стойности по подразбиране — попълват се веднъж при първо
  // отваряне (днешна дата за полета за дата, София за населено място), за да
  // намалим ръчното въвеждане в началото на формата.
  const defaultsApplied = useRef(false);
  useEffect(() => {
    if (defaultsApplied.current || !sector) return;
    defaultsApplied.current = true;
    const today = new Date().toISOString().slice(0, 10);
    const flat = flattenQuestions(sector.questions);
    const patch: Record<string, string> = {};
    // Само датата на сключване/подписване се предпопълва с днешна дата.
    // Всички останали дати (краен срок, падеж, прекратяване, раждане, брак…)
    // трябва да се въведат съзнателно от потребителя.
    const SIGN_DATE = /(^|_)(contract_date|sign(ing)?_date|date_signed|conclusion_date|start_date|issue_date)($|_)|дата на (сключване|подписване|съставяне|издаване)|дата на договора/;
    const NEVER_DEFAULT = /end|due|expir|termination|deadline|birth|marriage|payment|delivery|краен|падеж|прекратяване|изтичане|раждане|брак|плащане|доставка/;
    for (const f of flat) {
      const key = `${f.id} ${f.label ?? ""}`.toLowerCase();
      if (f.type === "date" && SIGN_DATE.test(key) && !NEVER_DEFAULT.test(key)) {
        patch[f.id] = today;
      } else if (

        (f.type === "text" || f.type === "select" || f.type === "radio") &&
        /(^|_)(city|town)|град|населено място|местоположение|сключен в/.test(key) &&
        (!f.options || f.options.includes("София"))
      ) {
        patch[f.id] = "София";
      }
    }
    // Интелигентни стойности за най-популярните документи (МПС пълномощно,
    // наем на гараж, учредителен акт на ЕООД) — намаляват отпадането на
    // първото поле.
    Object.assign(patch, { ...smartDefaultsFor(docName, flat as any), ...patch });
    const missing = Object.fromEntries(
      Object.entries(patch).filter(([id]) => !answers[id]?.trim()),
    );
    if (Object.keys(missing).length > 0) setAnswers((prev) => ({ ...missing, ...prev }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sector, docName]);



  if (!sector) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
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
  /** Кратко име на текущата стъпка за индикатора „Стъпка X от N: …“. */
  const stepLabel = (current?.label ?? "").replace(/\s*[:?]\s*$/, "").slice(0, 48);


  const GEN_STEPS = [
    "Проверяваме въведената информация…",
    "Подбираме приложимите правни клаузи…",
    "Комплектоваме структурата на договора…",
    "Съставяме текста и форматираме раздели…",
    "Извършваме оценка на риска…",
    "Финализираме документа — почти готово…",
  ];

  const handleGenerate = async (userConfirmed = false) => {
    // Предварителен режим: без AI генериране, докато не е доказано съответствие.
    if (!canStartNewProcessing("document_generation")) {
      openPrelaunchWaitlist("document_generation");
      return;
    }
    // Anonymous visitors may generate a read-only preview (server enforces a
    // 1/24h taste limit). Login is required only for save/export/signing.
    //
    // Защита от двойно кликване: ref-ът се проверява синхронно, така че два
    // бързи клика в рамките на един render цикъл не могат да пуснат две
    // заявки (setGenerating е асинхронен и не е достатъчен).
    if (generatingRef.current) return;
    generatingRef.current = true;
    const runId = ++genRunRef.current;
    /** true, ако потребителят е отказал или е стартирал по-нов опит. */
    const isStale = () => genRunRef.current !== runId;
    setGenerating(true);
    setGenFailed(false);
    markDocSelected();
    trackGenerate("started", { doc_key: docKey, source: "wizard" });
    setGenStepIdx(0);
    const interval = setInterval(() => {
      setGenStepIdx((i) => (i + 1) % GEN_STEPS.length);
    }, 5000);
    // Стабилен ключ за ТАЗИ заявка: същият при повторен опит, двойно
    // натискане или загубена връзка — сървърът не таксува втори път.
    let opScope: string | null = null;
    try {

      // Приетият контекст се СНИМА в началото на заявката (преди първото
      // изчакване) — по-късни редакции не могат да го подменят.
      const requestedReviewContext: { key: string; context: ReviewContextInput | null } = {
        key: reviewContextRef.current.key,
        context: captureReviewContext(reviewContextRef.current.context),
      };
      const flatQs = flattenQuestions(visibleQuestions);
      const arbitrationCourt = arbitration.enabled ? getCourtById(arbitration.courtId) : undefined;
      const genPayload = {
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
        userConfirmed,
      };
      // ПРЕГРАДА ПРЕДИ МРЕЖАТА: ограничени идентификатори (ЕГН, IBAN, банкова
      // сметка, лична карта) не се изпращат. Празни полета и заместители като
      // [ЕГН] минават — генерирането на бланки остава напълно достъпно.
      {
        const restricted = findRestrictedIdentifiersDeep({ answers, documentName: docName });
        if (restricted.length > 0) {
          trackGenerate("blocked", { doc_key: docKey, source: "wizard", reason: "restricted_identifiers" });
          toast.error("Заменете личните данни, преди да продължим", {
            description: restrictedIdentifierMessage(restricted),
            duration: 14000,
          });
          return;
        }
      }
      // НЕПРОЗРАЧЕН обхват от ЦЕЛИЯ товар: в браузърното хранилище не влиза
      // суров потребителски текст, а ключът е един и същ при повторен опит.
      const opPayloadScope = await opaqueOpScope("generate_contract", genPayload);
      opScope = `op:${opPayloadScope}`;
      const operationId = getStableOpKey(opScope);
      const job = await generateContractJob<AIResult & { error?: string; code?: string; requires_login?: boolean; classification?: ClassificationSummary }>(
        {
          ...genPayload,
          operation_id: operationId,
        },
        {
          isStale,
          onRetry: (attempt, max) => {
            if (isStale()) return;
            toast.loading(`Опитваме отново… (${attempt}/${max})`, {
              id: "gen-retry",
              description: "Връзката прекъсна за момент — данните ви са запазени.",
            });
          },
          onReattach: () => {
            if (isStale()) return;
            toast.loading("Продължаваме предишното генериране…", {
              id: "gen-retry",
              description: "Открихме незавършен опит за същите данни — няма да бъдете таксувани два пъти.",
            });
          },
        },
      );
      const { data, error, correlationId } = job;
      if ((data as { code?: string } | null)?.code === GENERATION_PRELAUNCH_CODE) {
        openPrelaunchWaitlist("document_generation");
        return;
      }
      const genMeta = {
        correlation_id: correlationId,
        attempts: job.startAttempts ?? 1,
        reattached: !!job.reattached,
      };

      // Отказан или изместен опит — не пипаме UI състоянието.
      if (isStale()) return;
      if (data?.code === "quota_exceeded") {
        trackGenerate("blocked", { doc_key: docKey, source: "wizard", reason: "quota_exceeded", ...genMeta });
        trackPaywallShown("quota", { doc_key: docKey, source: "wizard" });
        setBlockedReason("quota_exceeded");
        return;
      }
      if (data?.requires_login) {
        trackGenerate("blocked", { doc_key: docKey, source: "wizard", reason: "requires_login", ...genMeta });
        goAuth({ action: "Генериране на документа", onSuccess: () => handleGenerate(userConfirmed) });
        return;
      }
      // Лични / чувствителни данни: сървърът иска изрично потвърждение или
      // блокира операцията. Показваме диалога вместо суров текст на грешка.
      const sensitive = await parseSensitiveResponse(error, data);
      if (isSpecialCategoryBlocked(sensitive)) {
        trackGenerate("blocked", { doc_key: docKey, source: "wizard", reason: "sensitive_blocked", ...genMeta });
        setSensitiveClass(sensitive?.classification ?? null);
        setSensitiveBlocked(true);
        setSensitiveOpen(true);
        return;
      }
      if (isConfirmationRequired(sensitive) || data?.error === "needs_confirmation") {
        // Това НЕ е технически провал, а GDPR стъпка: сървърът е открил данни
        // с висок риск (ЕГН, IBAN, лична карта…). Показваме инлайн панел с
        // конкретните открити полета и едно ясно действие за продължаване.
        // Отчита се като „blocked" (продуктова преграда), НЕ като doc_generate_fail.
        trackGenerate("blocked", { doc_key: docKey, source: "wizard", reason: "needs_confirmation", ...genMeta });
        setSensitiveClass(sensitive?.classification ?? data?.classification ?? null);
        setSensitiveBlocked(false);
        setConsentRequired(true);
        toast.message("Нужно е потвърждение за личните данни", {
          description: "Вижте панела за съгласие при въпросите и потвърдете, за да продължим.",
        });
        // На мобилно панелът може да е извън екрана — скролираме до него.
        setTimeout(() => consentRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 120);
        return;
      }
      if (error || !data || (data as { error?: string }).error) {
        const err = new Error((data as { error?: string })?.error || error?.message || "Неуспешно създаване");
        (err as { cid?: string }).cid = error?.correlationId ?? correlationId;
        (err as { httpStatus?: number }).httpStatus = error?.status;
        // Типизираната грешка от job слоя — за точен reason и правилен retry UX.
        (err as { gen?: GenerationError }).gen =
          job.generationError ??
          classifyGenerationError({ error: error ?? { message: err.message }, data: data ?? null });
        (err as { genMeta?: typeof genMeta }).genMeta = genMeta;
        throw err;
      }
      // ДОКАЗАН КРАЕН УСПЕХ: единственият момент, в който ключът пада.
      if (opScope) releaseStableOpKey(opScope);
      const payload = data as AIResult;
      if (bilingualMode && payload.contract) payload.contract.bilingual = true;
      setResult(payload);
      // Приетият контекст е този, с който заявката е ИЗПРАТЕНА.
      setAcceptedReviewContext(requestedReviewContext);
      setConsentRequired(false);
      trackGenerate("success", { doc_key: docKey, source: "wizard", ...genMeta });
      trackResultViewed({ doc_key: docKey, source: "wizard" });
      // Качество на изхода: „чист" документ = без открити пропуски/риск бележки.
      {
        const issues =
          (payload.risk?.issues?.length ?? 0) +
          ((payload as { missing?: unknown[] }).missing?.length ?? 0);
        trackReviewResult(issues === 0, issues, { doc_key: docKey, source: "wizard" });
      }

      // Trigger AI disclaimer once per session on first document creation.
      ensureAIDisclaimerAccepted().catch(() => {});
      showReadyToast();
      // Резултатът започва отгоре — без хаотично „мятане" по средата на екрана.
      requestAnimationFrame(() => {
        const top = resultRef.current
          ? resultRef.current.getBoundingClientRect().top + window.scrollY - 72
          : 0;
        window.scrollTo({ top: Math.max(0, top), behavior: "smooth" });
      });
    } catch (e: any) {
      if (isStale()) return;
      const emsg = String(e?.message || e);
      const cid: string | undefined = e?.cid;
      const httpStatus: number | undefined = e?.httpStatus;
      const meta = (e?.genMeta as { correlation_id?: string; attempts?: number; reattached?: boolean } | undefined) ?? {
        correlation_id: cid,
      };

      // Незаконно/забранено съдържание има собствен диалог — това е преграда, не провал.
      if (await (await import("@/lib/blockedContent")).handleBlockedIllegalContent(e)) {
        trackGenerate("blocked", { doc_key: docKey, source: "wizard", reason: "blocked_content", ...meta });
        return;
      }

      // Една типизирана грешка → reason за таблата, съобщение и retry политика.
      const gen: GenerationError =
        (e?.gen as GenerationError | undefined) ??
        classifyGenerationError({
          thrownMessage: emsg,
          error: { message: emsg, status: httpStatus, correlationId: cid },
        });
      if (!gen.gate) setGenFailed(true);
      trackGenerate(gen.gate ? "blocked" : "fail", {
        doc_key: docKey,
        source: "wizard",
        reason: gen.code,
        error_class: errorClassOf(gen.code),
        http_status: gen.httpStatus,
        retryable: gen.retryable,
        ...meta,
      });

      if (gen.code === "requires_login") {
        goAuth({ action: "Генериране на документа", onSuccess: () => handleGenerate(userConfirmed) });
        return;
      }
      if (gen.code === "quota_exceeded") {
        trackPaywallShown("quota", { doc_key: docKey, source: "wizard" });
        setBlockedReason("quota_exceeded");
        return;
      }
      if (gen.code === "operation_conflict") {
        // Ключът НЕ важи повече за тази заявка — освобождаваме го. Въведените
        // данни се пазят непокътнати; следващото ИЗРИЧНО действие ще получи
        // нов ключ автоматично. Без автоматично препращане.
        if (opScope) releaseStableOpKey(opScope);
        toast.error("Заявката се промени. Изпратете отново.", {
          description: "Данните Ви са запазени — натиснете отново „Генерирай“, за да продължим.",
        });
        return;
      }

      const retryAction = gen.retryable
        ? { label: "Опитай отново", onClick: () => void handleGenerate(userConfirmed) }
        : undefined;
      const cidSuffix = cid ? ` (код: ${cid.slice(0, 8)})` : "";
      const TITLES: Partial<Record<GenerationError["code"], string>> = {
        network: "Връзката бе прекъсната",
        timeout: "Отне повече от обичайното",
        rate_limited: "Твърде много заявки",
        ai_parse_failed: "AI отговорът беше невалиден",
        ai_upstream: "AI услугата е временно недостъпна",
        server_error: "Грешка на сървъра",
      };
      toast.error(TITLES[gen.code] ?? "Възникна грешка", {
        description: `${gen.message}${gen.retryable ? "" : cidSuffix}`,
        ...(retryAction ? { action: retryAction } : {}),
        duration: gen.retryable ? 12000 : 8000,
      });



    } finally {
      clearInterval(interval);
      toast.dismiss("gen-retry");
      // Ако потребителят е отказал (или е стартиран нов опит), новото
      // състояние вече е зададено — не го презаписваме.
      if (!isStale()) {
        generatingRef.current = false;
        setGenerating(false);
      }
    }
  };

  /** Прекратява текущото генериране от гледна точка на UI. */
  const cancelGeneration = () => {
    if (!generatingRef.current) return;
    genRunRef.current += 1;
    generatingRef.current = false;
    setGenerating(false);
    trackGenerate("blocked", { doc_key: docKey, source: "wizard", reason: "user_cancelled" });
    toast.message("Генерирането е прекратено", {
      description: "Попълнените данни са запазени — можете да опитате отново.",
    });
  };


  const user = authUser;
  /**
   * Жива референция към текущия потребител: onSuccess callback-ите от инлайн
   * входа са затваряния от по-стар рендер (user === null). Четенето през ref
   * гарантира, че след успешен вход повторното извикване вижда новата сесия,
   * вместо отново да отвори модала.
   */
  const userRef = useRef(user);
  userRef.current = user;
  const [savedDocId, setSavedDocId] = useState<string | undefined>(persisted?.savedDocId);
  const [isPro, setIsPro] = useState(false);
  const [freeWaveAvailable, setFreeWaveAvailable] = useState(false);
  const [signature, setSignature] = useState<SignatureData>(
    persisted?.signature ?? { name_a: "", name_b: "", city: "", date: "" }
  );
  const [customTitle, setCustomTitle] = useState<string>(persisted?.customTitle ?? "");
  // „Ще попълня личните данни, когато сваля" — изключва полетата за лични
  // данни от export-гейта и от обхвата на автоматичната AI ревизия.
  const [fillLaterPersonal, setFillLaterPersonal] = useState<boolean>(
    () => getFillLaterPersonalData(),
  );
  const [contactId, setContactId] = useState<string>(persisted?.contactId ?? "");
  const [contacts, setContacts] = useState<Array<{ id: string; name: string; type?: string }>>([]);
  const [arbitration, setArbitration] = useState<ArbitrationValue>(
    persisted?.arbitration ?? { enabled: false }
  );

  /**
   * Реално действие на потребителя (за разлика от служебното предпопълване със
   * smart defaults при отваряне на екрана). Само след него може да се създаде
   * първа чернова — иначе всяко отваряне би оставяло ред на сървъра.
   */
  const interactedRef = useRef(false);
  const markInteracted = useCallback(() => { interactedRef.current = true; }, []);

  /**
   * Непрекъснатост на активацията: съдържанието на черновата се пази в текущия
   * таб + на сървъра, а в localStorage остава само указател без лични данни.
   * Така прогресът се запазва при вход/регистрация, OAuth пренасочване и нов
   * таб от имейл линка. При изключен флаг остава старото поведение.
   */
  const activation = useActivationDraft({
    flow: "wizard",
    docKey: storageKey ?? undefined,
    route: currentDraftRoute(),
    onRestore: (payload) => {
      // Възстановена чернова вече е резултат от предишно действие — синхронизира се.
      interactedRef.current = true;
      const meta = (payload.meta ?? {}) as Record<string, unknown>;
      if (payload.answers) setAnswers(payload.answers as Record<string, string>);
      if (typeof meta.stepIdx === "number") setStepIdx(meta.stepIdx);
      if (payload.result) setResult(payload.result as AIResult);
      if (payload.signature) setSignature(payload.signature as SignatureData);
      if (typeof meta.savedDocId === "string") setSavedDocId(meta.savedDocId);
      if (Array.isArray(meta.appliedNotes)) setAppliedNotes(meta.appliedNotes as string[]);
      if (typeof meta.customTitle === "string") setCustomTitle(meta.customTitle);
      if (typeof meta.contactId === "string") setContactId(meta.contactId);
      if (meta.arbitration) setArbitration(meta.arbitration as ArbitrationValue);
    },
  });

  // Persist wizard state on every relevant change so navigation to /auth or /account doesn't lose progress.
  useEffect(() => {
    if (!storageKey) return;
    const snapshot = { v: 1, ts: Date.now(), answers, stepIdx, result, signature, savedDocId, appliedNotes, customTitle, contactId, arbitration };
    if (activation.active) {
      // Каноничен модел — лични данни не влизат в localStorage.
      activation.persist(
        { answers, result, signature, meta: snapshot },
        {
          stepIdx,
          hasResult: !!result,
          userInitiated:
            interactedRef.current || stepIdx > 0 || !!result || !!activation.pointer,
        },
      );
      try {
        localStorage.removeItem(storageKey);
        sessionStorage.removeItem(storageKey);
      } catch { /* ignore */ }
      return;
    }
    try {
      localStorage.setItem(storageKey, JSON.stringify(snapshot));
      sessionStorage.removeItem(storageKey);
    } catch {}
    // Зависимостите са отделните стабилни функции, не целият обект — иначе
    // ефектът би се изпълнявал (и записвал) при всяко рендиране.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, activation.active, activation.persist, answers, stepIdx, result, signature, savedDocId, appliedNotes, customTitle, contactId, arbitration]);

  /** Изчиства локалната чернова (лични данни) от браузъра. */
  const clearDraft = useCallback(() => {
    activation.discard();
    if (!storageKey) return;
    try {
      localStorage.removeItem(storageKey);
      sessionStorage.removeItem(storageKey);
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, activation.discard]);



  // Build a redirect URL that preserves the current wizard route + query.
  const wizardHref = window.location.pathname + window.location.search;
  /**
   * Инлайн вход вместо пренасочване към `/auth`. URL-ът и попълнените отговори
   * остават непокътнати, а подаденото действие продължава автоматично след
   * успешна автентикация.
   */
  const goAuth = (opts?: { action?: string; intent?: string; onSuccess?: () => void }) => {
    openInlineAuth({
      action: opts?.action,
      intent: opts?.intent ?? "generate",
      docKey,
      source: "wizard",
      onSuccess: opts?.onSuccess,
    });
  };

  const goSubscription = () =>
    navigate(`/account?tab=subscription&redirect=${encodeURIComponent(wizardHref)}`);
  // Stable document key for strict-unlock lookups (user-scoped, cross-session).
  const docKey = useMemo(() => {
    const base = docName ?? baseSector?.contractName ?? baseSector?.id ?? "doc";
    return `${baseSector?.id ?? "sector"}::${slugify(base)}`;
  }, [baseSector, docName]);
  const docAccess = useDocumentAccess(docKey);
  const [showPaywall, setShowPaywall] = useState(false);
  const [feedbackOpen, setFeedbackOpen] = useState(false);

  /**
   * Beta-only nudge: after the user completes a meaningful action on a
   * generated document (save / download), softly ask for feedback. Capped to
   * ≤3 shows per user with a min-hours cooldown between them.
   */
  const maybeAskForFeedback = (trigger: "save" | "download" | "manual") => {
    if (trigger === "manual") {
      setFeedbackOpen(true);
      return;
    }
    if (!result) return;
    if (!shouldShowWizardFeedbackPrompt(!!user)) return;
    markWizardFeedbackPromptShown();
    // Small delay so the success toast lands first.
    window.setTimeout(() => setFeedbackOpen(true), 900);
  };

  // Exit-intent: when the user has meaningful progress (answers or a generated
  // draft) but hasn't saved successfully, softly ask for feedback on leave.
  // Triggers: mouseleave via top edge (desktop), tab hidden (mobile), and
  // back-navigation (popstate). Uses the same capping/cooldown rules.
  const hasUnsavedProgress =
    !savedDocId && (!!result || Object.keys(answers || {}).length > 0);
  useEffect(() => {
    if (!hasUnsavedProgress) return;
    if (feedbackOpen) return;
    let triggered = false;
    const fire = () => {
      if (triggered) return;
      if (!shouldShowWizardFeedbackPrompt(!!user)) return;
      triggered = true;
      markWizardFeedbackPromptShown();
      setFeedbackOpen(true);
    };
    const onMouseOut = (e: MouseEvent) => {
      if (e.relatedTarget || (e as any).toElement) return;
      if (e.clientY > 12) return;
      fire();
    };
    const onVisibility = () => {
      if (document.visibilityState === "hidden") fire();
    };
    // Push a sentinel state so a single Back press triggers popstate without
    // actually leaving the page; if the user presses Back again, they leave.
    try { window.history.pushState({ wizardExitGuard: true }, ""); } catch {}
    const onPopState = () => fire();
    const onBeforeUnload = () => {
      // Best-effort: on tab close we can't show a modal, but we can still
      // mark the shown counter so the next visit shows the request early.
      if (!triggered && shouldShowWizardFeedbackPrompt(!!user)) {
        markWizardFeedbackPromptShown();
      }
    };
    document.addEventListener("mouseout", onMouseOut);
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("popstate", onPopState);
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => {
      document.removeEventListener("mouseout", onMouseOut);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("popstate", onPopState);
      window.removeEventListener("beforeunload", onBeforeUnload);
    };
  }, [hasUnsavedProgress, feedbackOpen, user]);








  useEffect(() => {
    if (!user) { setIsPro(false); setFreeWaveAvailable(false); setContacts([]); return; }
    import("@/hooks/useQuota").then(({ fetchQuotaCached }) => fetchQuotaCached(user.id))
      .then((data) => {
        if (!data) return;
        setIsPro(data.plan === "pro" || (!!data.pro_until && new Date(data.pro_until) > new Date()));
        // Free plan: up to 2 корекционни вълни.
        const freeWavesUsed = Number((data as any).corrections_free_used_count ?? 0);
        setFreeWaveAvailable(freeWavesUsed < 2);
        // Оставащи операции = месечен лимит − изразходвани + закупени пакети.
        const cap = Number(data.plan_ops_cap ?? FREE_OPS_PER_MONTH);
        const used = Number(data.monthly_total_used ?? 0);
        const topup = Number(data.topup_ops_balance ?? 0);
        setOpsLeft(Math.max(0, cap - used) + Math.max(0, topup));
      });
    supabase.from("contacts").select("id, name, type").is("deleted_at", null).order("created_at", { ascending: false })
      .then(({ data }) => setContacts((data as any) ?? []));
  }, [user]);

  // Auto-seed the editable title once the contract is generated.
  useEffect(() => {
    if (result && !customTitle) setCustomTitle(result.contract.title);
    if (result) trackEvent("wizard_complete", { sectorId, doc: docName });
  }, [result, customTitle, sectorId, docName]);

  // Track wizard_start once on mount (GA page-level signal only).
  // `document_selected` НЕ се отчита тук: mount-ът се случва и при SEO трафик,
  // prefetch и презареждане. Той се отчита при първото съзнателно действие —
  // първи отговор във въпросника (виж markDocSelected).
  useEffect(() => {
    applyAbOverridesFromUrl(window.location.search);
    trackEvent("wizard_start", { sectorId, doc: docName });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const docSelectedRef = useRef(false);
  /** Първо реално действие на потребителя върху документа → document_selected (еднократно). */
  const markDocSelected = useCallback(() => {
    markInteracted();
    if (docSelectedRef.current) return;
    docSelectedRef.current = true;
    trackDocStart({ doc_key: docKey, source: "wizard", sector: sectorId });
  }, [docKey, sectorId, markInteracted]);

  // A/B: CTA „Виж бърз преглед сега" в междинните стъпки.
  const quickPreviewVariant = useMemo(() => getVariant("quick_preview"), []);
  const showQuickPreviewCta = quickPreviewVariant === "variant";
  const quickPreviewEligible = !isLast && canNext && !generating && !result;
  const exposedRef = useRef(false);
  useEffect(() => {
    if (!quickPreviewEligible || exposedRef.current) return;
    exposedRef.current = true;
    trackAbExposure("quick_preview", { doc_key: docKey, source: "wizard", step_idx: stepIdx });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quickPreviewEligible]);


  const handleExport = async (format: "pdf" | "docx") => {
    if (!result) return;
    if (!userRef.current) {
      // Контекстен модал с ROI сравнение и бърза регистрация — без напускане
      // на уизарда и без загуба на въведените данни.
      trackAuthPromptShown({ doc_key: docKey, source: "wizard", action: `download_${format}` });
      setDownloadModal({ open: true, format });
      return;
    }
    // Strict document paywall — free users must subscribe or buy a single unlock
    // (цената идва от ENTRY_PACK_CONFIG в @/lib/pricing).
    if (!docAccess.canDownload) {
      trackEvent("strict_paywall_shown", { source: `download_${format}`, doc_key: docKey });
      trackPaywallShown("strict_unlock", { doc_key: docKey, source: "wizard", format });
      setShowPaywall(true);
      return;
    }
    setPreferredFormat(format);
    setPreferredFmt(format);
    setExporting(format);
    try {
      // Изграждаме списък със страни само по РОЛЯ и ФОРМА — без имена / ЕГН / лични данни.
      // Имената се попълват от потребителя офлайн в готовия документ (placeholder-и).
      const roleA = subWizard?.parties?.a || sector.parties?.a || "СТРАНА А";
      const roleB = subWizard?.parties?.b || sector.parties?.b || "СТРАНА Б";
      const partiesArr = [
        { role: roleA, name: "", type: answers.party_a_type },
        { role: roleB, name: "", type: answers.party_b_type },
        ...parseExtraPartyTypes(answers.party_a_extra).map((type) => ({ role: roleA, name: "", type })),
        ...parseExtraPartyTypes(answers.party_b_extra).map((type) => ({ role: roleB, name: "", type })),
      ].filter((p) => !!p.type);

      const sigPayload: SignatureInfo = {
        name_a: signature.name_a || "",
        name_b: signature.name_b || "",
        city: signature.city,
        date: signature.date,
        image_a: isPro ? signature.image_a : undefined,
        image_b: isPro ? signature.image_b : undefined,
        parties: partiesArr.length > 0 ? partiesArr : undefined,
      };
      const finalTitle = (customTitle || result.contract.title).trim() || result.contract.title;
      const contractWithSig: GeneratedContract = { ...result.contract, title: finalTitle, signature: sigPayload };
      const res = await downloadDocument({
        analytics_source: "wizard",
        kind: "contract",
        format,
        title: finalTitle,
        payload: contractWithSig,
        source_id: sector.id,
        contact_id: contactId || undefined,
        saved_document_id: savedDocId,
        doc_key: docKey,
      });
      if (!res.ok) {
        if (res.error === "disclaimer_cancelled" || res.error === "unfilled_placeholders") return;
        if (res.error === "strict_paywall") {
          trackEvent("strict_paywall_shown", { source: `download_${format}`, doc_key: docKey });
          trackPaywallShown("strict_unlock", { doc_key: docKey, source: "wizard", format });
          setShowPaywall(true);
          return;
        }
        if (res.error === "quota_exceeded") {
          toast.error("Изчерпан безплатен лимит", {
            description: `${roiSubtitle("professional")} с план ${PRICING_PLANS.professional.name} за ${monthlyLabel("professional")}. Или пакет ${TOPUP_PACK_CONFIG[0].ops} операции за ${fmtEur(TOPUP_PACK_CONFIG[0].eur)} — прогресът е запазен.`,
            action: { label: "Виж опции", onClick: () => goSubscription() },
          });
        } else {
          toast.error("Грешка при експорт", { description: res.error });
        }
        return;
      }
      if (res.saved_document_id) {
        setSavedDocId(res.saved_document_id);
        trackDocumentSaved(res.saved_document_id, { doc_key: docKey, source: "wizard", via: "download" });
      }
      // Guardrail: документът е свален и запазен в профила — изчистваме
      // локалната чернова с лични данни от браузъра.
      clearDraft();
      toast.success(format === "pdf" ? "PDF изтеглен" : "DOCX изтеглен", {
        description: res.free ? "Повторно сваляне (безплатно)" : "Запазен в Документи → Всички",
      });

      setDownloadCount((n) => n + 1);
      if (!isPro) setShowUpgradeBanner(true);
      maybeAskForFeedback("download");
    } catch (e: any) {
      toast.error("Грешка при експорт", { description: String(e?.message ?? e) });
    } finally {
      setExporting(null);
    }
  };

  const handleApplyCorrections = async (sel: CorrectionsSelection, correctionsConfirmed = false) => {
    if (!result) return;
    if (!userRef.current) {
      goAuth({ action: "Прилагане на корекции", onSuccess: () => handleApplyCorrections(sel, correctionsConfirmed) });
      return;
    }
    if (sel.issues.length === 0 && sel.recommendations.length === 0) {
      toast.message("Изберете поне една препоръка за корекция");
      return;
    }
    setApplyingCorrections(true);
    try {
      // НЕПРОЗРАЧЕН обхват от ЦЕЛИЯ товар: същият ключ при повторен опит,
      // двойно натискане или загубена връзка — без двойно таксуване.
      const acPayloadScope = await opaqueOpScope("apply_corrections", {
        contract: result.contract,
        risk: result.risk,
        selectedIssues: sel.issues,
        selectedRecommendations: sel.recommendations,
        answers,
        userConfirmed: correctionsConfirmed,
      });
      const acOpScope = `op:${acPayloadScope}`;
      const acBatchScope = `wave:${acPayloadScope}`;
      const operationId = getStableOpKey(acOpScope);
      const batchId = getStableOpKey(acBatchScope);
      const releaseAcKeys = () => {
        releaseStableOpKey(acOpScope);
        releaseStableOpKey(acBatchScope);
      };
      const { data, error } = await invokeEdgeFunction<{ error?: string; code?: string; retry_after_seconds?: number; risk?: AIResult["risk"]; contract?: AIResult["contract"]; applied?: string[]; quality_manifest?: unknown; review_grant?: unknown }>("apply-corrections", {
        body: {
          contract: result.contract,
          risk: result.risk,
          selectedIssues: sel.issues,
          selectedRecommendations: sel.recommendations,
          answers,
          // Q4b — непрозрачният ПОДПИСАН манифест се пренася непроменен и само
          // заедно с точно този документ. Браузърът не го чете и не го създава.
          quality_manifest: result.quality_manifest ?? undefined,
          session_id: getOpSessionId(),
          batch_id: batchId,
          operation_id: operationId,
          userConfirmed: correctionsConfirmed,
        },
      });
      if (error || data?.error) {
        const code = data?.code || "";
        // Заявката все още се обработва/изравнява — ключът се ПАЗИ, безопасен
        // повторен опит без ново таксуване.
        if (
          code === "operation_in_progress" ||
          code === "quota_unavailable" ||
          code === "entitlement_unavailable" ||
          code === "reconciliation_required" ||
          code === "billing_reconciliation_required"
        ) {
          const wait = Number(data?.retry_after_seconds ?? 0);
          toast.message("Все още се обработва", {
            description: wait > 0 ? `Опитайте отново след ${wait} сек.` : "Опитайте отново след малко.",
          });
          return;
        }
        // Доказан конфликт на ключа — освобождаваме го и искаме ново изрично
        // действие, без автоматично препращане.
        if (
          code === "idempotency_key_conflict" ||
          code === "invalid_operation_id" ||
          code === "operation_id_required" ||
          code === "response_expired"
        ) {
          releaseAcKeys();
          toast.error("Заявката се промени. Изпратете отново.");
          return;
        }
        const sensitive = await parseSensitiveResponse(error, data);
        if (isSpecialCategoryBlocked(sensitive)) {
          setSensitiveClass(sensitive?.classification ?? null);
          setSensitiveBlocked(true);
          setCorrectionsPending(sel);
          setSensitiveOpen(true);
          return;
        }
        if (isConfirmationRequired(sensitive) || data?.error === "needs_confirmation") {
          setSensitiveClass(sensitive?.classification ?? null);
          setSensitiveBlocked(false);
          setCorrectionsPending(sel);
          setSensitiveOpen(true);
          return;
        }
        if (data?.error === "pro_required") {
          toast.error("Нужен е платен план", {
            description: "Прогресът е запазен.",
            action: { label: "Предприемач", onClick: () => goSubscription() },
          });
          return;
        }
        throw new Error(data?.error || error?.message || "Грешка");
      }
      // ДОКАЗАН КРАЕН УСПЕХ: единственият момент, в който ключът пада.
      releaseAcKeys();
      setResult({
        risk: data.risk ?? result.risk,
        contract: data.contract ?? result.contract,
        // Манифестът е валиден само за документа, който сървърът е върнал.
        quality_manifest: data.quality_manifest ?? undefined,
        // Пропускът също важи само за върнатия текст.
        review_grant: data.review_grant ?? undefined,
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

  /** Брой сваляния в текущата сесия + контекстуален банер за планове. */
  const [opsLeft, setOpsLeft] = useState<number | null>(null);
  const [downloadCount, setDownloadCount] = useState(0);
  const [showUpgradeBanner, setShowUpgradeBanner] = useState(false);
  const [saving, setSaving] = useState(false);
  const handleSaveToProfile = async () => {
    if (!result) return;
    if (!userRef.current) {
      goAuth({ action: "Запазване в профила", onSuccess: () => handleSaveToProfile() });
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
      trackDocumentSaved(data.saved_document_id, { doc_key: docKey, source: "wizard", via: "save" });
      toast.success("Запазено в профила", { description: "Документи → Всички" });
      maybeAskForFeedback("save");
    } catch (e: any) {
      toast.error("Грешка при запазване", { description: String(e?.message ?? e) });
    } finally {
      setSaving(false);
    }
  };

  const [downloadingBlank, setDownloadingBlank] = useState(false);
  const [blankStep, setBlankStep] = useState(0);

  // Lock body scroll while the blank-download modal is open so it stays
  // anchored to the current viewport on mobile (otherwise URL-bar dynamics
  // and page scrolling can push the card out of view).
  useEffect(() => {
    if (!downloadingBlank) return;
    const prevOverflow = document.body.style.overflow;
    const prevPosition = document.body.style.position;
    const prevTop = document.body.style.top;
    const prevWidth = document.body.style.width;
    const scrollY = window.scrollY;
    document.body.style.position = "fixed";
    document.body.style.top = `-${scrollY}px`;
    document.body.style.width = "100%";
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
      document.body.style.position = prevPosition;
      document.body.style.top = prevTop;
      document.body.style.width = prevWidth;
      window.scrollTo(0, scrollY);
    };
  }, [downloadingBlank]);
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
    if (!canStartNewProcessing("blank_download")) {
      openPrelaunchWaitlist("blank_download");
      return;
    }
    if (!userRef.current) {
      goAuth({ action: "Изтегляне на празна бланка", intent: "download_blank", onSuccess: () => runBlankDownload() });
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
      const { getOpSessionId, getOpDocKey, getStableOpKey, releaseStableOpKey } = await import(
        "@/lib/opSession"
      );
      // Един и същ ключ при нов опит/двойно натискане/загубена връзка — така
      // сървърът връща същия документ, вместо да таксува втори път.
      const opScope = `download_blank:${sector.id}:${docName ?? sector.contractName}:${bilingualMode ? "bi" : "bg"}`;
      const operationId = getStableOpKey(opScope);
      const { data, error } = await supabase.functions.invoke("download-blank", {
        body: {
          sector_id: sector.id,
          sector_title: sector.title,
          document_name: docName ?? sector.contractName,
          bilingual: bilingualMode,
          session_id: getOpSessionId(),
          doc_key: getOpDocKey(docName ?? sector.contractName),
          operation_id: operationId,
        },
      });
      if (!error && !data?.error) releaseStableOpKey(opScope);
      // Правна преграда: без такса, без загуба на избора, с ръчен нов опит.
      if (
        (await import("@/lib/legalGateClient")).handleLegalVerificationUnavailable(
          { data, error },
          () => { void runBlankDownload(); },
        )
      ) {
        clearStepTimers();
        setDownloadingBlank(false);
        return;
      }
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

  const requireAuth = useRequireAuth();
  const handleDownloadBlank = async () => {
    if (!canStartNewProcessing("blank_download")) {
      openPrelaunchWaitlist("blank_download");
      return;
    }
    if (!requireAuth({ action: "Изтегли празна бланка" })) return;
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
    if (!canStartNewProcessing("blank_download")) {
      autoBlankTriggered.current = true;
      openPrelaunchWaitlist("blank_download");
      return;
    }
    if (authLoading) return;
    if (!authUser) {
      autoBlankTriggered.current = true;
      goAuth({ action: "Изтегляне на празна бланка", intent: "download_blank", onSuccess: () => void runBlankDownload() });
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
    <div className="min-h-dvh">
      <Header />

      <GenerationBlockedDialog
        open={blockedReason !== null}
        onOpenChange={(o) => !o && setBlockedReason(null)}
        reason={blockedReason ?? "quota_exceeded"}
        onConfirm={() => void handleGenerate(true)}
      />


      {downloadingBlank && (
        <div
          className="fixed inset-x-0 top-0 z-[100] flex items-start justify-center overflow-y-auto bg-background/80 p-4 pt-[10vh] backdrop-blur-sm sm:items-center sm:pt-4"
          style={{ height: "100dvh" }}
        >
          <div className="w-full max-w-md rounded-2xl border border-gold/30 bg-card p-6 shadow-2xl">
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
                      <Check className="h-4 w-4 shrink-0 text-success" />
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
            <div className="flex items-center gap-3 text-muted-foreground">
              <a href="/ai" className="hidden underline-offset-2 hover:text-gold hover:underline md:inline">Как работи AI</a>
              <a href="/karta" className="hidden underline-offset-2 hover:text-gold hover:underline md:inline">Карта на сайта</a>
              <span className="hidden md:inline">·</span>
              <span>
                {result
                  ? "Готово"
                  : `Стъпка ${safeIdx + 1} от ${total} · остават ${Math.max(0, total - safeIdx - 1)}`}
                {!result && stepLabel && (
                  <span className="hidden text-foreground sm:inline">: {stepLabel}</span>
                )}
              </span>
            </div>
          </div>
          <Progress value={progress} className="h-1.5 bg-secondary" />
        </div>
      </div>

      <OpsHintBar isPro={isPro} />


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
          {/* LEFT — interview / result panels (на мобилно резултатът идва след документа) */}
          <section className={result ? "order-2 space-y-4 lg:order-1" : "space-y-5"}>
            {!result && (
              <RiskMeter level="unknown" />
            )}

            {consentRequired && !result && (
              <div ref={consentRef}>
                <SensitiveDataNotice
                  classification={sensitiveClass}
                  preview={draftOutline}
                  busy={generating}
                  operationLabel="изготвяне на документа"
                  onDismiss={() => setConsentRequired(false)}
                  onConfirm={() => void handleGenerate(true)}
                />
              </div>
            )}

            {sensitiveOpen && (
              <SensitiveDataNotice
                classification={sensitiveClass}
                blocked={sensitiveBlocked}
                preview={draftOutline}
                busy={applyingCorrections}
                operationLabel={correctionsPending ? "корекция на документа" : "изготвяне на документа"}
                onDismiss={() => {
                  setSensitiveOpen(false);
                  setCorrectionsPending(null);
                }}
                onConfirm={() => {
                  setSensitiveOpen(false);
                  const pending = correctionsPending;
                  setCorrectionsPending(null);
                  if (pending) void handleApplyCorrections(pending, true);
                  else void handleGenerate(true);
                }}
              />
            )}




            {!result && docName && (
              <KitPrefillBridge
                slug={slugify(docName)}
                answers={answers}
                onApply={(patch) => setAnswers((p) => ({ ...p, ...patch }))}
              />
            )}

            {!result && current && (
              <div
                ref={questionCardRef}
                onKeyDown={(e) => {
                  // Enter → следващото празно поле; ако няма такова и стъпката е
                  // валидна, продължаваме напред.
                  if (e.key !== "Enter") return;
                  const moved = handleEnterFocusNext(e);
                  if (!moved && canNext && !isLast) {
                    setAttemptedNext(false);
                    markDocSelected(); trackFillStep(stepIdx + 1, total, { doc_key: docKey, source: "wizard" });
                    setStepIdx((i) => i + 1);
                    window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
                  }
                }}
                className="rounded-xl border border-border/60 bg-gradient-card p-6 shadow-soft animate-fade-in"
              >


                <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-wider text-gold">
                  <span>Въпрос {safeIdx + 1}</span>
                  <span className="text-muted-foreground">/ {total}</span>
                </div>
                <QuestionField
                  q={current}
                  value={answers[current.id] ?? ""}
                  onChange={(v) => { markDocSelected(); setAnswers((p) => ({ ...p, [current.id]: v })); }}
                  answers={answers}
                  onAnswerChange={(id, v) => { markDocSelected(); setAnswers((p) => ({ ...p, [id]: v })); }}
                  contacts={contacts}
                  invalid={attemptedNext && !canNext}
                />

                {isLast && (
                  <div className="mt-6">
                    <FollowupSuggestions
                      sectorId={sector?.id}
                      contractType={(sector as { selectedDocument?: string })?.selectedDocument}
                      answers={answers}
                      onAnswer={(id, v) => { markInteracted(); setAnswers((p) => ({ ...p, [id]: v })); }}
                    />
                  </div>
                )}



                {attemptedNext && !canNext && current && (
                  <div className="mt-4 rounded-md border border-destructive/50 bg-destructive/5 p-3 text-xs text-destructive">
                    <div className="flex items-center gap-1.5 font-semibold">
                      <AlertCircle className="h-3.5 w-3.5" />
                      Моля, попълнете задължителното поле: {current.label}
                    </div>
                  </div>
                )}

                {/* Spacer for mobile sticky action bar */}
                <div className="h-20 lg:hidden" aria-hidden="true" />
                <div
                  style={keyboardInset ? { transform: `translateY(-${keyboardInset}px)` } : undefined}
                  className={
                    // Mobile: fixed at bottom with safe-area, повдигнат над клавиатурата.
                    "fixed inset-x-0 bottom-0 z-40 flex items-center justify-between gap-3 border-t border-border/60 bg-background/95 px-4 py-3 pb-safe backdrop-blur-md transition-transform duration-150 " +
                    "lg:static lg:mt-8 lg:translate-y-0 lg:border-0 lg:bg-transparent lg:px-0 lg:py-0 lg:backdrop-blur-none"
                  }
                >
                  <Button
                    variant="ghost"
                    onClick={() => {
                      setAttemptedNext(false);
                      setStepIdx((i) => Math.max(0, i - 1));
                      window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
                    }}
                    disabled={safeIdx === 0}
                    className="h-11 text-muted-foreground hover:text-foreground"
                  >
                    <ArrowLeft className="mr-1 h-4 w-4" /> Назад
                  </Button>
                  {isLast ? (
                    <Button
                      onClick={() => { if (!canNext) { setAttemptedNext(true); focusFirstEmpty(); return; } handleGenerate(); }}
                      disabled={generating}
                      size="lg"
                      className="h-11 bg-gradient-gold text-navy shadow-gold hover:shadow-[0_15px_50px_-10px_hsl(43_55%_54%_/_0.5)]"
                    >
                      {generating ? (
                        <>
                          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                          Изготвяне…
                        </>
                      ) : genFailed ? (
                        <>
                          <RefreshCcw className="mr-2 h-4 w-4" />
                          Опитай отново
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
                      onClick={() => {
                        if (!canNext) { setAttemptedNext(true); focusFirstEmpty(); return; }
                        setAttemptedNext(false);
                        markDocSelected(); trackFillStep(stepIdx + 1, total, { doc_key: docKey, source: "wizard" });
                        setStepIdx((i) => i + 1);
                        window.scrollTo({ top: 0, behavior: "instant" as ScrollBehavior });
                      }}
                      disabled={generating}
                      className="h-11 bg-gradient-gold text-navy hover:shadow-gold"
                    >
                      Напред <ArrowRight className="ml-1 h-4 w-4" />
                    </Button>
                  )}
                </div>
                {/* A/B (quick_preview): щом първото задължително поле е попълнено,
                    вариантът показва CTA за незабавен готов документ. Контролата
                    минава по класическия път през всички стъпки. */}
                {showQuickPreviewCta && quickPreviewEligible && (

                  <div className="mt-4 rounded-xl border border-gold/30 bg-gold/5 p-4 animate-fade-in">
                    <p className="text-sm font-medium">Искате да видите документа веднага?</p>
                    <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                      Ще изготвим пълен вариант с наличните данни. Можете да
                      допълните останалите полета и да прегенерирате.
                    </p>
                    <Button
                      variant="outline"
                      disabled={generating}
                      onClick={() => {
                        trackDocEvent("quick_preview_cta_click", "fill", {
                          doc_key: docKey,
                          step_idx: stepIdx,
                        });

                        handleGenerate();
                      }}
                      className="mt-3 h-10 w-full border-gold/40 text-gold hover:bg-gold/10 hover:text-gold sm:w-auto"
                    >
                      <Bird className="mr-2 h-4 w-4" />
                      Виж бърз преглед сега
                    </Button>
                  </div>
                )}

                {generating && (
                  <div className="mt-4 rounded-lg border border-gold/30 bg-gold/5 p-4 animate-fade-in" aria-busy="true">
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-4 w-4 flex-shrink-0 animate-spin text-gold" />
                      <div className="flex-1 min-w-0">
                        <div key={genStepIdx} className="text-sm font-medium text-foreground animate-fade-in">
                          {GEN_STEPS[genStepIdx]}
                        </div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          Процесът отнема около 60 секунди. Документът се изготвя на сървъра — кратко
                          прекъсване на връзката не го спира и попълнените данни са запазени.
                        </div>

                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={cancelGeneration}
                        className="h-8 shrink-0 text-xs text-muted-foreground hover:text-foreground"
                      >
                        Прекрати
                      </Button>
                    </div>
                  </div>
                )}

              </div>
            )}

            {result && (
              <div ref={resultRef} className="space-y-4 animate-fade-in scroll-mt-20">
                <ResultActionBar
                  documentTitle={customTitle || result.contract.title}
                  needsAuth={!user}
                  canDownload={!!user && !docAccess.loading && docAccess.canDownload}
                  exporting={exporting}
                  saving={saving}
                  saved={!!savedDocId}
                  opsLeft={opsLeft}
                  preferredFormat={preferredFmt}
                  onExportPdf={() => handleExport("pdf")}
                  onExportDocx={() => handleExport("docx")}
                  onSave={handleSaveToProfile}
                  onRegister={() => {
                    trackAuthPromptShown({ doc_key: docKey, source: "wizard", action: "register_cta" });
                    setDownloadModal({ open: true, format: preferredFmt });
                  }}
                />
                <DownloadRoiDialog
                  open={downloadModal.open}
                  onOpenChange={(o) => setDownloadModal((p) => ({ ...p, open: o }))}
                  format={downloadModal.format}
                  opsLeft={opsLeft}
                  onProceed={() => void handleExport(downloadModal.format)}
                />

                {showUpgradeBanner && (
                  <PostDownloadUpgradeBanner
                    downloads={downloadCount}
                    onDismiss={() => setShowUpgradeBanner(false)}
                  />
                )}

                <ResultShell
                  risk={{
                    level: result.risk.level,
                    score: result.risk.score,
                    summary: result.risk.summary,
                  }}
                  riskSectionId="risk"
                  sections={[
                    {
                      id: "corrections",
                      title: "Корекции и препоръки",
                      badge:
                        (result.risk.issues?.length ?? 0) + (result.risk.recommendations?.length ?? 0) > 0
                          ? String((result.risk.issues?.length ?? 0) + (result.risk.recommendations?.length ?? 0))
                          : undefined,
                      badgeTone: result.risk.level === "high" ? "danger" : "warning",
                      defaultOpen:
                        result.risk.level === "high" && (result.risk.issues?.length ?? 0) > 0,
                      content: (
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
                      ),
                    },
                    {
                      id: "risk",
                      title: "Правен риск и анализ",
                      content: (
                        <>
                          <RiskReport
                            level={result.risk.level}
                            issues={result.risk.issues || []}
                            recommendations={result.risk.recommendations || []}
                            isPro={isPro}
                          />
                          {/* Плащане в брой — показва се, ако отговор споменава кеш. */}
                          {Object.values(answers).some(
                            (v) => typeof v === "string" && /\bбро[йя]\b|\bкеш\b|\bcash\b/i.test(v),
                          ) && (
                            <LegalDisclaimer variant="warning">
                              <strong>Плащане в брой:</strong> Съгласно чл. 3 от Закона за ограничаване на плащанията в брой (ЗОПБ) плащания на стойност <strong>равна или над 5 000 €</strong> (както и серия от свързани плащания, надхвърлящи прага) задължително се извършват само чрез превод по платежна сметка. Уверете се, че сумата по договора попада в позволения праг.
                            </LegalDisclaimer>
                          )}
                        </>
                      ),
                    },
                    {
                      id: "quality",
                      title: "AI проверка на качеството",
                      hint: "Втори прочит от AI одитор — открива липсващи клаузи и незапълнени полета.",
                      content: (
                        <>
                          <FillLaterPersonalData
                            value={fillLaterPersonal}
                            onChange={setFillLaterPersonal}
                          />
                          <AIReviewCard
                            contract={result.contract}
                            documentType={docName ?? sector.contractName}
                            reviewContext={acceptedContextForReview}
                            ignorePersonalData={fillLaterPersonal}
                            qualityManifest={result.quality_manifest ?? null}
                            reviewGrant={result.review_grant ?? null}
                            savedDocumentId={savedDocId}
                          />

                        </>
                      ),
                    },
                    {
                      id: "signing",
                      title: "Подпис и арбитраж",
                      content: (
                        <>
                          <ArbitrationSelector value={arbitration} onChange={setArbitration} />
                          <SignatureBlock
                            isPro={isPro}
                            defaultPartyA=""
                            defaultPartyB=""
                            value={signature}
                            onChange={setSignature}
                          />
                        </>
                      ),
                    },
                    {
                      id: "save",
                      title: "Име и контрагент",
                      badge: savedDocId ? "запазено" : undefined,
                      badgeTone: "success",
                      hint: "Документът се запазва във „Всички“ — после може да го преместите в папка от профила си.",
                      content: (
                        <div className="grid gap-3 sm:grid-cols-2">
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
                      ),
                    },
                  ]}
                  footer={
                    <Button
                      variant="ghost"
                      onClick={() => {
                        clearDraft();
                        setResult(null);
                        setStepIdx(0);
                        setAnswers({});
                        setSavedDocId(undefined);
                        setAppliedNotes(undefined);
                        setSignature({ name_a: "", name_b: "", city: "", date: "" });
                        setCustomTitle("");
                        setContactId("");
                      }}
                      className="w-full text-xs text-muted-foreground hover:text-gold"
                    >
                      Започни нов договор
                    </Button>
                  }
                />
              </div>
            )}
          </section>

          {/* RIGHT — Live draft */}
          <section
            className={
              result
                ? "order-1 lg:order-2 lg:sticky lg:top-32 lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto"
                : "lg:sticky lg:top-32 lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto"
            }
          >
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gold">
                <FileText className="h-3.5 w-3.5" />
                Работен документ
              </div>
              {!result && (
                <span className="text-xs text-muted-foreground">Актуализация в реално време</span>
              )}
            </div>
            {result?.contract && !user && (
              <AnonymousPreviewNotice onRegister={() => goAuth({ action: "Запазване и сваляне на документа" })} />
            )}
            {result?.contract && user && (
              <div className="mb-4">
                <RefineDraftBox
                  contract={result.contract}
                  answers={answers}
                  onRefined={(next, _summary, _changed, reviewGrant) => {
                    setResult({
                      ...result,
                      contract: { ...result.contract, ...next },
                      quality_manifest: undefined,
                      review_grant: reviewGrant ?? undefined,
                    });
                    setSavedDocId(undefined);
                  }}
                  onNeedAuth={() => goAuth({ action: "Продължаване на операцията" })}
                />
              </div>
            )}
            {(() => {
              const draft = (
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
                    setResult({
                      ...result,
                      contract: { ...result.contract, ...next },
                      quality_manifest: undefined,
                      review_grant: undefined,
                    });
                    setSavedDocId(undefined);
                  }}
                  onDownloadBlank={handleDownloadBlank}
                />
              );
              const shouldBlur = !!result && !!user && !docAccess.loading && !docAccess.canDownload;
              return shouldBlur
                ? <BlurredPreviewOverlay onUnlock={() => setShowPaywall(true)}>{draft}</BlurredPreviewOverlay>
                : draft;
            })()}

            {/* Beta: compact feedback CTA — visible only after the document is generated */}
            {result && user && (
              <div className="mt-3 flex items-center justify-end">
                <button
                  type="button"
                  onClick={() => maybeAskForFeedback("manual")}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gold/30 bg-gold/5 px-3 py-1.5 text-[11px] font-medium text-gold transition-colors hover:border-gold/60 hover:bg-gold/10"
                  title="Оставете обратна връзка за преживяването — +2 операции"
                >
                  <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden />
                  Обратна връзка · <span className="font-semibold">+2 операции</span>
                </button>
              </div>
            )}

          </section>
        </div>
      </main>

      <StrictDocumentPaywall
        open={showPaywall}
        onOpenChange={setShowPaywall}
        docKey={docKey}
        sectorId={sector?.id}
        docName={docName ?? sector?.contractName}
        wizardHref={wizardHref}
      />

      <WizardFeedbackPrompt
        open={feedbackOpen}
        onOpenChange={setFeedbackOpen}
        context={{
          docName: docName ?? sector?.contractName,
          sectorId: sector?.id,
          docKey,
        }}
      />
    </div>
  );
}
