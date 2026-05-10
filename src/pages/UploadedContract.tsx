import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Download, RefreshCw, ShieldAlert, ShieldCheck, AlertTriangle,
  Loader2, FileText, Trash2, Sparkles, Wand2, Copy,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { copyToClipboard } from "@/lib/clipboard";


type Issue = {
  severity: "low" | "medium" | "high";
  title: string;
  clause?: string;
  explanation: string;
  suggestion?: string;
};
type Missing = { name: string; why: string };
type Analysis = {
  id: string;
  score: number;
  contract_type: string;
  summary: string;
  issues: Issue[];
  missing_clauses: Missing[];
  created_at: string;
  text_hash: string;
  model: string;
};
type Contract = {
  id: string;
  title: string;
  source: string;
  storage_path: string | null;
  original_filename: string | null;
  text_hash: string;
  extracted_text: string;
  created_at: string;
};

const scoreColor = (s: number) => {
  if (s >= 8) return "text-emerald-400 border-emerald-400/40 bg-emerald-400/10";
  if (s >= 5) return "text-amber-300 border-amber-300/40 bg-amber-300/10";
  return "text-red-400 border-red-400/40 bg-red-400/10";
};
const sevColor = (s: Issue["severity"]) =>
  s === "high" ? "border-red-400/40 bg-red-400/10 text-red-300"
  : s === "medium" ? "border-amber-300/40 bg-amber-300/10 text-amber-200"
  : "border-emerald-400/30 bg-emerald-400/5 text-emerald-200";
const sevLabel = (s: Issue["severity"]) => s === "high" ? "ВИСОК" : s === "medium" ? "СРЕДЕН" : "НИСЪК";

