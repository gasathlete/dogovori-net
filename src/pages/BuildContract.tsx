import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowLeft, Bird, Loader2, FileDown, FileText, Save, Wand2, Sparkles, ShieldCheck, FileSignature, Lightbulb } from "lucide-react";
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
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { type GeneratedContract, type SignatureInfo } from "@/lib/exporters";
import { downloadDocument } from "@/lib/downloadDocument";
import { mergeParentWithAppendices } from "@/lib/appendixMerger";
import { Seo } from "@/components/Seo";
import { trackEvent } from "@/lib/analytics";


interface AIResult {
  risk: { level: RiskLevel; score: number; summary: string; issues: RiskIssue[]; recommendations: string[] };
  contract: GeneratedContract;
}

const STORAGE_KEY = "build:custom-contract";

const splitLines = (s: string) =>
  s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);

export default function BuildContractPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const presetCategory = searchParams.get("category") ?? "";
  const presetDocumentType = (searchParams.get("documentType") ?? "") as DocumentTypeId | "";
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

  const [name, setName] = useState<string>(
    presetDocumentType && refNumberParam && parentTitleParam
      ? `${getDocumentType(presetDocumentType).label} № ${refNumberParam} към „${parentTitleParam}"`
      : (persisted?.name ?? "")
  );
  const [categoryId, setCategoryId] = useState<string>(
    presetCategory && SECTORS.some((s) => s.id === presetCategory)
      ? presetCategory
      : (persisted?.categoryId ?? ""),
  );
  const [categoryOther, setCategoryOther] = useState<string>(persisted?.categoryOther ?? "");
  const [partiesA, setPartiesA] = useState<string>(prefillPartiesA ?? persisted?.partiesA ?? "");
  const [partiesB, setPartiesB] = useState<string>(prefillPartiesB ?? persisted?.partiesB ?? "");
  const [subject, setSubject] = useState<string>(prefillSubject ?? persisted?.subject ?? "");
  const [term, setTerm] = useState<string>(persisted?.term ?? "");
  const [prices, setPrices] = useState<string>(persisted?.prices ?? "");
  const [obligations, setObligations] = useState<string>(persisted?.obligations ?? "");
  const [other, setOther] = useState<string>(persisted?.other ?? "");

  const [generating, setGenerating] = useState(false);
  const [genStepIdx, setGenStepIdx] = useState(0);
  const [result, setResult] = useState<AIResult | null>(persisted?.result ?? null);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const [signature, setSignature] = useState<SignatureData>(
    persisted?.signature ?? { name_a: "", name_b: "", city: "", date: "" }
  );
  const [savedDocId, setSavedDocId] = useState<string | undefined>(persisted?.savedDocId);
  const [saving, setSaving] = useState(false);
  const [isPro, setIsPro] = useState(false);
  const [appendixRefreshTick, setAppendixRefreshTick] = useState(0);
  const [applyingCorrections, setApplyingCorrections] = useState(false);
  const [appliedNotes, setAppliedNotes] = useState<string[] | undefined>(undefined);

  // Persist on every change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        documentType,
        name, categoryId, categoryOther, partiesA, partiesB,
        subject, term, prices, obligations, other,
        result, signature, savedDocId,
      }));
    } catch {}
  }, [documentType, name, categoryId, categoryOther, partiesA, partiesB, subject, term, prices, obligations, other, result, signature, savedDocId]);

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
    if (!user) { setIsPro(false); return; }
    supabase.from("download_quota").select("plan, pro_until").eq("user_id", user.id).maybeSingle()
      .then(({ data }) => {
        if (!data) return;
        setIsPro(data.plan === "pro" || (!!data.pro_until && new Date(data.pro_until) > new Date()));
      });
  }, [user]);

  const categoryLabel = useMemo(() => {
    if (categoryId === "__other__") return categoryOther.trim();
    const s = SECTORS.find((x) => x.id === categoryId);
    return s?.title ?? "";
  }, [categoryId, categoryOther]);

  // Synthetic sector — used by LiveDraft so signature block and party labels work.
  const syntheticSector = useMemo<Sector>(() => {
    const matched = SECTORS.find((x) => x.id === categoryId);
    return {
      id: "custom",
      title: categoryLabel || "Свободен договор",
      subtitle: "Свободно изготвен договор",
      icon: "FileText",
      description: "",
      contractName: name || matched?.contractName || "Договор",
      parties: matched?.parties ?? { a: "Възложителя", b: "Изпълнителя" },
      questions: [],
    };
  }, [categoryId, categoryLabel, name]);

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

  const handleGenerate = async () => {
    const docDef = getDocumentType(documentType);
    if (!name.trim()) { toast.error("Въведете заглавие на документа"); return; }
    if (!categoryId) { toast.error("Изберете категория"); return; }
    if (categoryId === "__other__" && !categoryOther.trim()) {
      toast.error("Въведете категория"); return;
    }
    if (docDef.needsParties && (splitLines(partiesA).length === 0 || splitLines(partiesB).length === 0)) {
      toast.error("Въведете поне една страна от всяка група");
      return;
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
      const { data, error } = await supabase.functions.invoke("build-custom-contract", {
        body: {
          name: name.trim(),
          category: categoryLabel,
          categorySectorId: categoryId === "__other__" ? null : categoryId,
          documentType,
          parentContext: parentTitleParam ? {
            parentTitle: parentTitleParam,
            refNumber: refNumberParam ? Number(refNumberParam) : null,
            refType: refTypeParam ?? undefined,
          } : undefined,
          partiesA: splitLines(partiesA),
          partiesB: splitLines(partiesB),
          subject: subject.trim(),
          term: term.trim(),
          prices: prices.trim(),
          obligations: obligations.trim(),
          other: other.trim(),
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
      const { data, error } = await supabase.functions.invoke("apply-corrections", {
        body: {
          contract: result.contract,
          risk: result.risk,
          selectedIssues: sel.issues,
          selectedRecommendations: sel.recommendations,
          answers: syntheticAnswers,
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

  return (
    <div className="min-h-screen">
      <Seo
        title="Изготви документ с AI — Dogovori.net"
        description="Изгответе договор, разписка, пълномощно, декларация, оферта, фактура, протокол, анекс или приложение — AI попълва клаузите за минути, със ЗЗД/ТЗ съответствие."
        canonical="https://dogovori.net/build"
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
              <span className="font-medium text-foreground">Изготви документ</span>
            </div>
            <div className="hidden items-center gap-4 text-muted-foreground sm:flex">
              <span className="inline-flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_hsl(142_70%_45%/0.8)]" />
                AI готовност
              </span>
              <span className="opacity-50">·</span>
              <span>≤ 2 мин · AI-подпомогнат</span>
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
                    <Sparkles className="h-4 w-4 text-gold" />
                  </span>
                  <h1 className="font-serif text-3xl font-bold text-foreground md:text-4xl">
                    Изготви <span className="gold-gradient-text">документ</span>
                  </h1>
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
                  Попълнете каквото знаете. <span className="text-gold">Празните полета</span> се попълват от AI с пазарно-стандартни клаузи. Готов документ до 2 минути.
                </p>

                <div className="space-y-5">
                  {/* Document type — grouped chips in a tinted panel */}
                  <div className="rounded-xl border border-border/60 bg-navy-light/40 p-4 space-y-4">
                    <div className="flex items-baseline justify-between">
                      <label className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
                        Вид документ <span className="text-gold">*</span>
                      </label>
                      <span className="text-[11px] italic text-muted-foreground line-clamp-1">
                        {getDocumentType(documentType).description}
                      </span>
                    </div>
                    <div className="grid gap-x-5 gap-y-4 sm:grid-cols-2">
                      {DOCUMENT_TYPE_GROUPS.map((g) => {
                        const items = DOCUMENT_TYPES.filter((d) => d.group === g.id);
                        if (items.length === 0) return null;
                        const hasActive = items.some((d) => d.id === documentType);
                        return (
                          <div key={g.id} className="space-y-2">
                            <div
                              className={
                                "text-[10px] font-bold uppercase tracking-tighter " +
                                (hasActive ? "text-gold" : "text-muted-foreground/70")
                              }
                            >
                              {g.label}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {items.map((d) => {
                                const active = documentType === d.id;
                                return (
                                  <button
                                    key={d.id}
                                    type="button"
                                    onClick={() => setDocumentType(d.id)}
                                    title={d.description}
                                    className={
                                      "rounded-full px-3 py-1.5 text-xs font-medium transition-all " +
                                      (active
                                        ? "bg-gradient-gold text-navy shadow-gold"
                                        : "border border-border/70 bg-card/40 text-foreground hover:border-gold/50 hover:text-gold")
                                    }
                                  >
                                    {d.shortLabel}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>

                  <Field label="Заглавие на документа" required>
                    <Input
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      placeholder={`напр. ${getDocumentType(documentType).label} за…`}
                      className="bg-input/60 text-base"
                    />
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

                  {getDocumentType(documentType).needsParties ? (
                    <div className="grid gap-4 sm:grid-cols-2">
                      <Field label="Възложител/и" help="По един на ред" required>
                        <Textarea
                          value={partiesA}
                          onChange={(e) => setPartiesA(e.target.value)}
                          placeholder={'„Алфа Софт" ЕООД, ЕИК...\nИван Иванов'}
                          rows={3}
                          className="bg-input/60 text-sm"
                        />
                      </Field>
                      <Field label="Изпълнител/и" help="По един на ред" required>
                        <Textarea
                          value={partiesB}
                          onChange={(e) => setPartiesB(e.target.value)}
                          placeholder={'„Бета Дизайн" ООД, ЕИК...'}
                          rows={3}
                          className="bg-input/60 text-sm"
                        />
                      </Field>
                    </div>
                  ) : (
                    <Field label="Деклариращ / съставител" help="Имена, адрес, ЕГН (по избор)" required>
                      <Textarea
                        value={partiesA}
                        onChange={(e) => setPartiesA(e.target.value)}
                        placeholder={'Иван Петров Иванов, ЕГН ..., адрес ...'}
                        rows={3}
                        className="bg-input/60 text-sm"
                      />
                      <p className="mt-1 text-[11px] italic text-muted-foreground">
                        „{getDocumentType(documentType).label}" е едностранен документ — насрещна страна не се изисква.
                      </p>
                    </Field>
                  )}

                  <Field label="Предмет" hint="празно → AI предлага">
                    <Textarea
                      value={subject}
                      onChange={(e) => setSubject(e.target.value)}
                      placeholder="Какво се възлага / какво се изпълнява…"
                      rows={2}
                      className="bg-input/60 text-sm"
                    />
                  </Field>

                  <div className="grid gap-4 sm:grid-cols-2">
                    <Field label="Срок" hint="празно → AI предлага">
                      <Input
                        value={term}
                        onChange={(e) => setTerm(e.target.value)}
                        placeholder="напр. 6 месеца от подписване"
                        className="bg-input/60"
                      />
                    </Field>
                    <Field label="Цени и плащане" hint="празно → AI предлага">
                      <Input
                        value={prices}
                        onChange={(e) => setPrices(e.target.value)}
                        placeholder="напр. 12 000 € на 3 транша"
                        className="bg-input/60"
                      />
                    </Field>
                  </div>

                  <Field label="Задължения" hint="празно → AI предлага">
                    <Textarea
                      value={obligations}
                      onChange={(e) => setObligations(e.target.value)}
                      placeholder="Конкретни задължения на страните…"
                      rows={2}
                      className="bg-input/60 text-sm"
                    />
                  </Field>

                  <Field label="Други" hint="специфики, гаранции, NDA, IP…">
                    <Textarea
                      value={other}
                      onChange={(e) => setOther(e.target.value)}
                      placeholder="Всичко уникално, което трябва да се отрази…"
                      rows={2}
                      className="bg-input/60 text-sm"
                    />
                  </Field>

                  <Button
                    onClick={handleGenerate}
                    disabled={generating}
                    size="lg"
                    className="w-full bg-gradient-gold text-navy shadow-gold hover:shadow-[0_15px_50px_-10px_hsl(43_55%_54%_/_0.5)]"
                  >
                    {generating ? (
                      <><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Изготвяне…</>
                    ) : (
                      <><Wand2 className="mr-2 h-4 w-4" /> Изготви документ (≤ 2 мин.)</>
                    )}
                  </Button>

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
                      setSubject(""); setTerm(""); setPrices(""); setObligations(""); setOther("");
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
                      subject: subject.trim(),
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
              <div className="flex h-[700px] flex-col overflow-hidden rounded-2xl border border-border/60 bg-gradient-card shadow-soft">
                {/* Preview header */}
                <div className="flex items-center justify-between border-b border-border/60 bg-navy-light/40 px-6 py-4">
                  <h3 className="font-serif text-lg font-semibold uppercase tracking-[0.18em] text-gold">
                    Предварителен изглед
                  </h3>
                  <div className="flex gap-1.5">
                    <span className="h-2 w-2 rounded-full bg-border" />
                    <span className="h-2 w-2 rounded-full bg-border" />
                    <span className="h-2 w-2 rounded-full bg-border" />
                  </div>
                </div>

                {/* Preview body */}
                <div className="flex-1 space-y-8 overflow-y-auto p-6 md:p-8">
                  {/* Skeleton document silhouette */}
                  <div className="space-y-3 opacity-40">
                    <div className="h-3 w-1/4 rounded bg-foreground/15" />
                    <div className="mb-5 h-7 w-3/4 rounded bg-foreground/15" />
                    <div className="space-y-2">
                      <div className="h-2.5 rounded bg-foreground/10" />
                      <div className="h-2.5 rounded bg-foreground/10" />
                      <div className="h-2.5 w-2/3 rounded bg-foreground/10" />
                    </div>
                  </div>

                  {/* What you'll get */}
                  <div className="relative rounded-xl border border-border/60 bg-card/40 px-5 py-6">
                    <div className="absolute -top-2.5 left-5 rounded bg-navy px-2 text-[10px] font-bold uppercase tracking-[0.18em] text-gold">
                      Какво ще получите
                    </div>
                    <ul className="space-y-4">
                      <li className="flex items-start gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/10 ring-1 ring-gold/25">
                          <ShieldCheck className="h-4 w-4 text-gold" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">Юридически издържана структура</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                            Пълен набор от клаузи съобразно ЗЗД и Търговския закон.
                          </p>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/10 ring-1 ring-gold/25">
                          <Sparkles className="h-4 w-4 text-gold" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">AI адаптация</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                            Автоматично генерирани детайли според въведения от Вас предмет.
                          </p>
                        </div>
                      </li>
                      <li className="flex items-start gap-3">
                        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gold/10 ring-1 ring-gold/25">
                          <FileSignature className="h-4 w-4 text-gold" />
                        </span>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold text-foreground">Готов за подписване PDF / DOCX</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
                            Професионално форматиран документ, готов за печат или електронен подпис.
                          </p>
                        </div>
                      </li>
                    </ul>
                  </div>

                  {/* Tip */}
                  <div className="flex items-start gap-3 rounded-xl border border-gold/20 bg-gold/5 p-4">
                    <Lightbulb className="h-4 w-4 flex-shrink-0 text-gold" />
                    <p className="text-xs italic leading-relaxed text-foreground/80">
                      Съвет: Колкото по-подробно опишете предмета и задълженията, толкова по-прецизен ще бъде финалният резултат.
                    </p>
                  </div>
                </div>

                {/* Preview footer */}
                <div className="border-t border-border/60 bg-navy-light/40 px-6 py-4 text-center backdrop-blur-sm">
                  <p className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground">
                    Попълнете формата вляво, за да видите проекта тук
                  </p>
                </div>
              </div>
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
