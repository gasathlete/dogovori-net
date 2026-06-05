import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, ArrowRight, Loader2, FileDown, FileText, Save, Wand2, Sparkles, Zap, Briefcase, Scale, ChevronDown, Check, Languages, ShieldCheck, FileSignature, Lightbulb } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type BuildMode = "fast" | "working" | "strict";
const BUILD_MODES: { id: BuildMode; label: string; short: string; description: string; icon: any }[] = [
  { id: "fast", label: "Бърз", short: "Бърз", description: "По-прости документи без висока прецизност — кратко и ясно.", icon: Zap },
  { id: "working", label: "Разширен", short: "Разширен", description: "Балансирана версия с опционално надграждане.", icon: Briefcase },
  { id: "strict", label: "Стриктен", short: "Стриктен", description: "Подробно, високопрофесионално — съвети и стриктна правна форма.", icon: Scale },
];
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LiveDraft } from "@/components/wizard/LiveDraft";
import { RiskMeter, type RiskLevel } from "@/components/wizard/RiskMeter";
import { RiskReport, type RiskIssue } from "@/components/wizard/RiskReport";
import { SignatureBlock, type SignatureData } from "@/components/wizard/SignatureBlock";
import { CorrectionsPanel, type CorrectionsSelection } from "@/components/wizard/CorrectionsPanel";
import { DetectedReferencesBanner } from "@/components/DetectedReferencesBanner";
import { SECTORS, type Sector } from "@/data/sectors";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_GROUPS, getDocumentType, collectContractText, type DocumentTypeId } from "@/lib/documentReferences";
import { getBuildSchema, type BuildField } from "@/lib/documentFieldSchemas";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { useIsPro } from "@/hooks/useIsPro";
import { toast } from "sonner";
import { type GeneratedContract, type SignatureInfo } from "@/lib/exporters";
import { downloadDocument } from "@/lib/downloadDocument";
import { mergeParentWithAppendices } from "@/lib/appendixMerger";
import { Seo } from "@/components/Seo";
import { trackEvent } from "@/lib/analytics";
import { PartyListEditor, parseParties, serializeParties } from "@/components/wizard/PartyListEditor";
import { Lock } from "lucide-react";
import { findSimilarTemplates, type SimilarTemplate } from "@/lib/templateSimilarity";
import { Link } from "react-router-dom";
import { Info, X } from "lucide-react";

const buildPresetSignature = (params: URLSearchParams) => [
  params.get("category") ?? "",
  params.get("documentType") ?? "",
  params.get("name") ?? "",
  params.get("bilingual") ?? "",
  params.get("parentSavedId") ?? "",
  params.get("parentUploadedId") ?? "",
  params.get("parentTitle") ?? "",
  params.get("refNumber") ?? "",
  params.get("refType") ?? "",
  params.get("partiesA") ?? "",
  params.get("partiesB") ?? "",
  params.get("subject") ?? "",
].join("|");


interface AIResult {
  risk: { level: RiskLevel; score: number; summary: string; issues: RiskIssue[]; recommendations: string[] };
  contract: GeneratedContract;
}

const STORAGE_KEY = "build:custom-contract";