export default function UploadedContractPage() {
  const { id } = useParams<{ id: string }>();
  const { user } = useAuth();
  const navigate = useNavigate();

  const [contract, setContract] = useState<Contract | null>(null);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [loading, setLoading] = useState(true);
  const [analyzing, setAnalyzing] = useState(false);
  const [correcting, setCorrecting] = useState(false);
  const [corrections, setCorrections] = useState<{ corrected_text: string; changes: string[] } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const load = async () => {
    if (!id || !user) return;
    setLoading(true);
    const [cRes, aRes] = await Promise.all([
      supabase.from("uploaded_contracts").select("*").eq("id", id).maybeSingle(),
      supabase.from("risk_analyses").select("*").eq("uploaded_contract_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ]);
    setContract((cRes.data as any) ?? null);
    setAnalysis((aRes.data as any) ?? null);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [id, user]);

  const reanalyze = async () => {
    if (!id) return;
    setAnalyzing(true);
    const { data, error } = await supabase.functions.invoke("analyze-contract", {
      body: { uploadedContractId: id },
    });
    setAnalyzing(false);
    if (error || (data as any)?.error) {
      const msg = (data as any)?.error ?? error?.message ?? "Грешка";
      toast.error(msg);
      return;
    }
    toast.success("Анализът е обновен");
    load();
  };

  const suggestCorrections = async () => {
    if (!id) return;
    setCorrecting(true);
    const { data, error } = await supabase.functions.invoke("correct-uploaded", {
      body: { uploadedContractId: id },
    });
    setCorrecting(false);
    if (error || (data as any)?.error) {
      const msg = (data as any)?.error ?? error?.message ?? "Грешка";
      if (msg === "pro_required") {
        toast.error("Тази функция е достъпна само за Pro абонати");
        navigate("/account?tab=plan");
      } else {
        toast.error(msg);
      }
      return;
    }
    setCorrections(data as any);
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
    try {
      if (contract.storage_path) {
        const { error: storageError } = await supabase.storage
          .from("user-contracts")
          .remove([contract.storage_path]);
        if (storageError) console.warn("storage remove failed:", storageError);
      }
      const { error } = await supabase
        .from("uploaded_contracts")
        .delete()
        .eq("id", contract.id);
      if (error) {
        console.error("delete uploaded_contract failed:", error);
        toast.error("Грешка при изтриване: " + error.message);
        return;
      }
      toast.success("Изтрит");
      setConfirmDelete(false);
      navigate("/account?tab=documents");
    } catch (e: any) {
      console.error(e);
      toast.error("Грешка при изтриване: " + (e?.message ?? "неизвестна"));
    } finally {
      setDeleting(false);
    }
  };

  const issuesByLevel = useMemo(() => {
    if (!analysis) return { high: 0, medium: 0, low: 0 };
    return analysis.issues.reduce(
      (acc, i) => { acc[i.severity] = (acc[i.severity] ?? 0) + 1; return acc; },
      { high: 0, medium: 0, low: 0 } as Record<string, number>,
    );
  }, [analysis]);

  if (loading) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="container py-10 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </main>
      </div>
    );
  }

  if (!contract) {
    return (
      <div className="min-h-screen">
        <Header />
        <main className="container py-10">
          <p>Договорът не е намерен.</p>
          <Link to="/account?tab=documents" className="text-gold">← Към профила</Link>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container py-6 md:py-10">
        <Link to="/account?tab=documents" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gold">
          <ArrowLeft className="h-3 w-3" /> Към моите документи
        </Link>

        <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="font-serif text-3xl font-bold">{contract.title}</h1>
            <div className="mt-1 text-xs text-muted-foreground">
              Качен на {new Date(contract.created_at).toLocaleDateString("bg-BG")} · {contract.source.toUpperCase()}
              {contract.original_filename && <> · {contract.original_filename}</>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {contract.storage_path && (
              <Button variant="outline" onClick={downloadOriginal}>
                <Download className="mr-2 h-4 w-4" /> Свали оригинала
              </Button>
            )}
            <Button onClick={reanalyze} disabled={analyzing} className="bg-gradient-gold text-navy">
              {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-2 h-4 w-4" />}
              {analysis ? "Анализирай отново" : "Стартирай анализ"}
            </Button>
            {analysis && (
              <Button onClick={suggestCorrections} disabled={correcting} variant="outline" className="border-gold/40 hover:bg-gold/10 hover:text-gold">
                {correcting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                Предложи корекции
              </Button>
            )}
            <Button variant="ghost" className="text-destructive" onClick={remove}>
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        <Dialog open={!!corrections} onOpenChange={(o) => !o && setCorrections(null)}>
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="font-serif">Предложени корекции</DialogTitle>
            </DialogHeader>
            {corrections && (
              <div className="space-y-4">
                {corrections.changes?.length > 0 && (
                  <div className="rounded-lg border border-gold/30 bg-gold/5 p-3">
                    <div className="text-xs uppercase tracking-wider text-gold mb-2">Ключови промени</div>
                    <ul className="list-disc list-inside text-sm space-y-1">
                      {corrections.changes.map((c, i) => <li key={i}>{c}</li>)}
                    </ul>
                  </div>
                )}
                <div className="rounded-lg bg-white p-4 text-sm leading-relaxed text-gray-900 whitespace-pre-wrap font-serif max-h-[50vh] overflow-y-auto">
                  {corrections.corrected_text}
                </div>
                <div className="flex gap-2">
                  <Button onClick={async () => { const ok = await copyToClipboard(corrections.corrected_text); ok ? toast.success("Копирано") : toast.error("Копирането не е разрешено"); }} className="bg-gradient-gold text-navy">
                    <Copy className="mr-2 h-4 w-4" /> Копирай
                  </Button>
                  <Button variant="outline" onClick={() => {
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

        {!analysis ? (
          <div className="mt-8 rounded-xl border border-border/60 bg-gradient-card p-10 text-center">
            <Sparkles className="mx-auto h-8 w-8 text-gold" />
            <p className="mt-3 text-sm text-muted-foreground">Все още няма анализ за този договор.</p>
            <Button onClick={reanalyze} disabled={analyzing} className="mt-4 bg-gradient-gold text-navy">
              {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
              Стартирай AI риск-анализ
            </Button>
          </div>
        ) : (
          <div className="mt-6 grid gap-6 lg:grid-cols-[280px_1fr]">
            {/* SCORE PANEL */}
            <aside className="space-y-4">
              <div className={`rounded-xl border p-6 text-center ${scoreColor(analysis.score)}`}>
                <div className="text-xs uppercase tracking-wider opacity-80">Risk Score</div>
                <div className="mt-2 font-serif text-5xl font-bold">{analysis.score}<span className="text-xl opacity-60">/10</span></div>
                <div className="mt-2 text-xs">
                  {analysis.score >= 8 ? "Балансиран договор" : analysis.score >= 5 ? "Препоръчителни корекции" : "Сериозни рискове"}
                </div>
              </div>
              <div className="rounded-xl border border-border/60 bg-gradient-card p-4 space-y-2 text-sm">
                <div className="flex items-center justify-between"><span className="flex items-center gap-2"><ShieldAlert className="h-4 w-4 text-red-400" />Висок</span><strong>{issuesByLevel.high}</strong></div>
                <div className="flex items-center justify-between"><span className="flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-amber-300" />Среден</span><strong>{issuesByLevel.medium}</strong></div>
                <div className="flex items-center justify-between"><span className="flex items-center gap-2"><ShieldCheck className="h-4 w-4 text-emerald-400" />Нисък</span><strong>{issuesByLevel.low}</strong></div>
              </div>
              <div className="rounded-xl border border-border/60 bg-gradient-card p-4 text-xs text-muted-foreground">
                <div className="mb-1 uppercase tracking-wider">Анализ от</div>
                <div>{new Date(analysis.created_at).toLocaleString("bg-BG")}</div>
                <div className="mt-2">Модел: {analysis.model}</div>
                {analysis.text_hash !== contract.text_hash && (
                  <div className="mt-2 rounded bg-amber-300/10 p-2 text-amber-300">
                    Договорът е променен след последния анализ.
                  </div>
                )}
              </div>
            </aside>

            <div className="space-y-6">
              {/* TYPE & SUMMARY */}
              <section className="rounded-xl border border-border/60 bg-gradient-card p-6">
                <div className="text-xs uppercase tracking-wider text-gold">{analysis.contract_type || "Тип договор"}</div>
                <h2 className="mt-2 font-serif text-xl font-bold">Резюме</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{analysis.summary}</p>
              </section>

              {/* ISSUES */}
              <section className="rounded-xl border border-border/60 bg-gradient-card p-6">
                <h2 className="font-serif text-xl font-bold">Проблемни клаузи ({analysis.issues.length})</h2>
                {analysis.issues.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">Не са открити съществени правни рискове.</p>
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

              {/* MISSING */}
              <section className="rounded-xl border border-border/60 bg-gradient-card p-6">
                <h2 className="font-serif text-xl font-bold">Липсващи стандартни клаузи ({analysis.missing_clauses.length})</h2>
                {analysis.missing_clauses.length === 0 ? (
                  <p className="mt-3 text-sm text-muted-foreground">Всички основни клаузи присъстват.</p>
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

              {/* RAW TEXT (collapsed) */}
              <details className="rounded-xl border border-border/60 bg-gradient-card p-6">
                <summary className="cursor-pointer font-serif text-base font-bold text-gold">
                  <FileText className="mr-2 inline h-4 w-4" /> Покажи извлечения текст
                </summary>
                <pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-background/50 p-3 text-xs text-muted-foreground">
                  {contract.extracted_text}
                </pre>
              </details>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
