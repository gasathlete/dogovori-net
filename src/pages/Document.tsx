import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, Download, FileDown, FileText, Loader2, Pencil, Save, Trash2, User } from "lucide-react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LiveDraft } from "@/components/wizard/LiveDraft";
import { ProtectedContent } from "@/components/ProtectedContent";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { downloadDocument } from "@/lib/downloadDocument";
import { toast } from "sonner";
import type { GeneratedContract } from "@/lib/exporters";
import type { Sector } from "@/data/sectors";

type SavedDoc = {
  id: string;
  user_id: string;
  title: string;
  kind: "contract" | "template";
  payload: GeneratedContract;
  source_id: string | null;
  contact_id: string | null;
  folder_id: string | null;
  created_at: string;
  updated_at: string;
};

const stubSector = {
  id: "saved",
  parties: { a: "Страна А", b: "Страна Б" },
} as unknown as Sector;

export default function DocumentPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [doc, setDoc] = useState<SavedDoc | null>(null);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState<"pdf" | "docx" | null>(null);
  const [saving, setSaving] = useState(false);

  const [contacts, setContacts] = useState<Array<{ id: string; name: string }>>([]);
  const [folders, setFolders] = useState<Array<{ id: string; name: string; is_favorites: boolean }>>([]);
  const [isPro, setIsPro] = useState(false);

  // Editable fields
  const [title, setTitle] = useState("");
  const [contactId, setContactId] = useState<string>("");
  const [folderId, setFolderId] = useState<string>("");
  const [contract, setContract] = useState<GeneratedContract | null>(null);
  const [dirty, setDirty] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(true);

  useEffect(() => {
    if (!id || !user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const [{ data: row, error }, { data: cs }, { data: fs }, { data: q }] = await Promise.all([
        supabase.from("saved_documents").select("*").eq("id", id).maybeSingle(),
        supabase.from("contacts").select("id, name").order("created_at", { ascending: false }),
        supabase.from("folders").select("id, name, is_favorites").order("is_favorites", { ascending: false }),
        supabase.from("download_quota").select("plan, pro_until").eq("user_id", user.id).maybeSingle(),
      ]);
      if (cancelled) return;
      if (error || !row) {
        toast.error("Документът не е намерен");
        navigate("/account?tab=documents");
        return;
      }
      const d = row as unknown as SavedDoc;
      setDoc(d);
      setTitle(d.title);
      setContactId(d.contact_id ?? "");
      setFolderId(d.folder_id ?? "");
      setContract(d.payload);
      setContacts((cs as any) ?? []);
      setFolders((fs as any) ?? []);
      setIsPro(!!q && (q.plan === "pro" || (!!q.pro_until && new Date(q.pro_until) > new Date())));
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [id, user, navigate]);

  const contactName = useMemo(
    () => contacts.find((c) => c.id === contactId)?.name,
    [contacts, contactId],
  );

  const handleExport = async (format: "pdf" | "docx") => {
    if (!doc || !contract) return;
    setExporting(format);
    try {
      const res = await downloadDocument({
        kind: "contract",
        format,
        title: title || contract.title,
        payload: { ...contract, title: title || contract.title },
        saved_document_id: doc.id,
      });
      if (!res.ok) {
        toast.error("Грешка при експорт", { description: res.error });
        return;
      }
      toast.success(format === "pdf" ? "PDF изтеглен" : "DOCX изтеглен", {
        description: "Повторно сваляне (безплатно)",
      });
    } finally {
      setExporting(null);
    }
  };

  const handleSave = async () => {
    if (!doc) return;
    setSaving(true);
    const { error } = await supabase
      .from("saved_documents")
      .update({
        title,
        contact_id: contactId || null,
        folder_id: folderId || null,
        payload: contract as any,
      })
      .eq("id", doc.id);
    setSaving(false);
    if (error) toast.error("Грешка", { description: error.message });
    else { toast.success("Промените са запазени"); setDirty(false); }
  };

  const handleDelete = async () => {
    if (!doc) return;
    if (!confirm("Изтриване на договора?")) return;
    const { error } = await supabase.from("saved_documents").delete().eq("id", doc.id);
    if (error) toast.error(error.message);
    else { toast.success("Изтрит"); navigate("/account?tab=documents"); }
  };

  if (loading || !doc || !contract) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="container flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-gold" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container py-6 md:py-8">
        <Link
          to="/account?tab=documents"
          className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gold"
        >
          <ArrowLeft className="h-3 w-3" /> Към Документи
        </Link>

        <div className="mt-3 mb-6">
          <div className="text-xs uppercase tracking-[0.2em] text-gold">Запазен договор</div>
          <h1 className="mt-1 font-serif text-2xl font-bold md:text-3xl">{title || doc.title}</h1>
          <p className="mt-1 text-xs text-muted-foreground">
            Създаден на {new Date(doc.created_at).toLocaleString("bg-BG")}
            {contactName && (
              <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-gold">
                <User className="h-3 w-3" /> {contactName}
              </span>
            )}
          </p>
        </div>

        <div className={`grid grid-cols-1 gap-6 ${detailsOpen ? "lg:grid-cols-[minmax(0,420px)_1fr]" : "lg:grid-cols-[40px_1fr]"} transition-all`}>
          {/* LEFT — meta + actions (collapsible) */}
          {detailsOpen ? (
            <section className="space-y-5 relative">
              <button
                onClick={() => setDetailsOpen(false)}
                className="absolute -right-3 top-2 z-10 hidden lg:flex h-7 w-7 items-center justify-center rounded-full border border-gold/40 bg-card text-gold hover:bg-gold/10"
                aria-label="Скрий детайлите"
                title="Скрий детайлите"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            <div className="rounded-xl border border-gold/30 bg-gradient-card p-6 shadow-soft">
              <h3 className="mb-4 font-serif text-lg font-bold">Детайли</h3>
              <div className="grid gap-3">
                <div className="space-y-1.5">
                  <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                    Име на договора
                  </Label>
                  <Input
                    value={title}
                    onChange={(e) => { setTitle(e.target.value); setDirty(true); }}
                    className="bg-card/60"
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">
                      <span className="inline-flex items-center gap-1"><User className="h-3 w-3" /> Контрагент</span>
                    </Label>
                    <Select
                      value={contactId || "none"}
                      onValueChange={(v) => { setContactId(v === "none" ? "" : v); setDirty(true); }}
                    >
                      <SelectTrigger className="bg-card/60"><SelectValue placeholder="— Без —" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Без контрагент —</SelectItem>
                        {contacts.map((c) => (
                          <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wider text-muted-foreground">Папка</Label>
                    <Select
                      value={folderId || "none"}
                      onValueChange={(v) => { setFolderId(v === "none" ? "" : v); setDirty(true); }}
                    >
                      <SelectTrigger className="bg-card/60"><SelectValue placeholder="Всички" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">Всички (без папка)</SelectItem>
                        {folders.map((f) => (
                          <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </div>

              <Button
                onClick={handleSave}
                disabled={!dirty || saving}
                className="mt-4 w-full bg-gradient-gold text-navy hover:shadow-gold"
              >
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Запази промените
              </Button>
            </div>

            <div className="rounded-xl border border-gold/30 bg-gradient-card p-6 shadow-soft">
              <h3 className="mb-1 font-serif text-lg font-bold">Експорт</h3>
              <p className="mb-4 text-xs text-muted-foreground">
                Повторното сваляне на запазен договор е безплатно.
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
              {!isPro && (
                <p className="mt-3 inline-flex items-center gap-1 text-[11px] text-muted-foreground">
                  <Pencil className="h-3 w-3" /> Директна редакция на текста — само Pro
                </p>
              )}
            </div>

            <Button
              variant="ghost"
              onClick={handleDelete}
              className="w-full text-xs text-destructive hover:bg-destructive/10"
            >
              <Trash2 className="mr-2 h-3.5 w-3.5" /> Изтрий договора
            </Button>
          </section>
          ) : (
            <div className="hidden lg:flex justify-center pt-4">
              <button
                onClick={() => setDetailsOpen(true)}
                className="flex h-10 w-10 items-center justify-center rounded-full border border-gold/40 bg-card text-gold hover:bg-gold/10"
                aria-label="Покажи детайлите"
                title="Покажи детайлите"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          )}

          {/* RIGHT — Live draft */}
          <section>
            <div className="mb-3 flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gold">
              <FileText className="h-3.5 w-3.5" />
              Договор
            </div>
            {doc.kind === "contract" && Array.isArray((contract as any)?.clauses) ? (
              <LiveDraft
                sector={stubSector}
                answers={{}}
                generated={contract}
                isPro={isPro}
                onContractChange={(next) => { setContract(next as GeneratedContract); setDirty(true); }}
              />
            ) : (
              <ProtectedContent>
                <article className="legal-paper rounded-md p-6 shadow-elegant md:p-8">
                  <h2 className="text-center font-serif text-lg font-bold uppercase tracking-wide md:text-xl">
                    {(contract as any)?.title}
                  </h2>
                  <div className="my-4 gold-divider" />
                  {(contract as any)?.intro && (
                    <p className="whitespace-pre-line text-sm leading-relaxed">{(contract as any).intro}</p>
                  )}
                  {((contract as any)?.sections ?? []).map((s: any, i: number) => (
                    <section key={i} className="mt-5">
                      {s.heading && <h2 className="font-serif text-base font-bold">{s.heading}</h2>}
                      <p className="mt-2 whitespace-pre-line text-sm leading-relaxed">{s.body}</p>
                    </section>
                  ))}
                  {(contract as any)?.closing && (
                    <p className="mt-6 whitespace-pre-line text-sm italic">{(contract as any).closing}</p>
                  )}
                </article>
              </ProtectedContent>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
