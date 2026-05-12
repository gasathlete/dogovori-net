import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Users, FolderOpen, FileText, CreditCard, Settings as SettingsIcon, LogOut, Crown, Bird, Loader2, Plus, Trash2, Star, Download, ArrowLeft, X,
} from "lucide-react";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { downloadDocument } from "@/lib/downloadDocument";
import { StripeEmbeddedCheckout } from "@/components/StripeEmbeddedCheckout";
import { ShareForSignDialog } from "@/components/ShareForSignDialog";
import { UploadContractDialog } from "@/components/UploadContractDialog";
import { SignedContractsTab } from "@/components/SignedContractsTab";
import { ShieldAlert, ShieldCheck, AlertTriangle, PenTool, ChevronRight, KeyRound, Mail, Trash } from "lucide-react";
import { isValidEGN, isValidEIK } from "@/lib/bgValidation";
import { translateAuthError } from "@/lib/authErrors";
import { useNavigate as _useNav } from "react-router-dom";

type Contact = {
  id: string; name: string; type: "individual" | "legal";
  egn?: string | null; eik?: string | null; vat_number?: string | null;
  address?: string | null; mol?: string | null; email?: string | null; phone?: string | null; notes?: string | null;
};
type Folder = { id: string; name: string; color: string | null; is_favorites: boolean };
type SavedDoc = {
  id: string; title: string; kind: "contract" | "template"; folder_id: string | null;
  contact_id: string | null; payload: any; created_at: string;
};
type Quota = { contracts_used: number; templates_used: number; plan: "free" | "pro"; pro_until: string | null; analyses_used?: number };
type UploadedContract = {
  id: string; title: string; source: "pdf" | "docx" | "paste";
  folder_id: string | null; contact_id: string | null;
  original_filename: string | null; storage_path: string | null;
  created_at: string;
};
type RiskAnalysisLite = { uploaded_contract_id: string; score: number; contract_type: string; created_at: string };