const splitLines = (s: string) =>
  s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

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
  const [searchParams] = useSearchParams();
  const presetSignature = useMemo(() => buildPresetSignature(searchParams), [searchParams]);
  const presetCategory = presetOverride?.category ?? searchParams.get("category") ?? "";
  const presetDocumentType = (presetOverride?.documentType ?? searchParams.get("documentType") ?? "") as DocumentTypeId | "";
  const presetName = presetOverride?.name ?? searchParams.get("name") ?? "";
  const presetBilingual = presetOverride?.bilingual ?? (searchParams.get("bilingual") === "1");
  const parentSavedIdParam = searchParams.get("parentSavedId");
  const parentUploadedIdParam = searchParams.get("parentUploadedId");
  const parentTitleParam = searchParams.get("parentTitle");
  const refNumberParam = searchParams.get("refNumber");
  const refTypeParam = searchParams.get("refType");
  const prefillPartiesA = searchParams.get("partiesA");
  const prefillPartiesB = searchParams.get("partiesB");
  const prefillSubject = searchParams.get("subject");


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
  const setField = (key: string, value: string) =>
    setFieldValues((prev) => ({ ...prev, [key]: value }));

  const [generating, setGenerating] = useState(false);
  const [genStepIdx, setGenStepIdx] = useState(0);
  const [result, setResult] = useState<AIResult | null>(persisted?.result ?? null);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const [signature, setSignature] = useState<SignatureData>(
    persisted?.signature ?? { name_a: "", name_b: "", city: "", date: "" }
  );
  const [savedDocId, setSavedDocId] = useState<string | undefined>(persisted?.savedDocId);
  const [saving, setSaving] = useState(false);
  const { isPro, isTeam } = useIsPro();
  const canStrict = isPro || isTeam;
  const canBilingual = isPro || isTeam;
  const [bilingual, setBilingual] = useState<boolean>(
    presetBilingual || Boolean(persisted?.bilingual),
  );
  const [appendixRefreshTick, setAppendixRefreshTick] = useState(0);
  const [contacts, setContacts] = useState<Array<{ id: string; name: string; type?: string }>>([]);
  const [applyingCorrections, setApplyingCorrections] = useState(false);
  const [appliedNotes, setAppliedNotes] = useState<string[] | undefined>(undefined);
  const [stepIdx, setStepIdx] = useState<number>(0);

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

  // Persist on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        presetSignature,
        documentType, buildMode, bilingual,
        name, categoryId, categoryOther, partiesA, partiesB,
        fieldValues,
        result, signature, savedDocId,
      }));
    } catch {}
  }, [presetSignature, documentType, buildMode, bilingual, name, categoryId, categoryOther, partiesA, partiesB, fieldValues, result, signature, savedDocId]);

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

  const goAuth = () => {
    const dest = window.location.pathname + window.location.search;
    navigate(`/auth?redirect=${encodeURIComponent(dest)}`);
  };
  const goSubscription = () => navigate(`/account?tab=subscription`);

  const schema = useMemo(() => getBuildSchema(documentType), [documentType]);

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
  const completedSteps = STEPS.reduce((acc, _s, i) => (i < safeStepIdx && stepValid(i) ? acc + 1 : acc), 0);
  const progressPct = result
    ? 100
    : Math.min(100, ((completedSteps + (canGoNext ? 1 : 0)) / totalSteps) * 100);

  const handleGenerate = async () => {
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
    if (!user) {
      toast.info("Влезте, за да изградите документа", { description: "Прогресът ви е запазен." });
      goAuth();
      return;
    }

    setGenerating(true);
    setGenStepIdx(0);
    const interval = setInterval(() => setGenStepIdx((i) => (i + 1) % GEN_STEPS.length), 5000);
    try {
      trackEvent("build_contract_started", { category: categoryLabel, documentType });
      const customFields = schema.fields.map((f) => ({
        key: f.key, label: f.label, value: (fieldValues[f.key] ?? "").trim(),
      }));
      // Back-compat aliases for legacy server fields
      const get = (k: string) => (fieldValues[k] ?? "").trim();
      const { data, error } = await supabase.functions.invoke("build-custom-contract", {
        body: {
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
        },
      });
      if (error) {
        const msg = String((error as any)?.message || error);
        // Edge functions return non-2xx as an Error from supabase-js. Try to extract context.
        const ctx: any = (error as any)?.context;
        let parsed: any = null;
        try {
          if (ctx && typeof ctx.json === "function") parsed = await ctx.json();
        } catch { /* ignore */ }
        if (parsed?.code === "auth_required" || msg.includes("401")) {
          toast.error(parsed?.error || "Влезте, за да изградите договора", {
            description: "Пренасочваме ви към входа…",
          });
          setTimeout(goAuth, 900);
          return;
        }
        throw error;
      }
      if (!data || data.error) {
        if (data?.requires_login || data?.code === "auth_required") {
          toast.error(data.error || "Влезте с email или Google, за да продължите");
          setTimeout(goAuth, 900);
          return;
        }
        throw new Error(data?.error || "Неуспешно създаване");
      }
      setResult(data as AIResult);
      trackEvent("build_contract_generated", { category: categoryLabel });
      toast.success("Договорът е готов", { description: "Прегледайте резултата отдясно." });
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

  // Auto-save the parent right after generation so children can be linked immediately.
  // This unlocks the "create appendix/КСС" flow without waiting for an explicit Save click.
  useEffect(() => {
    if (!result || !user || savedDocId || saving) return;
    (async () => {
      try {
        const finalTitle = (name || result.contract.title).trim() || result.contract.title;
        const { data, error } = await supabase
          .from("saved_documents")
          .insert({
            user_id: user.id,
            kind: "contract",
            title: finalTitle,
            payload: { ...result.contract, title: finalTitle } as any,
            source_id: categoryId === "__other__" ? "custom" : categoryId,
          })
          .select("id")
          .single();
        if (error) throw error;
        setSavedDocId(data.id);
      } catch (e) {
        console.error("auto-save parent failed:", e);
      }
    })();
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
    if (!user) { goAuth(); return; }
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
        kind: "contract",
        format,
        title: finalTitle,
        payload: contractWithSig,
        source_id: categoryId === "__other__" ? "custom" : categoryId,
        saved_document_id: savedDocId,
        doc_key: savedDocId || `build:${categoryId}:${finalTitle}`,
      });
      if (!res.ok) {
        if (res.error === "quota_exceeded") {
          toast.error("Изчерпан безплатен лимит", {
            description: "Купете единичен документ за 1.90€ или преминете към Pro.",
            action: { label: "Виж опции", onClick: goSubscription },
          });
        } else {
          toast.error("Грешка при експорт", { description: res.error });
        }
        return;
      }
      if (res.saved_document_id) setSavedDocId(res.saved_document_id);

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

  const handleApplyCorrections = async (sel: CorrectionsSelection) => {
    if (!result) return;
    if (!user) {
      toast.error("Влезте в профила си", { description: "Прогресът е запазен." });
      navigate("/auth");
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
          answers: syntheticAnswers,
          session_id: getOpSessionId(),
          batch_id: newOpBatchId(),
        },
      });
      if (error || data?.error) {
        if (data?.error === "pro_required") {
          toast.error("Нужен е Pro план", {
            description: "Прогресът е запазен.",
            action: { label: "Pro", onClick: () => navigate("/account?tab=subscription") },
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
      setSavedDocId(undefined);
      toast.success("Корекциите са приложени", { description: "Прегледайте обновения документ отдясно." });
    } catch (e: any) {
      if (await (await import("@/lib/blockedContent")).handleBlockedIllegalContent(e)) return;
      toast.error("Грешка при корекция", { description: String(e?.message ?? e) });
    } finally {
      setApplyingCorrections(false);
    }
  };

  const handleSaveToProfile = async () => {
    if (!result) return;
    if (!user) { goAuth(); return; }
    if (savedDocId) {
      toast.message("Документът вече е запазен", { description: "Намерете го в Документи → Всички." });
      return;
    }
    setSaving(true);
    try {
      const finalTitle = (name || result.contract.title).trim() || result.contract.title;
      const { data, error } = await supabase
        .from("saved_documents")
        .insert({
          user_id: user.id,
          kind: "contract",
          title: finalTitle,
          payload: { ...result.contract, title: finalTitle } as any,
          source_id: categoryId === "__other__" ? "custom" : categoryId,
        })
        .select("id")
        .single();
      if (error) throw error;
      setSavedDocId(data.id);
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
    ? `Изгответе двуезичен документ „${presetName}" на български и английски — AI попълва клаузите за минути, със ЗЗД/ТЗ съответствие.`
    : "Изгответе договор, разписка, пълномощно, декларация, оферта, фактура, протокол, анекс или приложение — AI попълва клаузите за минути, със ЗЗД/ТЗ съответствие.";

  return (
    <div className="min-h-screen">
      <Seo
        title={seoTitle}
        description={seoDescription}
        canonical={isBilingualTemplate ? undefined : "https://dogovori.net/build"}
        noindex={isBilingualTemplate}
      />
      <Header />


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
                    className="text-muted-foreground transition-colors hover:text-gold"
                  >
                    Каталог
                  </button>
                  <span className="text-muted-foreground">/</span>
                </>
              )}
              <span className="font-medium text-foreground line-clamp-1">{chromeTitle}</span>
            </div>
            <div className="hidden items-center gap-4 text-muted-foreground sm:flex">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_hsl(142_70%_45%/0.8)]" />
                Системата е в готовност
              </span>
              <span className="opacity-50">·</span>
              <span>{isBilingualTemplate ? "Двуезичен · BG + EN" : "≤ 2 мин · AI-подпомогнат"}</span>
            </div>
          </div>
        </div>
      </div>

      <main className="container py-6 md:py-8">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          {/* LEFT — form */}
          <section className="space-y-5">
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
                    <Button size="sm" variant="outline" onClick={goAuth} className="h-7 border-gold/50 text-xs">
                      Вход
                    </Button>
                  </div>
                )}
                <p className="mb-6 text-sm leading-relaxed text-muted-foreground">
                  Попълнете каквото знаете. <span className="text-gold">Празните полета</span> се попълват от Нашата Система&nbsp; с пазарно-стандартни клаузи. Готов документ до 2 минути.
                </p>

                <div className="space-y-4">
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
                                  description: "Преминете към Pro или Team план, за да го отключите.",
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
                          description: "Преминете към Pro или Team план, за да генерирате документи на български и английски.",
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
                        Празните полета ще бъдат попълнени автоматично с пазарно-стандартни клаузи.
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
                  <div className="flex items-center justify-between gap-3 pt-1">
                    <Button
                      variant="ghost"
                      onClick={() => setStepIdx((i) => Math.max(0, i - 1))}
                      disabled={safeStepIdx === 0}
                      className="text-muted-foreground hover:text-foreground"
                    >
                      <ArrowLeft className="mr-1 h-4 w-4" /> Назад
                    </Button>
                    {safeStepIdx === totalSteps - 1 ? (
                      <Button
                        onClick={handleGenerate}
                        disabled={generating || !canGoNext}
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
                        onClick={() => setStepIdx((i) => Math.min(totalSteps - 1, i + 1))}
                        disabled={!canGoNext}
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
              <div className="space-y-5 animate-fade-in">
                <RiskMeter level={result.risk.level} score={result.risk.score} summary={result.risk.summary} />
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
                    isPro={isPro}
                  />
                </div>

                <SignatureBlock
                  isPro={isPro}
                  defaultPartyA={syntheticAnswers.party_a_name}
                  defaultPartyB={syntheticAnswers.party_b_name}
                  value={signature}
                  onChange={setSignature}
                />

                <div className="rounded-xl border border-gold/30 bg-gradient-card p-6 shadow-soft">
                  <h3 className="mb-1 font-serif text-lg font-bold">Финализиране</h3>
                  <p className="mb-4 text-xs text-muted-foreground">
                    Експорт, подпис и запис в профила — както при шаблонните договори.
                  </p>
                  <div className="flex flex-col gap-2 sm:flex-row">
                    <Button
                      onClick={() => handleExport("pdf")}
                      disabled={!!exporting}
                      className="flex-1 bg-gradient-gold text-navy hover:shadow-gold"
                    >
                      {exporting === "pdf" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileDown className="mr-2 h-4 w-4" />}
                      Свали PDF
                    </Button>
                    <Button
                      onClick={() => handleExport("docx")}
                      disabled={!!exporting}
                      variant="outline"
                      className="flex-1 border-gold/40 hover:bg-gold/10 hover:text-gold"
                    >
                      {exporting === "docx" ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <FileText className="mr-2 h-4 w-4" />}
                      Свали DOCX
                    </Button>
                  </div>
                  <Button
                    onClick={handleSaveToProfile}
                    disabled={saving || !!savedDocId}
                    variant="outline"
                    className="mt-2 w-full border-gold/40 hover:bg-gold/10 hover:text-gold"
                  >
                    {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                    {savedDocId ? "Запазено в профила" : "Запази в профила"}
                  </Button>
                  <Button
                    variant="ghost"
                    onClick={() => {
                      try { localStorage.removeItem(STORAGE_KEY); } catch {}
                      setResult(null);
                      setName(""); setCategoryId(""); setCategoryOther("");
                      setPartiesA(""); setPartiesB("");
                      setFieldValues({});
                      setSavedDocId(undefined);
                      setSignature({ name_a: "", name_b: "", city: "", date: "" });
                    }}
                    className="mt-3 w-full text-xs text-muted-foreground hover:text-gold"
                  >
                    Започни нов договор
                  </Button>
                </div>
              </div>
            )}
          </section>

          {/* RIGHT — Live draft / Guidance pane */}
          <section className="lg:sticky lg:top-32 lg:max-h-[calc(100vh-9rem)] lg:overflow-y-auto">
            {result ? (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gold">
                    <FileText className="h-3.5 w-3.5" />
                    Краен документ
                  </div>
                </div>
                <div className="space-y-4">
                  <DetectedReferencesBanner
                    key={appendixRefreshTick}
                    text={collectContractText(result.contract)}
                    parentSavedId={savedDocId ?? null}
                    parentTitle={name || result.contract.title}
                    parentContext={{
                      partiesA: splitLines(partiesA),
                      partiesB: splitLines(partiesB),
                      subject: (fieldValues.subject ?? "").trim(),
                    }}
                    onChildLinked={() => setAppendixRefreshTick((t) => t + 1)}
                  />
                  <LiveDraft
                    sector={syntheticSector}
                    answers={syntheticAnswers}
                    generated={result.contract}
                    signature={signature}
                    isPro={isPro}
                    onContractChange={(next) => {
                      if (!result) return;
                      setResult({ ...result, contract: { ...result.contract, ...next } });
                      setSavedDocId(undefined);
                    }}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="mb-3 flex items-center justify-between">
                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gold">
                    <FileText className="h-3.5 w-3.5" />
                    Работен документ
                  </div>
                  <span className="text-xs text-muted-foreground">Актуализация в реално време</span>
                </div>
                <LiveDraft
                  sector={syntheticSector}
                  answers={syntheticAnswers}
                  generated={null}
                  isPro={isPro}
                  bilingual={bilingual && canBilingual}
                  docName={name}
                  documentType={documentType}
                />
              </>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}

function Field({
  label,
  required,
  hint,
  help,
  children,
}: {
  label: string;
  required?: boolean;
  hint?: string;
  help?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-baseline justify-between gap-2">
        <Label className="text-sm font-medium text-foreground">
          {label}
          {required && <span className="ml-1 text-gold">*</span>}
        </Label>
        {hint && <span className="text-[11px] italic text-muted-foreground">{hint}</span>}
      </div>
      {help && <p className="text-[11px] text-muted-foreground">{help}</p>}
      {children}
    </div>
  );
}
