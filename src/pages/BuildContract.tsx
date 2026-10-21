import { invokeWithMarketingBonus } from "@/lib/marketingBonus";
import { ensureFeatureDisclaimer } from "@/lib/aiDisclaimerGate";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { writeSavedDocumentContent } from "@/lib/savedDocumentContent";
import { useActivationDraft } from "@/hooks/useActivationDraft";
import { currentDraftRoute } from "@/lib/activationDraft";
import { OpsHintBar } from "@/components/wizard/OpsHintBar";
import { GenerationBlockedDialog } from "@/components/wizard/GenerationBlockedDialog";
import { DocumentValueCard } from "@/components/wizard/DocumentValueCard";
import { useEnterFocusNext } from "@/hooks/useEnterFocusNext";
import { useNavigate, useSearchParams } from "react-router-dom";
import { prefetchHandlers } from "@/components/PrefetchLink";
import { ArrowLeft, ArrowRight, Loader2, FileDown, FileText, Save, Wand2, Sparkles, Zap, Briefcase, Scale, ChevronDown, Check, Languages, ShieldCheck, FileSignature, Lightbulb, Printer } from "@/icons";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

import {
  type BuildMode,
  BUILD_MODES,
  buildPresetSignature,
  type AIResult,
  STORAGE_KEY,
  splitLines,
  GEN_STEPS,
  Field,
} from "./buildContract/parts";
import { PreviewPane } from "./buildContract/PreviewPane";
import { FinalizePane } from "./buildContract/FinalizePane";

import { Header } from "@/components/Header";
import { SensitiveDataNotice } from "@/components/wizard/SensitiveDataNotice";
import { buildDraftOutline } from "@/lib/draftOutline";
import {
  parseSensitiveResponse,
  isConfirmationRequired,
  isSpecialCategoryBlocked,
  type ClassificationSummary,
} from "@/lib/aiSensitiveData";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LiveDraft } from "@/components/wizard/LiveDraft";
import { type RiskLevel } from "@/components/wizard/RiskMeter";
import { type RiskIssue } from "@/components/wizard/RiskReport";
import { type SignatureData } from "@/components/wizard/SignatureBlock";
import { type CorrectionsSelection } from "@/components/wizard/CorrectionsPanel";
import { MultiPartySigningDialog } from "@/components/MultiPartySigningDialog";
import { SECTORS, type Sector } from "@/data/sectors";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_GROUPS, getDocumentType, type DocumentTypeId } from "@/lib/documentReferences";
import { getBuildSchema, type BuildField } from "@/lib/documentFieldSchemas";
import { TOPUP_PACK_CONFIG, fmtEur } from "@/lib/pricing";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsPro } from "@/hooks/useIsPro";
import { toast } from "sonner";
import { openInlineAuth } from "@/lib/inlineAuth";
import { type GeneratedContract, type SignatureInfo } from "@/lib/exporters";
import { downloadDocument } from "@/lib/downloadDocument";
import { mergeParentWithAppendices } from "@/lib/appendixMerger";
import { Seo } from "@/components/Seo";
import { trackEvent } from "@/lib/analytics";
import {
  trackDocStart,
  trackGenerate,
  trackResultViewed,
  trackAuthPromptShown,
  trackDocumentSaved,
} from "@/lib/docFunnel";
import { invokeEdgeFunction } from "@/lib/invokeEdgeFunction";
import { canStartNewProcessing } from "@/lib/prelaunch";
import { openPrelaunchWaitlist } from "@/lib/prelaunchWaitlist";
import { createResultSaveCoordinator } from "@/lib/resultSaveCoordinator";
import { readReferenceHandoff } from "@/lib/referenceHandoff";
import { classifyGenerationError, errorClassOf, type GenerationError } from "@/lib/generationErrors";
import { getOpSessionId, getStableOpKey, releaseStableOpKey, opaqueOpScope } from "@/lib/opSession";
import { PartyListEditor, parseParties, serializeParties } from "@/components/wizard/PartyListEditor";
import { Lock } from "@/icons";
import { findSimilarTemplates, type SimilarTemplate } from "@/lib/templateSimilarity";
import { Link } from "react-router-dom";
import { Info, X } from "@/icons";



export interface BuildContractPageProps {
  /**
   * Optional preset overrides. When provided, take precedence over the
   * equivalent URL search params (used e.g. by the bilingual-template wizard
   * which passes them in instead of using /build?... query strings).
   */
  presetOverride?: {
    category?: string;
    documentType?: string;
    name?: string;
    bilingual?: boolean;
  };
  /**
   * Chrome variant. "generic" is the default /build experience.
   * "bilingual-template" tailors title/breadcrumb/SEO to the specific
   * bilingual document chosen from the catalog.
   */
  variant?: "generic" | "bilingual-template";
}