export default function AccountPage() {
  const { user, signOut } = useAuth();
  const [params, setParams] = useSearchParams();
  const initialTab = params.get("tab") ?? "dashboard";
  const activeContact = params.get("contact");

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [docs, setDocs] = useState<SavedDoc[]>([]);
  const [uploaded, setUploaded] = useState<UploadedContract[]>([]);
  const [analysesByContract, setAnalysesByContract] = useState<Record<string, RiskAnalysisLite>>({});
  const [quota, setQuota] = useState<Quota | null>(null);
  const [profile, setProfile] = useState<{ display_name: string | null; company: string | null; vat_number: string | null }>({ display_name: "", company: "", vat_number: "" });
  const [activeFolder, setActiveFolder] = useState<string | "all">("all");
  const [isStaff, setIsStaff] = useState(false);

  useEffect(() => {
    if (!user) { setIsStaff(false); return; }
    supabase.rpc("is_staff", { _user_id: user.id }).then(({ data }) => setIsStaff(Boolean(data)));
  }, [user]);

  const reload = async () => {
    if (!user) return;
    const [c, f, d, q, p, uc, ra] = await Promise.all([
      supabase.from("contacts").select("*").is("deleted_at", null).order("created_at", { ascending: false }),
      supabase.from("folders").select("*").order("is_favorites", { ascending: false }),
      supabase.from("saved_documents").select("*").order("created_at", { ascending: false }),
      supabase.from("download_quota").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("display_name, company, vat_number").eq("id", user.id).maybeSingle(),
      supabase.from("uploaded_contracts").select("id,title,source,folder_id,contact_id,original_filename,storage_path,created_at").order("created_at", { ascending: false }),
      supabase.from("risk_analyses").select("uploaded_contract_id,score,contract_type,created_at").order("created_at", { ascending: false }),
    ]);
    setContacts((c.data as any) ?? []);
    setFolders((f.data as any) ?? []);
    setDocs((d.data as any) ?? []);
    setQuota((q.data as any) ?? null);
    if (p.data) setProfile(p.data as any);
    setUploaded((uc.data as any) ?? []);
    const map: Record<string, RiskAnalysisLite> = {};
    for (const r of ((ra.data as any) ?? []) as RiskAnalysisLite[]) {
      if (!map[r.uploaded_contract_id]) map[r.uploaded_contract_id] = r;
    }
    setAnalysesByContract(map);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [user]);

  const filteredDocs = useMemo(() => {
    let out = docs;
    if (activeContact) out = out.filter((d) => d.contact_id === activeContact);
    if (activeFolder !== "all") out = out.filter((d) => d.folder_id === activeFolder);
    return out;
  }, [docs, activeFolder, activeContact]);

  const isPro = quota?.plan === "pro" || (quota?.pro_until && new Date(quota.pro_until) > new Date());

  const openContactDocs = (id: string) => {
    setParams({ tab: "documents", contact: id });
  };
  const clearContactFilter = () => {
    const next = new URLSearchParams(params);
    next.delete("contact");
    next.set("tab", "documents");
    setParams(next);
  };
  const onTabChange = (v: string) => {
    const next = new URLSearchParams(params);
    next.set("tab", v);
    if (v !== "documents") next.delete("contact");
    setParams(next);
  };

  const activeContactName = contacts.find((c) => c.id === activeContact)?.name;

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container py-6 md:py-10">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gold">
              <ArrowLeft className="h-3 w-3" /> Към началото
            </Link>
            <h1 className="mt-1 font-serif text-2xl font-bold sm:text-3xl">Моят профил</h1>
            <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {isStaff && (
              <Button asChild variant="outline" size="sm" className="border-gold/60 text-gold hover:bg-gold/10">
                <Link to="/admin"><ShieldCheck className="mr-2 h-4 w-4" /> Модераторски панел</Link>
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={signOut} className="border-border/60">
              <LogOut className="mr-2 h-4 w-4" /> Изход
            </Button>
          </div>
        </div>

        <Tabs value={initialTab} onValueChange={onTabChange} className="space-y-6">
          <ScrollableTabsList>
            <TabsTrigger value="dashboard" className="shrink-0 whitespace-nowrap"><Bird className="mr-1 h-3.5 w-3.5" />Табло</TabsTrigger>
            <TabsTrigger value="documents" className="shrink-0 whitespace-nowrap"><FileText className="mr-1 h-3.5 w-3.5" />Документи</TabsTrigger>
            <TabsTrigger value="folders" className="shrink-0 whitespace-nowrap"><FolderOpen className="mr-1 h-3.5 w-3.5" />Папки</TabsTrigger>
            <TabsTrigger value="contacts" className="shrink-0 whitespace-nowrap"><Users className="mr-1 h-3.5 w-3.5" />Контрагенти</TabsTrigger>
            <TabsTrigger value="signed" className="shrink-0 whitespace-nowrap"><PenTool className="mr-1 h-3.5 w-3.5" />Подписани</TabsTrigger>
            <TabsTrigger value="subscription" className="shrink-0 whitespace-nowrap"><CreditCard className="mr-1 h-3.5 w-3.5" />Абонамент</TabsTrigger>
            <TabsTrigger value="settings" className="shrink-0 whitespace-nowrap"><SettingsIcon className="mr-1 h-3.5 w-3.5" />Настройки</TabsTrigger>
          </ScrollableTabsList>

          <TabsContent value="dashboard">
            <Dashboard quota={quota} isPro={!!isPro} docs={docs} />
          </TabsContent>
          <TabsContent value="contacts">
            <ContactsTab contacts={contacts} docs={docs} reload={reload} onOpenDocs={openContactDocs} />
          </TabsContent>
          <TabsContent value="documents">
            <DocumentsTab
              docs={filteredDocs}
              folders={folders}
              contacts={contacts}
              activeFolder={activeFolder}
              setActiveFolder={setActiveFolder}
              activeContactName={activeContactName}
              clearContactFilter={clearContactFilter}
              reload={reload}
              uploaded={uploaded}
              analysesByContract={analysesByContract}
            />
          </TabsContent>
          <TabsContent value="folders">
            <FoldersTab folders={folders} docs={docs} uploaded={uploaded} reload={reload} onOpenTab={(t) => onTabChange(t)} setActiveFolder={setActiveFolder} />
          </TabsContent>
          <TabsContent value="signed">
            <SignedContractsTab userId={user?.id ?? ""} />
          </TabsContent>
          <TabsContent value="subscription">
            <SubscriptionTab quota={quota} isPro={!!isPro} />
          </TabsContent>
          <TabsContent value="settings">
            <SettingsTab profile={profile} setProfile={setProfile} userId={user?.id ?? ""} />
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
}

/* ====================== SCROLLABLE TABS LIST ====================== */
function ScrollableTabsList({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [showHint, setShowHint] = useState(false);
  const update = () => {
    const el = ref.current;
    if (!el) return;
    setShowHint(el.scrollWidth - el.clientWidth - el.scrollLeft > 8);
  };
  useEffect(() => {
    update();
    const el = ref.current;
    if (!el) return;
    el.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    return () => {
      el.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, []);
  return (
    <div className="relative md:static">
      <TabsList
        ref={ref as any}
        onScroll={update}
        className="-mx-4 flex w-auto justify-start gap-1 overflow-x-auto bg-card/40 p-1 px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden md:mx-0 md:w-full md:flex-wrap md:overflow-visible md:px-1"
      >
        {children}
      </TabsList>
      {showHint && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 flex items-center pr-1 md:hidden"
        >
          <div className="h-full w-10 bg-gradient-to-l from-background via-background/80 to-transparent" />
          <div className="-ml-7 flex h-7 w-7 items-center justify-center rounded-full border border-gold/40 bg-card/90 text-gold shadow-md animate-pulse">
            <ChevronRight className="h-4 w-4" />
          </div>
        </div>
      )}
    </div>
  );
}

/* ============================ DASHBOARD ============================ */
function Dashboard({ quota, isPro, docs }: { quota: Quota | null; isPro: boolean; docs: SavedDoc[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card title="План" value={isPro ? "Pro" : "Free"} icon={<Crown className="h-5 w-5 text-gold" />}
        sub={isPro ? `${(quota as any)?.pro_monthly_used ?? 0}/100 операции/мес` : "3+3 безплатни, после 1+1/мес"} />
      <Card title="Свалени договори" value={`${quota?.contracts_used ?? 0}${isPro ? "" : " / 3"}`} icon={<FileText className="h-5 w-5 text-gold" />} />
      <Card title="Свалени бланки" value={`${quota?.templates_used ?? 0}${isPro ? "" : " / 3"}`} icon={<FileText className="h-5 w-5 text-gold" />} />

      <div className="md:col-span-3 rounded-xl border border-border/60 bg-gradient-card p-6">
        <h3 className="mb-3 font-serif text-lg font-bold">Последни документи</h3>
        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Все още нямате запазени документи.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {docs.slice(0, 5).map((d) => (
              <li key={d.id}>
                <Link
                  to={`/document/${d.id}`}
                  className="flex items-center justify-between gap-3 py-2 text-sm transition-colors hover:text-gold"
                >
                  <span className="min-w-0 break-words">{d.title}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString("bg-BG")}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
function Card({ title, value, sub, icon }: { title: string; value: string; sub?: string; icon: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-border/60 bg-gradient-card p-5">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{title}</span>
        {icon}
      </div>
      <div className="mt-2 font-serif text-2xl font-bold">{value}</div>
      {sub && <div className="mt-1 text-xs text-muted-foreground">{sub}</div>}
    </div>
  );
}

/* ============================ CONTACTS ============================ */
function ContactsTab({ contacts, docs, reload, onOpenDocs }: {
  contacts: Contact[]; docs: SavedDoc[]; reload: () => void; onOpenDocs: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);
  const navigate = useNavigate();

  const remove = async (id: string) => {
    if (!confirm("Изтриване на контрагента?")) return;
    const { error } = await supabase.from("contacts").update({ deleted_at: new Date().toISOString() }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Изтрит"); reload(); }
  };

  const docsCount = (id: string) => docs.filter((d) => d.contact_id === id).length;

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}>
          <DialogTrigger asChild>
            <Button className="bg-gradient-gold text-navy hover:shadow-gold"><Plus className="mr-1 h-4 w-4" />Нов контрагент</Button>
          </DialogTrigger>
          <ContactDialog editing={editing} onClose={() => { setOpen(false); setEditing(null); reload(); }} />
        </Dialog>
      </div>
      {contacts.length === 0 ? (
        <div className="rounded-xl border border-border/60 bg-gradient-card p-10 text-center text-sm text-muted-foreground">
          Нямате добавени контрагенти.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border/60 bg-gradient-card">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border/60 text-left text-xs uppercase tracking-wider text-muted-foreground">
                <th className="px-4 py-3">Име</th>
                <th className="px-4 py-3">Тип</th>
                <th className="px-4 py-3">ЕГН/ЕИК</th>
                <th className="px-4 py-3">Контакт</th>
                <th className="px-4 py-3">Договори</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => {
                const n = docsCount(c.id);
                return (
                  <tr
                    key={c.id}
                    onClick={() => navigate(`/contact/${c.id}`)}
                    className="cursor-pointer border-b border-border/40 last:border-0 transition-colors hover:bg-gold/[0.06]"
                  >
                    <td className="px-4 py-3 font-medium text-gold/90 hover:text-gold">{c.name}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.type === "individual" ? "Физ. лице" : "Юр. лице"}</td>
                    <td className="px-4 py-3 text-xs">{c.egn || c.eik || "—"}</td>
                    <td className="px-4 py-3 text-xs text-muted-foreground">{c.email || c.phone || "—"}</td>
                    <td className="px-4 py-3 text-xs">
                      <span className="inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-gold">
                        <FileText className="h-3 w-3" /> {n}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                      <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}>Редактирай</Button>
                      <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(c.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function ContactDialog({ editing, onClose }: { editing: Contact | null; onClose: () => void }) {
  const [form, setForm] = useState<Partial<Contact>>(editing ?? { type: "individual" });
  const [busy, setBusy] = useState(false);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    // Валидация на ЕГН/ЕИК преди запис
    if (form.type === "individual" && form.egn) {
      if (!isValidEGN(String(form.egn).trim())) {
        toast.error("Невалидно ЕГН", { description: "Моля, проверете 10-те цифри и контролната сума." });
        return;
      }
    }
    if (form.type === "legal" && form.eik) {
      if (!isValidEIK(String(form.eik).trim())) {
        toast.error("Невалиден ЕИК", { description: "ЕИК трябва да е 9 или 13 цифри с валидна контролна сума." });
        return;
      }
    }
    setBusy(true);
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setBusy(false); return; }
    const payload = { ...form, user_id: user.id } as any;
    const { error } = editing
      ? await supabase.from("contacts").update(payload).eq("id", editing.id)
      : await supabase.from("contacts").insert(payload);
    setBusy(false);
    if (error) toast.error(error.message);
    else { toast.success(editing ? "Запазен" : "Добавен"); onClose(); }
  };

  const upd = (k: keyof Contact, v: any) => setForm((s) => ({ ...s, [k]: v }));

  return (
    <DialogContent className="max-w-lg">
      <DialogHeader>
        <DialogTitle>{editing ? "Редактиране" : "Нов контрагент"}</DialogTitle>
      </DialogHeader>
      <form onSubmit={save} className="space-y-3">
        <div>
          <Label>Тип</Label>
          <Select value={form.type ?? "individual"} onValueChange={(v) => upd("type", v)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="individual">Физическо лице</SelectItem>
              <SelectItem value="legal">Юридическо лице</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Име {form.type === "legal" ? "/ Фирма" : ""}</Label>
          <Input required value={form.name ?? ""} onChange={(e) => upd("name", e.target.value)} />
        </div>
        {form.type === "individual" ? (
          <div>
            <Label>ЕГН</Label>
            <Input maxLength={10} value={form.egn ?? ""} onChange={(e) => upd("egn", e.target.value)} />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>ЕИК</Label><Input value={form.eik ?? ""} onChange={(e) => upd("eik", e.target.value)} /></div>
              <div><Label>ДДС №</Label><Input value={form.vat_number ?? ""} onChange={(e) => upd("vat_number", e.target.value)} /></div>
            </div>
            <div><Label>МОЛ</Label><Input value={form.mol ?? ""} onChange={(e) => upd("mol", e.target.value)} /></div>
          </>
        )}
        <div><Label>Адрес</Label><Input value={form.address ?? ""} onChange={(e) => upd("address", e.target.value)} /></div>
        <div className="grid grid-cols-2 gap-3">
          <div><Label>Email</Label><Input type="email" value={form.email ?? ""} onChange={(e) => upd("email", e.target.value)} /></div>
          <div><Label>Телефон</Label><Input value={form.phone ?? ""} onChange={(e) => upd("phone", e.target.value)} /></div>
        </div>
        <div><Label>Бележки</Label><Textarea rows={2} value={form.notes ?? ""} onChange={(e) => upd("notes", e.target.value)} /></div>
        <DialogFooter>
          <Button type="submit" disabled={busy} className="bg-gradient-gold text-navy">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Запази
          </Button>
        </DialogFooter>
      </form>
    </DialogContent>
  );
}

/* ============================ DOCUMENTS ============================ */
function DocumentsTab({
  docs, folders, contacts, activeFolder, setActiveFolder, activeContactName, clearContactFilter, reload,
  uploaded, analysesByContract,
}: {
  docs: SavedDoc[]; folders: Folder[]; contacts: Contact[];
  activeFolder: string | "all"; setActiveFolder: (v: string | "all") => void;
  activeContactName?: string; clearContactFilter: () => void;
  reload: () => void;
  uploaded: UploadedContract[];
  analysesByContract: Record<string, RiskAnalysisLite>;
}) {
  const contactName = (id: string | null) => contacts.find((c) => c.id === id)?.name;
  const [busy, setBusy] = useState<string | null>(null);

  const redownload = async (d: SavedDoc, format: "pdf" | "docx") => {
    setBusy(d.id + format);
    const res = await downloadDocument({
      kind: d.kind, format, title: d.title, payload: d.payload, saved_document_id: d.id,
    });
    setBusy(null);
    if (!res.ok) toast.error("Грешка", { description: res.error });
    else toast.success("Изтеглен (безплатно)");
  };

  const remove = async (id: string) => {
    if (!confirm("Изтриване?")) return;
    const { error } = await supabase.from("saved_documents").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Изтрит"); reload(); }
  };

  const move = async (id: string, folder_id: string | null) => {
    const { error } = await supabase.from("saved_documents").update({ folder_id }).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Преместен"); reload(); }
  };

  return (
    <div className="grid gap-6 md:grid-cols-[220px_1fr]">
      <aside className="space-y-1 rounded-xl border border-border/60 bg-gradient-card p-3">
        <button onClick={() => setActiveFolder("all")}
          className={`w-full rounded-md px-3 py-2 text-left text-sm ${activeFolder === "all" ? "bg-gold/10 text-gold" : "hover:bg-card/60"}`}>
          Всички ({docs.length})
        </button>
        {folders.map((f) => (
          <button key={f.id} onClick={() => setActiveFolder(f.id)}
            className={`flex w-full items-center gap-2 rounded-md px-3 py-2 text-left text-sm ${activeFolder === f.id ? "bg-gold/10 text-gold" : "hover:bg-card/60"}`}>
            {f.is_favorites ? <Star className="h-3.5 w-3.5 fill-gold text-gold" /> : <FolderOpen className="h-3.5 w-3.5" />}
            {f.name}
          </button>
        ))}
      </aside>
      <div className="space-y-8">
        {/* ===== Uploaded contracts (own files with AI risk analysis) ===== */}
        <section>
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-serif text-lg font-bold">Качени договори</h3>
              <p className="mt-1 text-xs text-muted-foreground">Качете свой договор (PDF, DOCX или текст) — Системата ще извърши пълен правен риск-анализ.</p>
            </div>
            <div className="shrink-0">
              <UploadContractDialog
                folders={folders}
                contacts={contacts}
                onUploaded={reload}
              />
            </div>
          </div>

          {uploaded.length === 0 ? (
            <div className="rounded-xl border border-dashed border-gold/30 bg-gradient-card p-8 text-center">
              <ShieldCheck className="mx-auto h-7 w-7 text-gold" />
              <p className="mt-2 text-sm text-muted-foreground">
                Все още нямате качени договори. Натиснете <strong className="text-gold">„Добави договор"</strong> за безплатен AI анализ.
              </p>
            </div>
          ) : (
            <div className="grid gap-3">
              {uploaded.map((u) => {
                const a = analysesByContract[u.id];
                const score = a?.score;
                const sevCls = score == null ? "border-border/40 text-muted-foreground"
                  : score >= 8 ? "border-emerald-400/40 text-emerald-300 bg-emerald-400/10"
                  : score >= 5 ? "border-amber-300/40 text-amber-200 bg-amber-300/10"
                  : "border-red-400/40 text-red-300 bg-red-400/10";
                const Icon = score == null ? AlertTriangle : score >= 8 ? ShieldCheck : score >= 5 ? AlertTriangle : ShieldAlert;
                return (
                  <div
                    key={u.id}
                    className="rounded-xl border border-border/60 bg-gradient-card p-4 transition-all hover:border-gold/50 hover:shadow-soft"
                  >
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <Link to={`/uploaded/${u.id}`} className="min-w-0 flex-1">
                        <div className="break-words font-serif text-base font-bold">{u.title}</div>
                        <div className="mt-1 text-xs text-muted-foreground">
                          {u.source.toUpperCase()} · качен {new Date(u.created_at).toLocaleDateString("bg-BG")}
                          {a?.contract_type && <> · {a.contract_type}</>}
                          {contactName(u.contact_id) && (
                            <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-gold">
                              <Users className="h-3 w-3" /> {contactName(u.contact_id)}
                            </span>
                          )}
                        </div>
                      </Link>
                      <div className={`flex shrink-0 items-center gap-2 rounded-full border px-3 py-1 text-xs ${sevCls}`}>
                        <Icon className="h-3.5 w-3.5" />
                        {score != null ? <><strong>{score}</strong>/10</> : "Без анализ"}
                      </div>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-1.5">
                      <ShareForSignDialog uploadedContractId={u.id} documentTitle={u.title} />
                      <Select
                        value={u.folder_id ?? "none"}
                        onValueChange={async (v) => {
                          const { error } = await supabase
                            .from("uploaded_contracts")
                            .update({ folder_id: v === "none" ? null : v })
                            .eq("id", u.id);
                          if (error) toast.error(error.message);
                          else { toast.success("Преместен"); reload(); }
                        }}
                      >
                        <SelectTrigger className="h-9 w-32 text-xs"><SelectValue placeholder="Папка" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Без папка —</SelectItem>
                          {folders.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        {/* ===== Generated documents (existing) ===== */}
        <section>
          <h3 className="mb-3 font-serif text-lg font-bold">Създадени документи</h3>
          {activeContactName && (
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-gold/40 bg-gold/10 px-3 py-1 text-xs text-gold">
              <Users className="h-3.5 w-3.5" />
              Договори с: <strong>{activeContactName}</strong>
              <button
                onClick={clearContactFilter}
                className="ml-1 rounded-full p-0.5 hover:bg-gold/20"
                aria-label="Изчисти филтъра"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          )}
          {docs.length === 0 ? (
            <div className="rounded-xl border border-border/60 bg-gradient-card p-10 text-center text-sm text-muted-foreground">
              {activeContactName ? "Няма договори за този контрагент." : "Тази папка е празна."}
            </div>
          ) : (
            <div className="grid gap-3">
              {docs.map((d) => (
                <Link
                  key={d.id}
                  to={`/document/${d.id}`}
                  className="block rounded-xl border border-border/60 bg-gradient-card p-4 transition-all hover:border-gold/50 hover:shadow-soft"
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="break-words font-serif text-base font-bold transition-colors group-hover:text-gold">{d.title}</div>
                      <div className="mt-1 text-xs text-muted-foreground">
                        {d.kind === "contract" ? "Договор" : "Бланка"} · {new Date(d.created_at).toLocaleDateString("bg-BG")}
                        {contactName(d.contact_id) && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full border border-gold/30 bg-gold/5 px-2 py-0.5 text-[10px] uppercase tracking-wider text-gold">
                            <Users className="h-3 w-3" /> {contactName(d.contact_id)}
                          </span>
                        )}
                      </div>
                    </div>
                    <div
                      className="flex flex-wrap items-center gap-1.5"
                      onClick={(e) => e.preventDefault()}
                    >
                      <Button size="sm" variant="outline" className="h-9" disabled={busy === d.id + "pdf"} onClick={() => redownload(d, "pdf")}>
                        {busy === d.id + "pdf" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Download className="mr-1 h-3 w-3" />} PDF
                      </Button>
                      <Button size="sm" variant="outline" className="h-9" disabled={busy === d.id + "docx"} onClick={() => redownload(d, "docx")}>
                        {busy === d.id + "docx" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Download className="mr-1 h-3 w-3" />} DOCX
                      </Button>
                      {d.kind === "contract" && <ShareForSignDialog documentId={d.id} documentTitle={d.title} />}
                      <Select value={d.folder_id ?? "none"} onValueChange={(v) => move(d.id, v === "none" ? null : v)}>
                        <SelectTrigger className="h-9 w-32 text-xs"><SelectValue placeholder="Папка" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">— Без папка —</SelectItem>
                          {folders.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      <Button size="sm" variant="ghost" className="h-9 w-9 p-0 text-destructive" onClick={() => remove(d.id)}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

/* ============================ FOLDERS ============================ */
function FoldersTab({
  folders, docs, uploaded, reload, onOpenTab, setActiveFolder,
}: {
  folders: Folder[]; docs: SavedDoc[]; uploaded: UploadedContract[];
  reload: () => void; onOpenTab: (tab: string) => void; setActiveFolder: (id: string | "all") => void;
}) {
  const [name, setName] = useState("");
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const create = async () => {
    if (!name.trim()) return;
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    const { error } = await supabase.from("folders").insert({ name: name.trim(), user_id: user.id });
    if (error) toast.error(error.message); else { toast.success("Създадена"); setName(""); reload(); }
  };
  const remove = async (f: Folder) => {
    if (f.is_favorites) return;
    if (!confirm(`Изтриване на „${f.name}"? Документите ще останат без папка.`)) return;
    const { error } = await supabase.from("folders").delete().eq("id", f.id);
    if (error) toast.error(error.message); else { toast.success("Изтрита"); reload(); }
  };
  const openInDocs = (folderId: string) => {
    setActiveFolder(folderId);
    onOpenTab("documents");
  };
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="Име на нова папка…" value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={create} className="bg-gradient-gold text-navy"><Plus className="mr-1 h-4 w-4" />Създай</Button>
      </div>
      <div className="grid gap-2">
        {folders.map((f) => {
          const folderDocs = docs.filter((d) => d.folder_id === f.id);
          const folderUploaded = uploaded.filter((u) => u.folder_id === f.id);
          const total = folderDocs.length + folderUploaded.length;
          const isOpen = !!expanded[f.id];
          return (
            <div key={f.id} className="rounded-md border border-border/60 bg-gradient-card">
              <div className="flex items-center justify-between px-4 py-3">
                <button
                  type="button"
                  onClick={() => setExpanded((p) => ({ ...p, [f.id]: !p[f.id] }))}
                  className="flex flex-1 items-center gap-2 text-left text-sm hover:text-gold"
                >
                  <span className={`inline-block transition-transform ${isOpen ? "rotate-90" : ""}`}>›</span>
                  {f.is_favorites ? <Star className="h-4 w-4 fill-gold text-gold" /> : <FolderOpen className="h-4 w-4 text-gold" />}
                  <span>{f.name}</span>
                  <span className="text-xs text-muted-foreground">({total})</span>
                  {f.is_favorites && <span className="text-xs text-muted-foreground">(защитена)</span>}
                </button>
                {!f.is_favorites && (
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(f)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              {isOpen && (
                <div className="border-t border-border/60 px-4 py-3">
                  {total === 0 ? (
                    <p className="text-xs text-muted-foreground">Няма документи в тази папка.</p>
                  ) : (
                    <ul className="space-y-1.5 text-sm">
                      {folderDocs.map((d) => (
                        <li key={`d-${d.id}`} className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-gold/70" />
                          <Link to={`/document/${d.id}`} className="truncate hover:text-gold">{d.title}</Link>
                          <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">
                            {d.kind === "contract" ? "договор" : "бланка"}
                          </span>
                        </li>
                      ))}
                      {folderUploaded.map((u) => (
                        <li key={`u-${u.id}`} className="flex items-center gap-2">
                          <FileText className="h-3.5 w-3.5 text-gold/70" />
                          <Link to={`/uploaded/${u.id}`} className="truncate hover:text-gold">{u.title}</Link>
                          <span className="ml-auto text-[10px] uppercase tracking-wider text-muted-foreground">качен</span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-3">
                    <Button size="sm" variant="outline" className="border-gold/40 text-gold" onClick={() => openInDocs(f.id)}>
                      Отвори в Документи
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ============================ SUBSCRIPTION ============================ */
function SubscriptionTab({ quota, isPro }: { quota: Quota | null; isPro: boolean }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [checkoutPrice, setCheckoutPrice] = useState<string | null>(null);
  const [searchParams] = useSearchParams();
  const redirectAfter = searchParams.get("redirect") || "";
  const returnUrl = `${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}${
    redirectAfter ? `&redirect=${encodeURIComponent(redirectAfter)}` : ""
  }`;

  const portal = async () => {
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("customer-portal", {
      body: {
        environment: (import.meta.env.VITE_PAYMENTS_CLIENT_TOKEN as string)?.startsWith("pk_test_") ? "sandbox" : "live",
        returnUrl: window.location.origin + "/account?tab=subscription",
      },
    });
    setBusy(false);
    if (error || !data?.url) return toast.error("Грешка", { description: error?.message });
    window.open(data.url, "_blank");
  };

  const features = [
    "До 100 операции на месец (договори + бланки + анализи)",
    "Сваляне на договори в PDF и DOCX",
    "Сваляне на бланки и приложения",
    "Дигитален подпис с изображение",
    "Без воден знак върху документите",
    "Достъп до всички бъдещи нови договори",
  ];

  const proMonthlyUsed = (quota as any)?.pro_monthly_used ?? 0;
  const proMonthlyCap = 100;
  const proPct = Math.min(100, Math.round((proMonthlyUsed / proMonthlyCap) * 100));

  return (
    <div className="space-y-6">
      <div className="rounded-xl border border-gold/30 bg-gradient-card p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <div className="text-xs uppercase tracking-wider text-gold">Текущ план</div>
            <h3 className="mt-1 font-serif text-2xl font-bold">{isPro ? "Pro" : "Free"}</h3>
            <p className="mt-2 text-sm text-muted-foreground">
              {isPro
                ? `${proMonthlyUsed} / ${proMonthlyCap} операции този период.`
                : `Безплатно: 3 договора + 3 бланки общо, след това 1+1 на месец. Използвани: ${quota?.contracts_used ?? 0} договор(а), ${quota?.templates_used ?? 0} бланка(и).`}
            </p>
            {isPro && (
              <div className="mt-3">
                <div className="h-2 overflow-hidden rounded-full bg-muted">
                  <div className="h-full bg-gradient-gold transition-all" style={{ width: `${proPct}%` }} />
                </div>
                {proPct >= 90 && (
                  <p className="mt-2 text-xs text-gold">Наближавате месечния лимит. Помислете за Team план за повече капацитет.</p>
                )}
              </div>
            )}
            {!isPro && ((quota as any)?.bonus_contracts ?? 0) > 0 && (
              <p className="mt-2 text-sm text-gold">
                Налични единични тегления: {(quota as any)?.bonus_contracts}
              </p>
            )}
          </div>
          <Crown className="h-8 w-8 text-gold" />
        </div>
        {isPro && (
          <div className="mt-6 flex flex-wrap gap-2">
            <Button onClick={portal} disabled={busy} variant="outline" className="border-gold/40">
              {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Управление на абонамент
            </Button>
            <Button asChild variant="outline" className="border-gold/40">
              <a href="/team">Team план за фирми →</a>
            </Button>
          </div>
        )}
      </div>

      {!isPro && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {/* Monthly — first on mobile */}
          <div className="relative order-1 flex flex-col rounded-xl border-2 border-gold bg-gradient-card p-5 shadow-gold sm:p-6 lg:order-2">
            <div className="absolute -top-3 left-4 rounded-full bg-gradient-gold px-3 py-0.5 text-xs font-bold text-navy">
              Най-популярен
            </div>
            <div className="text-xs uppercase tracking-wider text-gold">Pro месечно</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-serif text-2xl font-bold sm:text-3xl">9.90 €</span>
              <span className="text-sm text-muted-foreground line-through">29.90 €</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">на месец · отказ по всяко време</p>
            <ul className="mt-4 space-y-1.5 text-sm text-foreground/80">
              {features.map((f) => (<li key={f}>• {f}</li>))}
            </ul>
            <Button
              onClick={() => setCheckoutPrice("pro_monthly")}
              className="mt-6 bg-gradient-gold text-navy hover:shadow-gold"
            >
              Премини на Pro
            </Button>
          </div>

          {/* Single contract */}
          <div className="order-2 flex flex-col rounded-xl border border-border/60 bg-gradient-card p-5 sm:p-6 lg:order-1">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Единичен договор</div>
            <div className="mt-2 font-serif text-2xl font-bold sm:text-3xl">1.90 €</div>
            <p className="mt-1 text-xs text-muted-foreground">Еднократно — един Pro договор</p>
            <ul className="mt-4 space-y-1.5 text-sm text-foreground/80">
              <li>• Сваляне на 1 договор (PDF + DOCX)</li>
              <li>• Без воден знак</li>
              <li>• Без абонамент</li>
            </ul>
            <Button
              onClick={() => setCheckoutPrice("single_contract")}
              variant="outline"
              className="mt-6 border-gold/40"
            >
              Купи за 1.90 €
            </Button>
          </div>

          {/* Yearly */}
          <div className="order-3 flex flex-col rounded-xl border border-border/60 bg-gradient-card p-5 sm:p-6">
            <div className="text-xs uppercase tracking-wider text-muted-foreground">Pro годишно</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-serif text-2xl font-bold sm:text-3xl">99 €</span>
              <span className="text-sm text-muted-foreground line-through">118.80 €</span>
            </div>
            <p className="mt-1 text-xs text-gold">Спестявате ~17% (≈ 8.25 €/месец)</p>
            <ul className="mt-4 space-y-1.5 text-sm text-foreground/80">
              {features.map((f) => (<li key={f}>• {f}</li>))}
              <li>• 2 безплатни месеца спрямо месечния</li>
            </ul>
            <Button
              onClick={() => setCheckoutPrice("pro_yearly")}
              variant="outline"
              className="mt-6 border-gold/40"
            >
              Купи годишен план
            </Button>
          </div>

          {/* Team */}
          <div className="order-4 flex flex-col rounded-xl border border-gold/40 bg-gradient-card p-5 sm:p-6">
            <div className="text-xs uppercase tracking-wider text-gold">Team — за фирми</div>
            <div className="mt-2 flex items-baseline gap-2">
              <span className="font-serif text-2xl font-bold sm:text-3xl">7.90 €</span>
              <span className="text-sm text-muted-foreground">/място/мес</span>
            </div>
            <p className="mt-1 text-xs text-muted-foreground">мин. 3 места · 100 ops/място/мес</p>
            <ul className="mt-4 space-y-1.5 text-sm text-foreground/80">
              <li>• Споделени шаблони и документи</li>
              <li>• Audit log за администратори</li>
              <li>• SSO + central billing</li>
              <li>• Branded PDF/DOCX с лого</li>
            </ul>
            <Button asChild variant="outline" className="mt-6 border-gold/40">
              <a href="/team">Създай екип</a>
            </Button>
          </div>
        </div>
      )}

      <Dialog open={!!checkoutPrice} onOpenChange={(o) => !o && setCheckoutPrice(null)}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-0">
          <div className="p-6">
            {checkoutPrice && user && (
              <StripeEmbeddedCheckout
                priceId={checkoutPrice}
                customerEmail={user.email}
                userId={user.id}
                returnUrl={returnUrl}
              />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ============================ SETTINGS ============================ */
function SettingsTab({ profile, setProfile, userId }: {
  profile: { display_name: string | null; company: string | null; vat_number: string | null };
  setProfile: (p: any) => void; userId: string;
}) {
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const { error } = await supabase.from("profiles").update(profile).eq("id", userId);
    setBusy(false);
    if (error) toast.error(error.message); else toast.success("Запазено");
  };
  return (
    <div className="max-w-lg space-y-3 rounded-xl border border-border/60 bg-gradient-card p-6">
      <div><Label>Име</Label><Input value={profile.display_name ?? ""} onChange={(e) => setProfile({ ...profile, display_name: e.target.value })} /></div>
      <div><Label>Фирма</Label><Input value={profile.company ?? ""} onChange={(e) => setProfile({ ...profile, company: e.target.value })} /></div>
      <div><Label>ДДС №</Label><Input value={profile.vat_number ?? ""} onChange={(e) => setProfile({ ...profile, vat_number: e.target.value })} /></div>
      <Button onClick={save} disabled={busy} className="bg-gradient-gold text-navy">
        {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Запази
      </Button>
    </div>
  );
}
