import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  ArrowLeft, Download, RefreshCw, ShieldAlert, ShieldCheck, AlertTriangle,
  Loader2, FileText, Trash2, Bird, Wand2, Copy, Save, Users, PenLine,
} from "lucide-react";
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
  contact_id: string | null;
  created_at: string;
};
type Contact = { id: string; name: string };

const scoreColor = (s: number) => {
  if (s >= 7) return "text-emerald-400 border-emerald-400/40 bg-emerald-400/10";
  if (s >= 5) return "text-amber-300 border-amber-300/40 bg-amber-300/10";
  if (s >= 3) return "text-orange-400 border-orange-400/40 bg-orange-400/10";
  return "text-red-400 border-red-400/40 bg-red-400/10";
};
const scoreLabel = (s: number) => {
  if (s >= 9) return "Изряден договор";
  if (s >= 7) return "Добър договор";
  if (s >= 5) return "Препоръчителни корекции";
  if (s >= 3) return "Проблемен — преговаряй";
  return "Опасен — не подписвай";
};
const scoreSubtext = (s: number) => {
  if (s >= 9) return "Балансиран, без съществени рискове.";
  if (s >= 7) return "Малки несъвършенства, безопасен за подпис.";
  if (s >= 5) return "Има 1-2 средни рискове или липсват важни клаузи.";
  if (s >= 3) return "Съществени неравнопоставености или липсва защита.";
  return "Признаци на престъпна, нищожна или крайно неравнопоставена клауза.";
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
  const [pickerOpen, setPickerOpen] = useState(false);
  const [issueSel, setIssueSel] = useState<Record<number, boolean>>({});
  const [missingSel, setMissingSel] = useState<Record<number, boolean>>({});

  // Editor + metadata
  const [editText, setEditText] = useState("");
  const [titleDraft, setTitleDraft] = useState("");
  const [savingTitle, setSavingTitle] = useState(false);
  const [contactId, setContactId] = useState<string>("none");
  const [contacts, setContacts] = useState<Contact[]>([]);
  const [savingText, setSavingText] = useState(false);
  const [savingContact, setSavingContact] = useState(false);
  const [savedDocId, setSavedDocId] = useState<string | null>(null);
  const [creatingShare, setCreatingShare] = useState(false);

  const load = async () => {
    if (!id || !user) return;
    setLoading(true);
    const [cRes, aRes, kRes] = await Promise.all([
      supabase.from("uploaded_contracts").select("*").eq("id", id).maybeSingle(),
      supabase.from("risk_analyses").select("*").eq("uploaded_contract_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
      supabase.from("contacts").select("id,name").is("deleted_at", null).order("name", { ascending: true }),
    ]);
    const c = (cRes.data as any) ?? null;
    setContract(c);
    setAnalysis((aRes.data as any) ?? null);
    setContacts(((kRes.data as any) ?? []) as Contact[]);
    if (c) {
      setEditText(c.extracted_text ?? "");
      setTitleDraft(c.title ?? "");
      setContactId(c.contact_id ?? "none");
    }
    // Look up an existing shareable saved_documents copy linked via source_id.
    const sd = await supabase
      .from("saved_documents")
      .select("id")
      .eq("user_id", user.id)
      .eq("kind", "contract")
      .eq("source_id", `uploaded:${id}`)
      .maybeSingle();
    setSavedDocId((sd.data as any)?.id ?? null);
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
      if (await (await import("@/lib/blockedContent")).handleBlockedIllegalContent(error)) return;
      const msg = (data as any)?.error ?? error?.message ?? "Грешка";
      toast.error(msg);
      return;
    }
    toast.success("Анализът е обновен");
    load();
  };

  const openPicker = () => {
    if (!analysis) return;
    setIssueSel(Object.fromEntries(analysis.issues.map((_, i) => [i, true])));
    setMissingSel(Object.fromEntries(analysis.missing_clauses.map((_, i) => [i, true])));
    setPickerOpen(true);
  };

  const suggestCorrections = async () => {
    if (!id || !analysis) return;
    const selectedIssues = analysis.issues.filter((_, i) => issueSel[i]);
    const selectedMissing = analysis.missing_clauses.filter((_, i) => missingSel[i]);
    if (selectedIssues.length === 0 && selectedMissing.length === 0) {
      toast.error("Изберете поне едно подобрение");
      return;
    }
    setPickerOpen(false);
    setCorrecting(true);
    const { data, error } = await supabase.functions.invoke("correct-uploaded", {
      body: { uploadedContractId: id, selectedIssues, selectedMissing },
    });
    setCorrecting(false);
    if (error || (data as any)?.error) {
      if (await (await import("@/lib/blockedContent")).handleBlockedIllegalContent(error)) return;
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
    if (contract.storage_path) {
      await supabase.storage.from("user-contracts").remove([contract.storage_path]);
    }
    const { error } = await supabase.from("uploaded_contracts").delete().eq("id", contract.id);
    setDeleting(false);
    setConfirmDelete(false);
    if (error) toast.error(error.message);
    else { toast.success("Изтрит"); navigate("/account?tab=documents"); }
  };

  // SHA-256 of the editor text — kept in sync with extracted_text on save.
  const hashText = async (s: string) => {
    const buf = new TextEncoder().encode(s);
    const h = await crypto.subtle.digest("SHA-256", buf);
    return Array.from(new Uint8Array(h)).map((b) => b.toString(16).padStart(2, "0")).join("");
  };

  const saveText = async () => {
    if (!contract) return;
    const trimmed = editText.trim();
    if (trimmed.length < 80) { toast.error("Текстът е твърде кратък (мин. 80 знака)"); return; }
    setSavingText(true);
    const text_hash = await hashText(trimmed);
    const { error } = await supabase
      .from("uploaded_contracts")
      .update({ extracted_text: trimmed, text_hash })
      .eq("id", contract.id);
    setSavingText(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Текстът е запазен");
    setContract({ ...contract, extracted_text: trimmed, text_hash });
    // If we previously created a shareable copy, refresh its payload.
    if (savedDocId) {
      await supabase
        .from("saved_documents")
        .update({ payload: textToPayload(contract.title, trimmed) })
        .eq("id", savedDocId);
    }
  };

  const saveTitle = async () => {
    if (!contract) return;
    const trimmed = titleDraft.trim();
    if (!trimmed || trimmed === contract.title) {
      setTitleDraft(contract.title);
      return;
    }
    if (trimmed.length > 200) { toast.error("Името е твърде дълго"); return; }
    setSavingTitle(true);
    const { error } = await supabase
      .from("uploaded_contracts")
      .update({ title: trimmed })
      .eq("id", contract.id);
    setSavingTitle(false);
    if (error) { toast.error(error.message); setTitleDraft(contract.title); return; }
    toast.success("Името е обновено");
    setContract({ ...contract, title: trimmed });
    if (savedDocId) {
      await supabase.from("saved_documents").update({ title: trimmed }).eq("id", savedDocId);
    }
  };

  const saveContact = async (next: string) => {
    if (!contract) return;
    setContactId(next);
    setSavingContact(true);
    const { error } = await supabase
      .from("uploaded_contracts")
      .update({ contact_id: next === "none" ? null : next })
      .eq("id", contract.id);
    setSavingContact(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Контрагентът е обновен");
  };

  const textToPayload = (title: string, text: string) => ({
    title,
    clauses: [{ number: "", title: "", body: text }],
  });

  const prepareForSigning = async () => {
    if (!contract || !user) return;
    if ((editText.trim().length || 0) < 80) {
      toast.error("Запазете текста преди подписване");
      return;
    }
    if (savedDocId) return; // already prepared
    setCreatingShare(true);
    const { data, error } = await supabase
      .from("saved_documents")
      .insert({
        user_id: user.id,
        kind: "contract" as any,
        title: contract.title,
        source_id: `uploaded:${contract.id}`,
        contact_id: contract.contact_id,
        payload: textToPayload(contract.title, editText.trim()),
      })
      .select("id")
      .single();
    setCreatingShare(false);
    if (error || !data) { toast.error(error?.message || "Грешка"); return; }
    setSavedDocId((data as any).id);
    toast.success("Готово за подписване");
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
      <div className="min-h-dvh">
        <Header />
        <main className="container py-10 flex items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
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
              <Button onClick={openPicker} disabled={correcting} variant="outline" className="border-gold/40 hover:bg-gold/10 hover:text-gold">
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

        {/* DOCUMENT EDITOR + LINKED CONTACT + SIGNING — always visible */}
        <section className="mt-6 rounded-xl border border-border/60 bg-gradient-card p-5 md:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-serif text-xl font-bold flex items-center gap-2">
              <FileText className="h-5 w-5 text-gold" /> Документ
            </h2>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                onClick={saveText}
                disabled={savingText || editText === contract.extracted_text}
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
            <Button onClick={reanalyze} disabled={analyzing} className="mt-4 bg-gradient-gold text-navy">
              {analyzing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Bird className="mr-2 h-4 w-4" />}
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
                <div className="mt-2 text-sm font-semibold">{scoreLabel(analysis.score)}</div>
                <div className="mt-1 text-xs opacity-80">{scoreSubtext(analysis.score)}</div>
              </div>

              {/* SCALE LEGEND */}
              <div className="rounded-xl border border-border/60 bg-gradient-card p-4">
                <div className="mb-2 text-xs uppercase tracking-wider text-muted-foreground">Скала на оценката</div>
                <ul className="space-y-1.5 text-xs">
                  <li className="flex items-start gap-2"><span className="mt-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full bg-emerald-400" /><span><strong className="text-emerald-300">9-10</strong> · Изряден — балансиран, без рискове</span></li>
                  <li className="flex items-start gap-2"><span className="mt-0.5 inline-block h-2 w-2 flex-shrink-0 rounded-full bg-emerald-400/60" /><span><strong className="text-emerald-300">7-8</strong> · Добър — малки несъвършенства, безопасен</span></li>
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

            </div>
          </div>
        )}
      </main>
    </div>
  );
}