export default function BuildContractPage({ presetOverride, variant = "generic" }: BuildContractPageProps = {}) {
  const navigate = useNavigate();
  const { user } = useAuth();
  /**
   * Жива референция към текущия потребител: onSuccess callback-ите от инлайн
   * входа са затваряния от по-стар рендер (user === null). Четенето през ref
   * гарантира, че след успешен вход повторното извикване вижда новата сесия,
   * вместо отново да отвори модала.
   */
  const userRef = useRef(user);
  userRef.current = user;
  const [searchParams] = useSearchParams();
  const presetSignature = useMemo(() => buildPresetSignature(searchParams), [searchParams]);
  const presetCategory = presetOverride?.category ?? searchParams.get("category") ?? "";
  const presetDocumentType = (presetOverride?.documentType ?? searchParams.get("documentType") ?? "") as DocumentTypeId | "";
  const presetName = presetOverride?.name ?? searchParams.get("name") ?? "";
  const presetBilingual = presetOverride?.bilingual ?? (searchParams.get("bilingual") === "1");
  const parentSavedIdParam = searchParams.get("parentSavedId");
  const parentUploadedIdParam = searchParams.get("parentUploadedId");
  // Контекстът от препратка идва през локално предаване (не през URL);
  // стари адреси с параметри в URL остават четими за обратна съвместимост.
  const refHandoff = useMemo(() => readReferenceHandoff(searchParams.get("refCtx")), [searchParams]);
  const parentTitleParam = searchParams.get("parentTitle") ?? refHandoff?.parentTitle ?? null;
  const refNumberParam = searchParams.get("refNumber");
  const refTypeParam = searchParams.get("refType");
  const prefillPartiesA = searchParams.get("partiesA") ?? (refHandoff?.partiesA?.join("\n") || null);
  const prefillPartiesB = searchParams.get("partiesB") ?? (refHandoff?.partiesB?.join("\n") || null);
  const prefillSubject = searchParams.get("subject") ?? refHandoff?.subject ?? null;
  const fromDogovaryAI = searchParams.get("from") === "dogovaryai";

  useEffect(() => {
    if (fromDogovaryAI) {
      toast.info("DogovaryAI предложи стойности — прегледайте и редактирайте.");
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);




  // Restore persisted state
  const persisted = useMemo(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }, []);

  const [documentType, setDocumentType] = useState<DocumentTypeId>(
    (presetDocumentType as DocumentTypeId) ||
    (persisted?.documentType as DocumentTypeId) ||
    "contract",
  );
  const [docTypeOpen, setDocTypeOpen] = useState(false);
  /** Изчерпани операции → ясен модал с 1-click път към план или топ-ъп. */
  const [quotaBlocked, setQuotaBlocked] = useState(false);
  const [buildMode, setBuildMode] = useState<BuildMode>(
    (persisted?.buildMode as BuildMode) || "working",
  );

  const [name, setName] = useState<string>(
    presetName
      ? presetName
      : presetDocumentType && refNumberParam && parentTitleParam
        ? `${getDocumentType(presetDocumentType).label} № ${refNumberParam} към „${parentTitleParam}”`
        : (persisted?.name ?? "")
  );
  const [similarTemplates, setSimilarTemplates] = useState<SimilarTemplate[]>([]);
  const [similarDismissed, setSimilarDismissed] = useState(false);
  const [categoryId, setCategoryId] = useState<string>(
    presetCategory && SECTORS.some((s) => s.id === presetCategory)
      ? presetCategory
      : (persisted?.categoryId ?? ""),
  );
  const [categoryOther, setCategoryOther] = useState<string>(persisted?.categoryOther ?? "");
  useEffect(() => {
    setSimilarDismissed(false);
    const handle = setTimeout(() => {
      setSimilarTemplates(
        name.trim().length >= 4
          ? findSimilarTemplates(name, 0.6, 5, {
              documentType,
              categorySectorId: categoryId && categoryId !== "__other__" ? categoryId : undefined,
            })
          : [],
      );
    }, 250);
    return () => clearTimeout(handle);
  }, [name, documentType, categoryId]);
  const [partiesA, setPartiesA] = useState<string>(prefillPartiesA ?? persisted?.partiesA ?? "");
  const [partiesB, setPartiesB] = useState<string>(prefillPartiesB ?? persisted?.partiesB ?? "");
  // Dynamic per-document-type field values (key -> value)
  const [fieldValues, setFieldValues] = useState<Record<string, string>>(() => {
    const fromPersisted: Record<string, string> = (persisted?.fieldValues && typeof persisted.fieldValues === "object")
      ? { ...persisted.fieldValues }
      : {};
    // Back-compat: migrate old flat keys from persisted state
    for (const k of ["subject", "term", "prices", "obligations", "other"] as const) {
      if (persisted?.[k] && !fromPersisted[k]) fromPersisted[k] = persisted[k];
    }
    if (prefillSubject) fromPersisted.subject = prefillSubject;
    return fromPersisted;
  });
  const docSelectedRef = useRef(false);
  /**
   * `document_selected` — само при съзнателно действие (избор на тип документ,
   * първо въвеждане, старт на генериране). Не при mount: страницата се отваря и
   * от SEO трафик/презареждане. Еднократно за (сесия, тип документ).
   */
  const markDocSelected = (docKey: string) => {
    if (docSelectedRef.current) return;
    docSelectedRef.current = true;
    trackDocStart({ source: "build", doc_key: docKey });
  };
  const setField = (key: string, value: string) => {
    markDocSelected(documentType);
    setFieldValues((prev) => ({ ...prev, [key]: value }));
  };

  const [generating, setGenerating] = useState(false);
  // Пази от двойно изпращане при ръчен повторен опит от съобщението на
  // правната преграда (никога автоматично).
  const busyRef = useRef(false);
  const [genStepIdx, setGenStepIdx] = useState(0);
  // Диалог за лични / чувствителни данни (GDPR потвърждение преди генериране).
  const [sensitiveOpen, setSensitiveOpen] = useState(false);
  const [sensitiveBlocked, setSensitiveBlocked] = useState(false);
  const [sensitiveClass, setSensitiveClass] = useState<ClassificationSummary | null>(null);
  const [correctionsPending, setCorrectionsPending] = useState<CorrectionsSelection | null>(null);
  const [result, setResult] = useState<AIResult | null>(persisted?.result ?? null);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const [signature, setSignature] = useState<SignatureData>(
    persisted?.signature ?? { name_a: "", name_b: "", city: "", date: "" }
  );
  const [savedDocId, setSavedDocId] = useState<string | undefined>(persisted?.savedDocId);
  const [saving, setSaving] = useState(false);
  const { isPro, isTeam, freeQuota, refresh: refreshPro } = useIsPro();
  const freeWaveAvailable = !freeQuota.correctionsFreeUsed;
  const signingFreeAvailable = !freeQuota.signingFreeUsed;
  const [signDialogOpen, setSignDialogOpen] = useState(false);
  const canStrict = isPro || isTeam;
  const canBilingual = isPro || isTeam;
  const handleEnterFocusNext = useEnterFocusNext();

  const [bilingual, setBilingual] = useState<boolean>(
    presetBilingual || Boolean(persisted?.bilingual),
  );
  const [bilingualLang, setBilingualLang] = useState<"en" | "de" | "fr" | "ru" | "es" | "it">(
    (persisted?.bilingualLang as "en" | "de" | "fr" | "ru" | "es" | "it") || "en",
  );
  const [appendixRefreshTick, setAppendixRefreshTick] = useState(0);
  const [contacts, setContacts] = useState<Array<{ id: string; name: string; type?: string }>>([]);
  const [applyingCorrections, setApplyingCorrections] = useState(false);
  const [appliedNotes, setAppliedNotes] = useState<string[] | undefined>(undefined);
  const [stepIdx, setStepIdx] = useState<number>(
    typeof persisted?.stepIdx === "number" ? persisted.stepIdx : 0,
  );

  useEffect(() => {
    const prevSignature = persisted?.presetSignature ?? "";
    if (!presetSignature || presetSignature === prevSignature) return;

    setDocumentType((presetDocumentType as DocumentTypeId) || "contract");
    setBuildMode("working");
    setBilingual(presetBilingual);
    setName(
      presetName
        ? presetName
        : presetDocumentType && refNumberParam && parentTitleParam
          ? `${getDocumentType(presetDocumentType).label} № ${refNumberParam} към „${parentTitleParam}”`
          : "",
    );
    setCategoryId(
      presetCategory && SECTORS.some((s) => s.id === presetCategory)
        ? presetCategory
        : "",
    );
    setCategoryOther("");
    setPartiesA(prefillPartiesA ?? "");
    setPartiesB(prefillPartiesB ?? "");
    setFieldValues(prefillSubject ? { subject: prefillSubject } : {});
    setResult(null);
    setSavedDocId(undefined);
    setAppliedNotes(undefined);
    setSignature({ name_a: "", name_b: "", city: "", date: "" });
  }, [
    persisted?.presetSignature,
    presetSignature,
    presetCategory,
    presetDocumentType,
    presetName,
    presetBilingual,
    parentTitleParam,
    refNumberParam,
    prefillPartiesA,
    prefillPartiesB,
    prefillSubject,
  ]);

  /**
   * Непрекъснатост на активацията: съдържанието се пази в текущия таб и на
   * сървъра, а в localStorage остава указател без лични данни. Прогресът и
   * готовият резултат преживяват вход, регистрация и OAuth пренасочване.
   */
  const activation = useActivationDraft({
    flow: "build",
    docKey: documentType,
    route: currentDraftRoute(),
    onRestore: (payload) => {
      const meta = (payload.meta ?? {}) as Record<string, unknown>;
      if (typeof meta.documentType === "string") setDocumentType(meta.documentType as DocumentTypeId);
      if (typeof meta.buildMode === "string") setBuildMode(meta.buildMode as BuildMode);
      if (typeof meta.name === "string") setName(meta.name);
      if (typeof meta.categoryId === "string") setCategoryId(meta.categoryId);
      if (typeof meta.categoryOther === "string") setCategoryOther(meta.categoryOther);
      if (meta.partiesA) setPartiesA(meta.partiesA as typeof partiesA);
      if (meta.partiesB) setPartiesB(meta.partiesB as typeof partiesB);
      if (payload.answers) setFieldValues(payload.answers as Record<string, string>);
      if (payload.result) setResult(payload.result as typeof result);
      if (payload.signature) setSignature(payload.signature as typeof signature);
      if (typeof meta.savedDocId === "string") setSavedDocId(meta.savedDocId);
      if (typeof meta.stepIdx === "number") setStepIdx(meta.stepIdx);
    },
  });

  /** Един снапшот на състоянието — ползва се и от автозаписа, и преди вход. */
  const snapshotDraft = useCallback(() => {
    const meta = {
        presetSignature,
        documentType, buildMode, bilingual, bilingualLang,
        name, categoryId, categoryOther, partiesA, partiesB,
        fieldValues,
        result, signature, savedDocId, stepIdx,
      };
    if (activation.active) {
      activation.persist(
        { answers: fieldValues, result, signature, meta },
        { stepIdx, hasResult: !!result },
      );
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
      return;
    }
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(meta)); } catch { /* ignore */ }
    // Зависимостите са отделните стабилни функции, не целият обект — иначе
    // снапшотът би се правил при всяко рендиране.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activation.active, activation.persist, presetSignature, documentType, buildMode, bilingual, bilingualLang, name, categoryId, categoryOther, partiesA, partiesB, fieldValues, result, signature, savedDocId, stepIdx]);

  // Persist on every change
  useEffect(() => { snapshotDraft(); }, [snapshotDraft]);

  // Force non-Pro/Team users out of bilingual mode.
  useEffect(() => {
    if (!canBilingual && bilingual) setBilingual(false);
  }, [canBilingual, bilingual]);

  useEffect(() => {
    trackEvent("build_contract_open");
  }, []);

  // Apply preset category from URL when navigating in from a sector page.
  useEffect(() => {
    if (presetCategory && SECTORS.some((s) => s.id === presetCategory) && presetCategory !== categoryId) {
      setCategoryId(presetCategory);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [presetCategory]);

  useEffect(() => {
    if (!user) { setContacts([]); return; }
    supabase.from("contacts").select("id, name, type").is("deleted_at", null).order("created_at", { ascending: false })
      .then(({ data }) => setContacts((data as any) ?? []));
  }, [user]);

  // Force non-Pro/Team users out of Strict mode.
  useEffect(() => {
    if (!canStrict && buildMode === "strict") setBuildMode("working");
  }, [canStrict, buildMode]);

  const categoryLabel = useMemo(() => {
    if (categoryId === "__other__") return categoryOther.trim();
    const s = SECTORS.find((x) => x.id === categoryId);
    return s?.title ?? "";
  }, [categoryId, categoryOther]);

  // Synthetic sector — used by LiveDraft so signature block and party labels work.
  // Party labels are taken from the selected document-type schema so that e.g.
  // "Декларация" shows Декларатор, "Пълномощно" shows Упълномощител/Пълномощник, etc.
  const syntheticSector = useMemo<Sector>(() => {
    const matched = SECTORS.find((x) => x.id === categoryId);
    const typeSchema = getBuildSchema(documentType || "contract");
    const partyAFromSchema = typeSchema?.partyALabel?.replace(/\/и\s*$/i, "").trim();
    const partyBFromSchema = typeSchema?.partyBLabel?.replace(/\/и\s*$/i, "").trim();
    return {
      id: "custom",
      title: categoryLabel || "Свободен договор",
      subtitle: "Свободно изготвен документ",
      icon: "FileText",
      description: "",
      contractName: name || getDocumentType(documentType).label,
      parties: {
        a: partyAFromSchema || matched?.parties?.a || "Възложителя",
        b: partyBFromSchema || matched?.parties?.b || "Изпълнителя",
      },
      questions: [],
    };
  }, [categoryId, categoryLabel, name, documentType]);

  // Synthetic answers map so LiveDraft's signature block shows the first party from each side.
  const syntheticAnswers = useMemo(() => ({
    party_a_name: splitLines(partiesA)[0] ?? "",
    party_b_name: splitLines(partiesB)[0] ?? "",
  }), [partiesA, partiesB]);

  const GEN_STEPS = [
    "Проверяваме въведената информация…",
    "Подбираме приложимите правни клаузи…",
    "Комплектоваме структурата на договора…",
    "Съставяме текста и форматираме раздели…",
    "Извършваме оценка на риска…",
    "Финализираме документа — почти готово…",
  ];

  const goAuth = (opts?: { action?: string; intent?: string; onSuccess?: () => void }) => {
    // Snapshot current state synchronously so nothing typed just before this
    // navigation is lost across the /auth → return roundtrip.
    snapshotDraft();
    // Инлайн вход — без напускане на текущия екран, за да не се губи инерция.
    openInlineAuth({
      action: opts?.action,
      intent: opts?.intent ?? "generate",
      docKey: documentType,
      source: "build",
      onSuccess: opts?.onSuccess,
    });
  };
  const goSubscription = () => navigate(`/account?tab=subscription`);

  const schema = useMemo(() => getBuildSchema(documentType), [documentType]);

  /** Скрит преглед на попълненото за екрана за потвърждение. */
  const draftOutline = useMemo(
    () =>
      buildDraftOutline(
        schema.fields.map((f) => ({ id: f.key, label: f.label, value: fieldValues[f.key] ?? "" })),
      ),
    [schema, fieldValues],
  );

  // ----- Step-by-step wizard structure -----
  const STEPS = useMemo(
    () => [
      { id: "settings", label: "Настройки" },
      { id: "basics", label: "Документ" },
      { id: "parties", label: "Страни" },
      { id: "details", label: "Детайли" },
      { id: "review", label: "Преглед" },
    ],
    [],
  );
  const totalSteps = STEPS.length;
  const safeStepIdx = Math.min(Math.max(0, stepIdx), totalSteps - 1);
  const stepValid = (idx: number): boolean => {
    if (idx === 0) return !!documentType;
    if (idx === 1) {
      if (!name.trim()) return false;
      if (!categoryId) return false;
      if (categoryId === "__other__" && !categoryOther.trim()) return false;
      return true;
    }
    if (idx === 2) {
      const needsB = !!schema.partyBLabel;
      if (splitLines(partiesA).length === 0) return false;
      if (needsB && splitLines(partiesB).length === 0) return false;
      return true;
    }
    if (idx === 3) {
      return schema.fields.filter((f) => f.required).every((f) => (fieldValues[f.key] ?? "").trim().length > 0);
    }
    return true;
  };
  const canGoNext = stepValid(safeStepIdx);
  const [attemptedNext, setAttemptedNext] = useState(false);
  useEffect(() => { setAttemptedNext(false); }, [safeStepIdx]);
  const completedSteps = STEPS.reduce((acc, _s, i) => (i < safeStepIdx && stepValid(i) ? acc + 1 : acc), 0);
  const progressPct = result
    ? 100
    : Math.min(100, ((completedSteps + (canGoNext ? 1 : 0)) / totalSteps) * 100);

  const missingForStep = (idx: number): string[] => {
    const out: string[] = [];
    if (idx === 0 && !documentType) out.push("Тип на документа");
    if (idx === 1) {
      if (!name.trim()) out.push("Заглавие");
      if (!categoryId) out.push("Категория");
      if (categoryId === "__other__" && !categoryOther.trim()) out.push("Категория (свободен текст)");
    }
    if (idx === 2) {
      const needsB = !!schema.partyBLabel;
      if (splitLines(partiesA).length === 0) out.push(schema.partyALabel);
      if (needsB && splitLines(partiesB).length === 0) out.push(schema.partyBLabel as string);
    }
    if (idx === 3) {
      schema.fields.filter((f) => f.required).forEach((f) => {
        if (!(fieldValues[f.key] ?? "").trim()) out.push(f.label);
      });
    }
    return out;
  };
  const currentMissing = attemptedNext && !canGoNext ? missingForStep(safeStepIdx) : [];

  const handleGenerate = async (userConfirmed = false) => {
    // Нова AI обработка: преградата е преди валидиране, сериализация, вход,
    // аналитика и мрежа. Абонатите НЕ я заобикалят.
    if (!canStartNewProcessing("document_generation")) {
      openPrelaunchWaitlist("document_generation", { source: "wizard" });
      return;
    }
    try { await ensureFeatureDisclaimer("generation"); } catch { return; }
    const docDef = getDocumentType(documentType);
    if (!name.trim()) { toast.error("Въведете заглавие на документа"); return; }
    if (!categoryId) { toast.error("Изберете категория"); return; }
    if (categoryId === "__other__" && !categoryOther.trim()) {
      toast.error("Въведете категория"); return;
    }
    const needsB = !!schema.partyBLabel;
    if (splitLines(partiesA).length === 0 || (needsB && splitLines(partiesB).length === 0)) {
      toast.error(needsB ? "Въведете поне една страна от всяка група" : `Въведете ${schema.partyALabel.toLowerCase()}`);
      return;
    }
    for (const f of schema.fields) {
      if (f.required && !(fieldValues[f.key] ?? "").trim()) {
        toast.error(`Полето „${f.label}" е задължително`);
        return;
      }
    }

    if (busyRef.current) return;
    busyRef.current = true;
    setGenerating(true);
    setGenStepIdx(0);
    const interval = setInterval(() => setGenStepIdx((i) => (i + 1) % GEN_STEPS.length), 5000);
    try {
      trackEvent("build_contract_started", { category: categoryLabel, documentType });
      markDocSelected(documentType);
      trackGenerate("started", { source: "build", doc_key: documentType, category: categoryLabel });
      const customFields = schema.fields.map((f) => ({
        key: f.key, label: f.label, value: (fieldValues[f.key] ?? "").trim(),
      }));
      // Back-compat aliases for legacy server fields
      const get = (k: string) => (fieldValues[k] ?? "").trim();
      const buildPayload = {
        name: name.trim(),
        category: categoryLabel,
        categorySectorId: categoryId === "__other__" ? null : categoryId,
        documentType,
        buildMode,
        bilingual: canBilingual && bilingual,
        parentContext: parentTitleParam ? {
          parentTitle: parentTitleParam,
          refNumber: refNumberParam ? Number(refNumberParam) : null,
          refType: refTypeParam ?? undefined,
        } : undefined,
        partiesA: splitLines(partiesA),
        partiesB: splitLines(partiesB),
        customFields,
        subject: get("subject"),
        term: get("term"),
        prices: get("prices"),
        obligations: get("obligations"),
        other: get("other"),
        userConfirmed,
      };
      // НЕПРОЗРАЧЕН обхват от ЦЕЛИЯ товар: същият ключ при повторен опит,
      // двойно натискане или загубена връзка — без двойно таксуване.
      const buildOpScope = `op:${await opaqueOpScope("build_custom_contract", buildPayload)}`;
      const buildOperationId = getStableOpKey(buildOpScope);
      // invokeEdgeFunction: разопакова 4xx тялото в `data` и повтаря само при
      // мрежов срив — така „Failed to send a request" не се брои за провал на AI.
      let startAttempts = 1;
      const { data, error, correlationId } = await invokeEdgeFunction<
        AIResult & { error?: string; code?: string; requires_login?: boolean }
      >("build-custom-contract", {
        retries: 2,
        onRetry: (attempt, max) => {
          startAttempts = attempt + 1;
          toast.loading(`Опитваме отново… (${attempt}/${max})`, {
            id: "build-retry",
            description: "Връзката прекъсна за момент — данните ви са запазени.",
          });
        },
        body: { ...buildPayload, operation_id: buildOperationId },
      });
      // Лични / чувствителни данни → диалог за потвърждение вместо сурова грешка.
      const sensitive = await parseSensitiveResponse(error, data);
      const genMeta = { correlation_id: correlationId, attempts: startAttempts };
      if (isSpecialCategoryBlocked(sensitive)) {
        trackGenerate("blocked", { source: "build", doc_key: documentType, reason: "sensitive_blocked", ...genMeta });
        setSensitiveClass(sensitive?.classification ?? null);
        setSensitiveBlocked(true);
        setSensitiveOpen(true);
        return;
      }
      if (isConfirmationRequired(sensitive) || (data as { error?: string })?.error === "needs_confirmation") {
        trackGenerate("blocked", { source: "build", doc_key: documentType, reason: "needs_confirmation", ...genMeta });
        setSensitiveClass(sensitive?.classification ?? null);
        setSensitiveBlocked(false);
        setSensitiveOpen(true);
        return;
      }
      // Ограничената правна преграда е възстановимо състояние: нищо не се губи.
      // Точен ръчен повторен опит: същите данни от формата, същото потвърждение.
      if ((await import("@/lib/legalGateClient")).handleLegalVerificationUnavailable(
        { error, data },
        () => { if (!busyRef.current) void handleGenerate(userConfirmed); },
      )) return;
      if (error || !data || data.error) {
        const gen = classifyGenerationError({ error, data: data ?? null });
        if (gen.code === "requires_login") {
          trackGenerate("blocked", { source: "build", doc_key: documentType, reason: gen.code, ...genMeta });
          toast.error(data?.error || "Влезте, за да изградите договора", {
            description: "Въведените данни остават запазени.",
          });
          goAuth({ action: "Изготвяне на документа", onSuccess: () => handleGenerate(userConfirmed) });
          return;
        }
        if (gen.code === "operation_conflict") {
          releaseStableOpKey(buildOpScope);
          toast.error("Заявката се промени. Изпратете отново.", {
            description: "Данните Ви са запазени — натиснете отново „Изготви“, за да продължим.",
          });
          return;
        }
        const err = new Error(data?.error || error?.message || "Неуспешно създаване");
        (err as { gen?: GenerationError }).gen = gen;
        (err as { cid?: string }).cid = error?.correlationId ?? correlationId;
        throw err;
      }
      // ДОКАЗАН КРАЕН УСПЕХ: единственият момент, в който ключът пада.
      releaseStableOpKey(buildOpScope);
      setSavedDocId(undefined);
      setResult(data as AIResult);
      trackEvent("build_contract_generated", { category: categoryLabel });
      trackGenerate("success", { source: "build", doc_key: documentType, category: categoryLabel, ...genMeta });
      trackResultViewed({ source: "build", doc_key: documentType });
      toast.success("Договорът е готов", { description: "Прегледайте резултата отдясно." });
    } catch (e: any) {
      const emsg = String(e?.message || e);
      const cid: string | undefined = e?.cid;
      if (await (await import("@/lib/blockedContent")).handleBlockedIllegalContent(e)) {
        trackGenerate("blocked", { source: "build", doc_key: documentType, reason: "blocked_content", correlation_id: cid });
        return;
      }
      const gen: GenerationError =
        (e?.gen as GenerationError | undefined) ??
        classifyGenerationError({ thrownMessage: emsg, error: { message: emsg, correlationId: cid } });
      trackGenerate(gen.gate ? "blocked" : "fail", {
        source: "build",
        doc_key: documentType,
        reason: gen.code,
        error_class: errorClassOf(gen.code),
        http_status: gen.httpStatus,
        retryable: gen.retryable,
        correlation_id: cid,
      });
      if (gen.code === "quota_exceeded") {
        toast.error("Изчерпан лимит на операциите", {
          description: gen.message,
          action: { label: "Виж опции", onClick: () => goSubscription() },
        });
        return;
      }
      toast.error(gen.code === "network" ? "Връзката бе прекъсната" : "Възникна грешка", {
        description: gen.retryable ? gen.message : `${gen.message}${cid ? ` (код: ${cid.slice(0, 8)})` : ""}`,
        ...(gen.retryable ? { action: { label: "Опитай отново", onClick: () => void handleGenerate(userConfirmed) } } : {}),
        duration: gen.retryable ? 12000 : 8000,
      });
    } finally {
      clearInterval(interval);
      toast.dismiss("build-retry");
      busyRef.current = false;
      setGenerating(false);
    }
  };

  // Автоматичен запис веднага след генериране, за да могат да се свържат
  // приложения. Идентичността е ТОЧНИЯТ резултат — никога категорията:
  // нов резултат дава нов запис, съществуващ документ не се презаписва.
  const saveCoordRef = useRef(createResultSaveCoordinator<object>());
  const saveCoord = saveCoordRef.current;
  saveCoord.setCurrent(result?.contract ?? null, user?.id ?? null);
  const insertResult = useCallback(async (r: AIResult, uid: string, id: string, via: "autosave" | "save"): Promise<string> => {
    if (userRef.current?.id !== uid) throw new Error("owner_changed");
    const finalTitle = (name || r.contract.title).trim() || r.contract.title;
    // Стабилният UUID остава същият при повторение; съдържанието се записва
    // само от контролирания сървърен път, без нова квота или модел.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session || session.user.id !== uid || userRef.current?.id !== uid) throw new Error("owner_changed");
    const saved = await writeSavedDocumentContent({
      action: "create", id, kind: "contract", title: finalTitle,
      payload: { ...r.contract, title: finalTitle },
      source_id: categoryId === "__other__" ? "custom" : categoryId,
    }, { Authorization: `Bearer ${session.access_token}` });
    const savedId = saved.id;
    trackDocumentSaved(savedId, { source: "build", doc_key: documentType, via });
    return savedId;
  }, [name, categoryId, documentType]);
  useEffect(() => {
    if (!result || !user || savedDocId) return;
    const r = result;
    const uid = user.id;
    saveCoord
      .save(r.contract, uid, (id) => insertResult(r, uid, id, "autosave"), (id) => setSavedDocId(id))
      .catch((e) => console.error("auto-save parent failed:", e));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [result, user]);

  // After save, link the new child to the parent we came from (if any).
  useEffect(() => {
    if (!user || !savedDocId) return;
    if (!parentSavedIdParam && !parentUploadedIdParam) return;
    if (!refTypeParam) return;
    (async () => {
      const { linkChildToParent } = await import("@/lib/documentLinks");
      const refNumber = refNumberParam ? Number(refNumberParam) : null;
      const refLabel = `${getDocumentType(documentType).label}${refNumber ? ` № ${refNumber}` : ""}`;
      await linkChildToParent({
        user_id: user.id,
        parent: {
          saved_id: parentSavedIdParam ?? undefined,
          uploaded_id: parentUploadedIdParam ?? undefined,
        },
        child: { saved_id: savedDocId },
        ref_type: refTypeParam as any,
        ref_number: refNumber,
        ref_label: refLabel,
      });
    })().catch((e) => console.error("auto-link parent:", e));
  }, [user, savedDocId, parentSavedIdParam, parentUploadedIdParam, refTypeParam, refNumberParam, documentType]);

  const handleExport = async (format: "pdf" | "docx") => {
    if (!result) return;
    if (!userRef.current) {
      goAuth({ action: `Свали ${format.toUpperCase()}`, onSuccess: () => handleExport(format) });
      return;
    }
    (await import("@/lib/preferredFormat")).setPreferredFormat(format);
    setExporting(format);
    try {
      const sigPayload: SignatureInfo = {
        name_a: signature.name_a || syntheticAnswers.party_a_name || "",
        name_b: signature.name_b || syntheticAnswers.party_b_name || "",
        city: signature.city,
        date: signature.date,
        image_a: isPro ? signature.image_a : undefined,
        image_b: isPro ? signature.image_b : undefined,
      };
      const finalTitle = (name || result.contract.title).trim() || result.contract.title;
      const contractWithSig: GeneratedContract = { ...result.contract, title: finalTitle, signature: sigPayload };
      const res = await downloadDocument({
        analytics_source: "build",
        kind: "contract",
        format,
        title: finalTitle,
        payload: contractWithSig,
        source_id: categoryId === "__other__" ? "custom" : categoryId,
        saved_document_id: savedDocId,
        doc_key: savedDocId || `build:${categoryId}:${finalTitle}`,
      });
      if (!res.ok) {
        if (res.error === "disclaimer_cancelled" || res.error === "unfilled_placeholders") return;
        if (res.error === "quota_exceeded") {
          setQuotaBlocked(true);
        } else {
          toast.error("Грешка при експорт", { description: res.error });
        }
        return;
      }
      if (res.saved_document_id) {
        setSavedDocId(res.saved_document_id);
        trackDocumentSaved(res.saved_document_id, { source: "build", doc_key: documentType, via: "download" });
      }

      // PDF + linked appendices → produce a merged "with appendices" PDF.
      if (format === "pdf" && (savedDocId || res.saved_document_id)) {
        try {
          const { exportPDF } = await import("@/lib/exporters");
          const parentBytes = (await exportPDF(contractWithSig, { returnBytes: true })) as Uint8Array | undefined;
          if (parentBytes) {
            const merged = await mergeParentWithAppendices(
              parentBytes,
              (res.saved_document_id ?? savedDocId) ?? null,
              null,
            );
            if (merged.appended > 0) {
              const { saveAs } = await import("file-saver");
              const cleanTitle = finalTitle.replace(/[^\p{L}\p{N}\s-]/gu, "").trim().replace(/\s+/g, "_").slice(0, 60) || "Document";
              saveAs(new Blob([merged.bytes as BlobPart], { type: "application/pdf" }), `${cleanTitle}_с_приложения.pdf`);
              toast.success(`Прикачени ${merged.appended} приложения`, {
                description: merged.skipped > 0 ? `${merged.skipped} файла бяха пропуснати (несъвместим формат).` : "Свален е и комбиниран PDF.",
              });
            }
          }
        } catch (e) {
          console.error("appendix merge failed:", e);
        }
      }

      toast.success(format === "pdf" ? "PDF изтеглен" : "DOCX изтеглен", {
        description: res.free ? "Повторно сваляне (безплатно)" : "Запазен в Документи → Всички",
      });
    } catch (e: any) {
      toast.error("Грешка при експорт", { description: String(e?.message ?? e) });
    } finally {
      setExporting(null);
    }
  };

  const handleApplyCorrections = async (sel: CorrectionsSelection, correctionsConfirmed = false) => {
    if (!result) return;
    if (!canStartNewProcessing("document_generation")) {
      openPrelaunchWaitlist("document_generation", { source: "wizard" });
      return;
    }
    if (!userRef.current) {
      goAuth({ action: "Прилагане на корекции", onSuccess: () => handleApplyCorrections(sel, correctionsConfirmed) });
      return;
    }
    if (sel.issues.length === 0 && sel.recommendations.length === 0) {
      toast.message("Изберете поне една препоръка за корекция");
      return;
    }
    if (busyRef.current) return;
    busyRef.current = true;
    setApplyingCorrections(true);
    try {
      // НЕПРОЗРАЧЕН обхват от ЦЕЛИЯ товар — същият ключ при повторен опит.
      const acPayloadScope = await opaqueOpScope("apply_corrections", {
        contract: result.contract,
        risk: result.risk,
        selectedIssues: sel.issues,
        selectedRecommendations: sel.recommendations,
        answers: syntheticAnswers,
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
      const { data, error } = await invokeWithMarketingBonus("apply-corrections", {
        body: {
          contract: result.contract,
          risk: result.risk,
          selectedIssues: sel.issues,
          selectedRecommendations: sel.recommendations,
          answers: syntheticAnswers,
          // Q4b — непрозрачният ПОДПИСАН манифест се пренася непроменен и само
          // заедно с точно този документ. Браузърът не го чете и не го създава.
          quality_manifest: result.quality_manifest ?? undefined,
          session_id: getOpSessionId(),
          batch_id: batchId,
          operation_id: operationId,
          userConfirmed: correctionsConfirmed,
        },
      });
      // Ограничената правна преграда е възстановимо състояние: нищо не се губи.
      // Ръчен повторен опит СЪС СЪЩИЯ ключ — затова не се таксува отново.
      if ((await import("@/lib/legalGateClient")).handleLegalVerificationUnavailable(
        { error, data },
        () => { if (!busyRef.current) void handleApplyCorrections(sel, correctionsConfirmed); },
      )) return;
      if (error || data?.error) {
        const code = (data as { code?: string } | null)?.code || "";
        if (
          code === "operation_in_progress" ||
          code === "quota_unavailable" ||
          code === "entitlement_unavailable" ||
          code === "reconciliation_required" ||
          code === "billing_reconciliation_required"
        ) {
          toast.message("Все още се обработва", { description: "Опитайте отново след малко." });
          return;
        }
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
            action: { label: "Предприемач", onClick: () => navigate("/account?tab=subscription") },
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
      });
      setAppliedNotes(Array.isArray(data.applied) ? data.applied : ["Корекциите са приложени"]);
      setSavedDocId(undefined);
      toast.success("Корекциите са приложени", { description: "Прегледайте обновения документ отдясно." });
    } catch (e: any) {
      if (await (await import("@/lib/blockedContent")).handleBlockedIllegalContent(e)) return;
      toast.error("Грешка при корекция", { description: String(e?.message ?? e) });
    } finally {
      busyRef.current = false;
      setApplyingCorrections(false);
    }
  };

  const handleSaveToProfile = async () => {
    if (!result) return;
    if (!userRef.current) {
      goAuth({ action: "Запазване в профила", onSuccess: () => handleSaveToProfile() });
      return;
    }
    if (savedDocId) {
      toast.message("Документът вече е запазен", { description: "Намерете го в Документи → Всички." });
      return;
    }
    setSaving(true);
    try {
      const r = result;
      const uid = userRef.current?.id;
      if (!uid) throw new Error("not_signed_in");
      await saveCoord.save(r.contract, uid, (id) => insertResult(r, uid, id, "save"), (id) => setSavedDocId(id));
      trackEvent("build_contract_saved");
      toast.success("Запазено в профила", { description: "Документи → Всички" });
    } catch (e: any) {
      toast.error("Грешка при запазване", { description: String(e?.message ?? e) });
    } finally {
      setSaving(false);
    }
  };

  const isBilingualTemplate = variant === "bilingual-template";
  const chromeTitle = isBilingualTemplate && presetName ? presetName : "Изготви документ";
  const seoTitle = isBilingualTemplate && presetName
    ? `${presetName} — двуезичен документ (BG/EN) — Dogovori.net`
    : "Изготви документ с AI — Dogovori.net";
  const seoDescription = isBilingualTemplate && presetName
    ? `Изгответе двуезичен документ „${presetName}" на български и английски — клаузите се попълват автоматично, със ЗЗД/ТЗ съответствие.`
    : "Изгответе договор, разписка, пълномощно, декларация, оферта, фактура, протокол, анекс или приложение — клаузите се попълват автоматично, със ЗЗД/ТЗ съответствие.";

  return (
    <div className="min-h-dvh">
      <Seo
        title={seoTitle}
        description={seoDescription}
        canonical={isBilingualTemplate ? undefined : "https://dogovori.net/build"}
        noindex={isBilingualTemplate}
      />
      <Header />

      <GenerationBlockedDialog
        open={quotaBlocked}
        onOpenChange={setQuotaBlocked}
        reason="quota_exceeded"
      />


      {/* Top bar */}
      <div className="sticky top-16 z-30 border-b border-border/60 bg-navy/90 backdrop-blur-xl">
        <div className="container py-3">
          <div className="flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-3">
              <button
                onClick={() => navigate("/")}
                className="flex items-center gap-1 text-muted-foreground transition-colors hover:text-gold"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Начало
              </button>
              <span className="text-muted-foreground">/</span>
              {isBilingualTemplate && (
                <>
                  <button
                    onClick={() => navigate("/catalog")}
                    {...prefetchHandlers("/catalog")}
                    className="text-muted-foreground transition-colors hover:text-gold"
                  >
                    Каталог
                  </button>
                  <span className="text-muted-foreground">/</span>
                </>
              )}
              <span className="font-medium text-foreground line-clamp-1">{chromeTitle}</span>
            </div>
            {/* Тук стои само текущото състояние на документа, без обещания за време. */}
            <div className="hidden items-center gap-3 text-muted-foreground sm:flex">
              <span data-testid="build-topbar-step" className="font-medium text-foreground">
                Стъпка {safeStepIdx + 1} от {totalSteps} · {STEPS[safeStepIdx].label}
              </span>
              {isBilingualTemplate && (
                <>
                  <span className="opacity-50">·</span>
                  <span>Двуезичен · BG + EN</span>
                </>
              )}
            </div>
          </div>
        </div>
      </div>

      <OpsHintBar isPro={isPro} />

      <main className="container py-6 md:py-8">

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* LEFT — form */}
          <section className="space-y-5">
            {sensitiveOpen && (
              <SensitiveDataNotice
                classification={sensitiveClass}
                blocked={sensitiveBlocked}
                preview={draftOutline}
                busy={generating || applyingCorrections}
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

            {!result && (
              <div className="rounded-2xl border border-gold/25 bg-gradient-card p-6 shadow-soft md:p-7">
                <div className="mb-3 flex items-center gap-3">
                  <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-gold/10 ring-1 ring-gold/30">
                    {isBilingualTemplate ? <Languages className="h-4 w-4 text-gold" /> : <Sparkles className="h-4 w-4 text-gold" />}
                  </span>
                  {isBilingualTemplate && presetName ? (
                    <h1 className="font-serif text-2xl font-bold text-foreground md:text-3xl">
                      <span className="gold-gradient-text">{presetName}</span>
                    </h1>
                  ) : (
                    <h1 className="font-serif text-3xl font-bold text-foreground md:text-4xl">
                      Изготви <span className="gold-gradient-text">документ</span>
                    </h1>
                  )}
                </div>

                {parentTitleParam && (
                  <div className="mb-4 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-foreground">
                    Изготвяте дъщерен документ към <span className="font-semibold">„{parentTitleParam}"</span>
                    {refNumberParam ? ` (№ ${refNumberParam})` : ""}. След запазване ще се прикачи автоматично към основния договор.
                  </div>
                )}
                {!user && (
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-lg border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-foreground">
                    <span>За да изградите договор, влезте безплатно с email или Google.</span>
                    <Button size="sm" variant="outline" onClick={() => goAuth({ action: "Запазване на документа" })} className="h-7 border-gold/50 text-xs">
                      Вход
                    </Button>
                  </div>
                )}
                <p className="mb-4 text-[15px] leading-relaxed text-muted-foreground">
                  Попълнете каквото знаете — незададените полета се допълват със
                  стандартен текст, който можете да промените преди сваляне.
                </p>

                <div className="space-y-4" onKeyDown={handleEnterFocusNext}>
                  {/* Stepper */}
                  <div className="rounded-xl border border-border/60 bg-navy-light/40 px-4 py-3">
                    <div className="mb-2 flex items-center justify-between text-[11px] uppercase tracking-[0.18em]">
                      <span className="text-muted-foreground">
                        Стъпка {safeStepIdx + 1} от {totalSteps}
                      </span>
                      <span className="font-semibold text-gold">{STEPS[safeStepIdx].label}</span>
                    </div>
                    <Progress value={progressPct} className="h-1.5 bg-secondary" />
                    <div className="mt-2 hidden gap-1.5 sm:flex">
                      {STEPS.map((s, i) => {
                        const isCurrent = i === safeStepIdx;
                        const isDone = i < safeStepIdx && stepValid(i);
                        return (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => setStepIdx(i)}
                            className={
                              "flex-1 rounded-md px-2 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] transition-colors " +
                              (isCurrent
                                ? "bg-gold/15 text-gold"
                                : isDone
                                ? "text-foreground/70 hover:bg-card/40 hover:text-gold"
                                : "text-muted-foreground/60 hover:bg-card/40 hover:text-foreground")
                            }
                          >
                            {i + 1}. {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* STEP 0 — Settings */}
                  {safeStepIdx === 0 && (
                    <div className="space-y-3 animate-fade-in">
                  {/* Build mode — fast / working / strict */}
                  <div className="rounded-xl border border-border/60 bg-navy-light/40 px-4 py-3 space-y-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Режим <span className="text-gold">*</span>
                      </label>
                      <span className="text-[11px] italic text-muted-foreground line-clamp-1">
                        {BUILD_MODES.find((m) => m.id === buildMode)?.description}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-1.5">
                      {BUILD_MODES.map((m) => {
                        const Icon = m.icon;
                        const active = buildMode === m.id;
                        const locked = m.id === "strict" && !canStrict;
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              if (locked) {
                                toast.message("Стриктен режим е за Pro и Team", {
                                  description: "Преминете към платен план, за да го отключите.",
                                  action: { label: "Виж планове", onClick: goSubscription },
                                });
                                return;
                              }
                              setBuildMode(m.id);
                            }}
                            className={
                              "relative flex items-center justify-center gap-1.5 rounded-lg px-2 py-1.5 text-xs font-medium transition-all " +
                              (active
                                ? "bg-gradient-gold text-navy shadow-gold"
                                : locked
                                ? "border border-border/70 bg-card/20 text-muted-foreground hover:border-gold/40"
                                : "border border-border/70 bg-card/40 text-foreground hover:border-gold/50 hover:text-gold")
                            }
                          >
                            <Icon className="h-3.5 w-3.5" />
                            <span>{m.label}</span>
                            {locked && (
                              <span
                                className="ml-0.5 inline-flex"
                                title="Достъпно за Предприемач / Екип"
                                aria-label="Достъпно за Предприемач / Екип"
                              >
                                <Lock className="h-3 w-3 text-gold/80" />
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Bilingual toggle — Pro / Team only */}
                  <button
                    type="button"
                    onClick={() => {
                      if (!canBilingual) {
                        toast.message("Двуезичен документ е за Pro и Team", {
                          description: "Преминете към платен план, за да генерирате документи на български и английски.",
                          action: { label: "Виж планове", onClick: goSubscription },
                        });
                        return;
                      }
                      setBilingual((v) => !v);
                    }}
                    aria-pressed={bilingual}
                    className={
                      "flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors " +
                      (bilingual && canBilingual
                        ? "border-gold/60 bg-gold/10"
                        : "border-border/60 bg-navy-light/40 hover:border-gold/40")
                    }
                  >
                    <span className="flex items-center gap-3">
                      <span className={
                        "flex h-9 w-9 items-center justify-center rounded-lg " +
                        (bilingual && canBilingual ? "bg-gold/20 text-gold" : "bg-card/40 text-muted-foreground")
                      }>
                        <Languages className="h-4 w-4" />
                      </span>
                      <span className="flex flex-col">
                        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                          Двуезичен документ (BG + EN)
                          {!canBilingual && <Lock className="h-3 w-3 text-gold/80" />}
                        </span>
                        <span className="text-[11px] text-muted-foreground">
                          {canBilingual
                            ? "Всяка клауза се изготвя паралелно на български и английски."
                            : "Достъпно за Предприемач и Екип."}
                        </span>
                      </span>
                    </span>
                    <span className={
                      "relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors " +
                      (bilingual && canBilingual ? "bg-gold" : "bg-border/60")
                    }>
                      <span className={
                        "inline-block h-4 w-4 transform rounded-full bg-navy transition-transform " +
                        (bilingual && canBilingual ? "translate-x-[18px]" : "translate-x-[2px]")
                      } />
                    </span>
                  </button>

                  {/* Bilingual target language — shown only when bilingual is active */}
                  {bilingual && canBilingual && (
                    <div className="rounded-xl border border-gold/30 bg-card/40 p-3">
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Език на превода
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          Прилага се за дясната колона
                        </span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {[
                          { code: "en" as const, short: "EN", flag: "🇬🇧", label: "Английски" },
                          { code: "de" as const, short: "DE", flag: "🇩🇪", label: "Немски" },
                          { code: "fr" as const, short: "FR", flag: "🇫🇷", label: "Френски" },
                          { code: "ru" as const, short: "RU", flag: "🇷🇺", label: "Руски" },
                          { code: "es" as const, short: "ES", flag: "🇪🇸", label: "Испански" },
                          { code: "it" as const, short: "IT", flag: "🇮🇹", label: "Италиански" },
                        ].map((l) => {
                          const active = bilingualLang === l.code;
                          return (
                            <button
                              key={l.code}
                              type="button"
                              onClick={() => setBilingualLang(l.code)}
                              aria-pressed={active}
                              title={l.label}
                              className={
                                "inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-semibold transition-colors " +
                                (active
                                  ? "border-gold bg-gold/15 text-gold"
                                  : "border-border/60 bg-navy-light/30 text-foreground/80 hover:border-gold/40 hover:text-gold")
                              }
                            >
                              <span aria-hidden>{l.flag}</span>
                              <span>{l.short}</span>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}


                  {/* Document type — compact dropdown */}
                  <div>
                    <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                      Вид документ <span className="text-gold">*</span>
                    </label>
                    <Popover open={docTypeOpen} onOpenChange={setDocTypeOpen}>
                      <PopoverTrigger asChild>
                        <button
                          type="button"
                          className="flex w-full items-center justify-between gap-3 rounded-md border border-border/70 bg-input/60 px-3 py-2 text-left text-sm transition-colors hover:border-gold/50"
                        >
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-medium">
                              {getDocumentType(documentType).label}
                            </span>
                            <span className="truncate text-[11px] italic text-muted-foreground">
                              {getDocumentType(documentType).description}
                            </span>
                          </span>
                          <ChevronDown className="h-4 w-4 shrink-0 opacity-70" />
                        </button>
                      </PopoverTrigger>
                      <PopoverContent align="start" className="w-[min(440px,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto p-2">
                        {DOCUMENT_TYPE_GROUPS.map((g) => {
                          const items = DOCUMENT_TYPES.filter((d) => d.group === g.id);
                          if (items.length === 0) return null;
                          return (
                            <div key={g.id} className="mb-1.5 last:mb-0">
                              <div className="px-2 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.14em] text-muted-foreground/70">
                                {g.label}
                              </div>
                              {items.map((d) => {
                                const active = documentType === d.id;
                                return (
                                  <button
                                    key={d.id}
                                    type="button"
                                    onClick={() => {
                                      // Reset downstream content whenever a doc type is (re)selected
                                      // from step 1 — prevents stale name/category/parties/fields
                                      // from a previous type bleeding into the new flow.
                                      setDocumentType(d.id);
                                      markDocSelected(d.id);
                                      setName(
                                        presetDocumentType === d.id && refNumberParam && parentTitleParam
                                          ? `${getDocumentType(d.id).label} № ${refNumberParam} към „${parentTitleParam}”`
                                          : "",
                                      );
                                      setCategoryId(
                                        presetCategory && SECTORS.some((s) => s.id === presetCategory)
                                          ? presetCategory
                                          : "",
                                      );
                                      setCategoryOther("");
                                      setPartiesA(prefillPartiesA ?? "");
                                      setPartiesB(prefillPartiesB ?? "");
                                      setFieldValues(prefillSubject ? { subject: prefillSubject } : {});
                                      setResult(null);
                                      setSavedDocId(undefined);
                                      setAppliedNotes(undefined);
                                      setSignature({ name_a: "", name_b: "", city: "", date: "" });
                                      setSimilarTemplates([]);
                                      setSimilarDismissed(false);
                                      setDocTypeOpen(false);
                                    }}
                                    title={d.description}
                                    className={
                                      "flex w-full items-start gap-2 rounded-sm px-2.5 py-1.5 text-left text-sm transition-colors " +
                                      (active ? "bg-gold/10 text-gold" : "hover:bg-muted/60")
                                    }
                                  >
                                    <Check className={"mt-0.5 h-3.5 w-3.5 shrink-0 " + (active ? "opacity-100" : "opacity-0")} />
                                    <span className="flex min-w-0 flex-col">
                                      <span className="truncate font-medium">{d.shortLabel}</span>
                                      <span className="truncate text-[11px] text-muted-foreground">{d.description}</span>
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          );
                        })}
                      </PopoverContent>
                    </Popover>
                  </div>
                    </div>
                  )}

                  {/* STEP 1 — Basics */}
                  {safeStepIdx === 1 && (
                    <div className="space-y-3 animate-fade-in">
                      <Field label="Заглавие на документа" required>
                        <Input
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          placeholder={`напр. ${getDocumentType(documentType).label} за…`}
                          className="bg-input/60 text-base"
                        />
                        {!similarDismissed && similarTemplates.length > 0 && (
                          <div className="mt-2 rounded-md border border-gold/40 bg-gold/5 p-3 text-sm">
                            <div className="flex items-start gap-2">
                              <Info className="mt-0.5 h-4 w-4 shrink-0 text-gold" aria-hidden />
                              <div className="flex-1 space-y-2">
                                <p className="text-foreground">
                                  Имаме вече подобен{similarTemplates.length > 1 ? "и" : ""} документ{similarTemplates.length > 1 ? "и" : ""} в каталога. Искате ли да го редактирате оттам или да продължите със създаването?
                                </p>
                                <ul className="space-y-1">
                                  {similarTemplates.map((m) => (
                                    <li key={m.entry.slug} className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                                      <Link
                                        to={`/shablon/${m.entry.slug}`}
                                        className="font-medium text-gold underline-offset-2 hover:underline"
                                      >
                                        {m.entry.doc.name}
                                      </Link>
                                      <span className="inline-flex items-center rounded-full border border-border/60 bg-background/60 px-2 py-0.5 text-[11px] text-muted-foreground">
                                        {m.entry.category.title}
                                      </span>
                                      <span className="text-xs text-muted-foreground">
                                        ({Math.round(m.score * 100)}% съвпадение)
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                                <p className="text-xs text-muted-foreground">
                                  Или продължете със създаването на собствен документ по-долу.
                                </p>
                              </div>
                              <button
                                type="button"
                                onClick={() => setSimilarDismissed(true)}
                                className="rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground"
                                aria-label="Скрий предложението"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          </div>
                        )}
                      </Field>

                      <Field label="Категория" required>
                        <div className="grid gap-2 sm:grid-cols-[1fr_auto]">
                          <Select value={categoryId} onValueChange={setCategoryId}>
                            <SelectTrigger className="bg-input/60">
                              <SelectValue placeholder="Изберете категория…" />
                            </SelectTrigger>
                            <SelectContent>
                              {SECTORS.map((s) => (
                                <SelectItem key={s.id} value={s.id}>{s.title}</SelectItem>
                              ))}
                              <SelectItem value="__other__">Друго…</SelectItem>
                            </SelectContent>
                          </Select>
                          {categoryId === "__other__" && (
                            <Input
                              value={categoryOther}
                              onChange={(e) => setCategoryOther(e.target.value)}
                              placeholder="напр. Спортно право"
                              className="bg-input/60"
                            />
                          )}
                        </div>
                      </Field>
                    </div>
                  )}

                  {/* STEP 2 — Parties */}
                  {safeStepIdx === 2 && (
                    <div className="space-y-3 animate-fade-in">
                      {schema.partyBLabel ? (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label={schema.partyALabel} help="Изберете тип и име; може и от контрагенти" required>
                            <PartyListEditor
                              rows={parseParties(partiesA)}
                              onChange={(rows) => setPartiesA(serializeParties(rows))}
                              contacts={contacts}
                              placeholder={schema.partyAPlaceholder ?? '„Алфа Софт" ЕООД, ЕИК…'}
                            />
                          </Field>
                          <Field label={schema.partyBLabel} help="Изберете тип и име; може и от контрагенти" required>
                            <PartyListEditor
                              rows={parseParties(partiesB)}
                              onChange={(rows) => setPartiesB(serializeParties(rows))}
                              contacts={contacts}
                              placeholder={schema.partyBPlaceholder ?? '„Бета Дизайн" ООД, ЕИК…'}
                            />
                          </Field>
                        </div>
                      ) : (
                        <Field label={schema.partyALabel} help="Изберете тип и име; може и от контрагенти" required>
                          <PartyListEditor
                            rows={parseParties(partiesA)}
                            onChange={(rows) => setPartiesA(serializeParties(rows))}
                            contacts={contacts}
                            placeholder={schema.partyAPlaceholder ?? 'Иван Петров Иванов, ЕГН …'}
                          />
                          <p className="mt-1 text-[11px] italic text-muted-foreground">
                            „{getDocumentType(documentType).label}" е едностранен документ — насрещна страна не се изисква.
                          </p>
                        </Field>
                      )}
                    </div>
                  )}

                  {/* STEP 3 — Details (dynamic per-type fields) */}
                  {safeStepIdx === 3 && (
                    <div className="space-y-3 animate-fade-in">
                      {(() => {
                        const out: JSX.Element[] = [];
                        const renderOne = (f: BuildField) => {
                          const v = fieldValues[f.key] ?? "";
                          const common = {
                            value: v,
                            onChange: (e: any) => setField(f.key, e.target.value),
                            placeholder: f.placeholder,
                          };
                          return (
                            <Field key={f.key} label={f.label} help={f.help} hint={f.hint} required={f.required}>
                              {f.kind === "textarea" ? (
                                <Textarea {...common} rows={f.rows ?? 2} className="bg-input/60 text-sm" />
                              ) : (
                                <Input {...common} className="bg-input/60" />
                              )}
                            </Field>
                          );
                        };
                        let i = 0;
                        while (i < schema.fields.length) {
                          const f = schema.fields[i];
                          const next = schema.fields[i + 1];
                          if (f.half && next?.half) {
                            out.push(
                              <div key={`row-${i}`} className="grid gap-4 sm:grid-cols-2">
                                {renderOne(f)}
                                {renderOne(next)}
                              </div>
                            );
                            i += 2;
                          } else {
                            out.push(renderOne(f));
                            i += 1;
                          }
                        }
                        return out;
                      })()}
                      <p className="text-[11px] italic text-muted-foreground">
                        Незададените полета се допълват със стандартен текст, който можете да промените.
                      </p>
                    </div>
                  )}

                  {/* STEP 4 — Review */}
                  {safeStepIdx === 4 && (
                    <div className="space-y-3 animate-fade-in">
                      <div className="rounded-xl border border-border/60 bg-navy-light/40 p-4">
                        <div className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                          Обобщение
                        </div>
                        <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
                          <div>
                            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Вид документ</dt>
                            <dd className="font-medium text-foreground">{getDocumentType(documentType).label}</dd>
                          </div>
                          <div>
                            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Режим</dt>
                            <dd className="font-medium text-foreground">
                              {BUILD_MODES.find((m) => m.id === buildMode)?.label}
                              {bilingual && canBilingual ? " · BG + EN" : ""}
                            </dd>
                          </div>
                          <div>
                            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Заглавие</dt>
                            <dd className="font-medium text-foreground">{name || <span className="text-muted-foreground">—</span>}</dd>
                          </div>
                          <div>
                            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">Категория</dt>
                            <dd className="font-medium text-foreground">{categoryLabel || <span className="text-muted-foreground">—</span>}</dd>
                          </div>
                          <div>
                            <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{schema.partyALabel}</dt>
                            <dd className="font-medium text-foreground">{splitLines(partiesA).join(", ") || <span className="text-muted-foreground">—</span>}</dd>
                          </div>
                          {schema.partyBLabel && (
                            <div>
                              <dt className="text-[11px] uppercase tracking-wider text-muted-foreground">{schema.partyBLabel}</dt>
                              <dd className="font-medium text-foreground">{splitLines(partiesB).join(", ") || <span className="text-muted-foreground">—</span>}</dd>
                            </div>
                          )}
                        </dl>
                      </div>
                      <p className="text-xs italic text-muted-foreground">
                        Прегледайте отдясно как се изгражда документът. Натиснете „Изготви документ", за да финализирате с AI.
                      </p>
                    </div>
                  )}

                  {/* Footer navigation */}
                  {currentMissing.length > 0 && (
                    <div className="rounded-md border border-destructive/50 bg-destructive/5 p-3 text-xs text-destructive">
                      <div className="font-semibold">Моля, попълнете задължителните полета:</div>
                      <ul className="ml-5 mt-1 list-disc space-y-0.5">
                        {currentMissing.map((m) => <li key={m}>{m}</li>)}
                      </ul>
                    </div>
                  )}
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <Button
                      variant="ghost"
                      onClick={() => { setAttemptedNext(false); setStepIdx((i) => Math.max(0, i - 1)); }}
                      disabled={safeStepIdx === 0}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ArrowLeft className="mr-1 h-4 w-4" /> Назад
                    </Button>
                    {safeStepIdx === totalSteps - 1 ? (
                      <Button
                        onClick={() => { if (!canGoNext) { setAttemptedNext(true); return; } handleGenerate(); }}
                        disabled={generating}
                        size="lg"
                        className="bg-gradient-gold text-navy shadow-gold hover:shadow-[0_15px_50px_-10px_hsl(43_55%_54%_/_0.5)]"
                      >
                        {generating ? (
                          <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Изготвяне…</>
                        ) : (
                          <><Wand2 className="mr-2 h-4 w-4" /> Изготви документ</>
                        )}
                      </Button>
                    ) : (
                      <Button
                        onClick={() => {
                          if (!canGoNext) { setAttemptedNext(true); return; }
                          setAttemptedNext(false);
                          setStepIdx((i) => Math.min(totalSteps - 1, i + 1));
                        }}
                        className="bg-gradient-gold text-navy hover:shadow-gold"
                      >
                        Напред <ArrowRight className="ml-1 h-4 w-4" />
                      </Button>
                    )}
                  </div>
                  {generating && (
                    <div className="rounded-lg border border-gold/30 bg-gold/5 p-4 animate-fade-in">
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
              </div>
            )}

            {result && (
              <DocumentValueCard
                documentTitle={result.contract?.title || name}
                needsAuth={!user}
                canDownload={!!user}
                busy={exporting === "pdf"}
                onDownload={() => handleExport("pdf")}
                onRegister={() => goAuth({ action: "Запазване и сваляне на документа" })}
              />
            )}

            {result && (
              <FinalizePane

                result={result}
                isPro={isPro}
                freeWaveAvailable={freeWaveAvailable}
                applyingCorrections={applyingCorrections}
                appliedNotes={appliedNotes}
                syntheticAnswers={syntheticAnswers}
                signature={signature}
                setSignature={setSignature}
                exporting={exporting}
                saving={saving}
                savedDocId={savedDocId}
                signingFreeAvailable={signingFreeAvailable}
                onApplyCorrections={handleApplyCorrections}
                onExport={handleExport}
                onSaveToProfile={handleSaveToProfile}
                setSignDialogOpen={setSignDialogOpen}
                onResetAll={() => {
                  activation.discard();
                  try { localStorage.removeItem(STORAGE_KEY); } catch {}
                  setResult(null);
                  setName(""); setCategoryId(""); setCategoryOther("");
                  setPartiesA(""); setPartiesB("");
                  setFieldValues({});
                  setSavedDocId(undefined);
                  setSignature({ name_a: "", name_b: "", city: "", date: "" });
                }}
              />
            )}
          </section>

          {/* RIGHT — Live draft / Guidance pane */}
          <PreviewPane
            result={result}
            syntheticSector={syntheticSector}
            syntheticAnswers={syntheticAnswers}
            signature={signature}
            isPro={isPro}
            name={name}
            partiesA={partiesA}
            partiesB={partiesB}
            fieldValues={fieldValues}
            bilingual={bilingual}
            bilingualLang={bilingualLang}
            canBilingual={canBilingual}
            documentType={documentType}
            exporting={exporting}
            savedDocId={savedDocId}
            appendixRefreshTick={appendixRefreshTick}
            setAppendixRefreshTick={setAppendixRefreshTick}
            signDialogOpen={signDialogOpen}
            setSignDialogOpen={setSignDialogOpen}
            signingFreeAvailable={signingFreeAvailable}
            refreshPro={refreshPro}
            onExport={handleExport}
            setResult={setResult}
            setSavedDocId={setSavedDocId}
          />
        </div>
      </main>

    </div>
  );
}

