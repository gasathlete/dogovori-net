import { useEffect, useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Users, FolderOpen, FileText, CreditCard, Settings as SettingsIcon, LogOut, Crown, Sparkles, Loader2, Plus, Trash2, Star, Download, ArrowLeft,
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
type Quota = { contracts_used: number; templates_used: number; plan: "free" | "pro"; pro_until: string | null };

export default function AccountPage() {
  const { user, signOut } = useAuth();
  const [params] = useSearchParams();
  const initialTab = params.get("tab") ?? "dashboard";

  const [contacts, setContacts] = useState<Contact[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [docs, setDocs] = useState<SavedDoc[]>([]);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [profile, setProfile] = useState<{ display_name: string | null; company: string | null; vat_number: string | null }>({ display_name: "", company: "", vat_number: "" });
  const [activeFolder, setActiveFolder] = useState<string | "all">("all");

  const reload = async () => {
    if (!user) return;
    const [c, f, d, q, p] = await Promise.all([
      supabase.from("contacts").select("*").order("created_at", { ascending: false }),
      supabase.from("folders").select("*").order("is_favorites", { ascending: false }),
      supabase.from("saved_documents").select("*").order("created_at", { ascending: false }),
      supabase.from("download_quota").select("*").eq("user_id", user.id).maybeSingle(),
      supabase.from("profiles").select("display_name, company, vat_number").eq("id", user.id).maybeSingle(),
    ]);
    setContacts((c.data as any) ?? []);
    setFolders((f.data as any) ?? []);
    setDocs((d.data as any) ?? []);
    setQuota((q.data as any) ?? null);
    if (p.data) setProfile(p.data as any);
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, [user]);

  const filteredDocs = useMemo(
    () => activeFolder === "all" ? docs : docs.filter((d) => d.folder_id === activeFolder),
    [docs, activeFolder],
  );

  const isPro = quota?.plan === "pro" || (quota?.pro_until && new Date(quota.pro_until) > new Date());

  return (
    <div className="min-h-screen">
      <Header />
      <main className="container py-6 md:py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link to="/" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gold">
              <ArrowLeft className="h-3 w-3" /> Към началото
            </Link>
            <h1 className="mt-1 font-serif text-3xl font-bold">Моят профил</h1>
            <p className="text-sm text-muted-foreground">{user?.email}</p>
          </div>
          <Button variant="outline" onClick={signOut} className="border-border/60">
            <LogOut className="mr-2 h-4 w-4" /> Изход
          </Button>
        </div>

        <Tabs defaultValue={initialTab} className="space-y-6">
          <TabsList className="flex w-full flex-wrap justify-start gap-1 bg-card/40 p-1">
            <TabsTrigger value="dashboard"><Sparkles className="mr-1 h-3.5 w-3.5" />Табло</TabsTrigger>
            <TabsTrigger value="contacts"><Users className="mr-1 h-3.5 w-3.5" />Контрагенти</TabsTrigger>
            <TabsTrigger value="documents"><FileText className="mr-1 h-3.5 w-3.5" />Документи</TabsTrigger>
            <TabsTrigger value="folders"><FolderOpen className="mr-1 h-3.5 w-3.5" />Папки</TabsTrigger>
            <TabsTrigger value="subscription"><CreditCard className="mr-1 h-3.5 w-3.5" />Абонамент</TabsTrigger>
            <TabsTrigger value="settings"><SettingsIcon className="mr-1 h-3.5 w-3.5" />Настройки</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <Dashboard quota={quota} isPro={!!isPro} docs={docs} />
          </TabsContent>
          <TabsContent value="contacts">
            <ContactsTab contacts={contacts} reload={reload} />
          </TabsContent>
          <TabsContent value="documents">
            <DocumentsTab
              docs={filteredDocs}
              folders={folders}
              activeFolder={activeFolder}
              setActiveFolder={setActiveFolder}
              reload={reload}
            />
          </TabsContent>
          <TabsContent value="folders">
            <FoldersTab folders={folders} reload={reload} />
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

/* ============================ DASHBOARD ============================ */
function Dashboard({ quota, isPro, docs }: { quota: Quota | null; isPro: boolean; docs: SavedDoc[] }) {
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Card title="План" value={isPro ? "Pro" : "Free"} icon={<Crown className="h-5 w-5 text-gold" />}
        sub={isPro ? "Неограничено сваляне" : "1 договор + 1 бланка безплатно"} />
      <Card title="Свалени договори" value={`${quota?.contracts_used ?? 0}${isPro ? "" : " / 1"}`} icon={<FileText className="h-5 w-5 text-gold" />} />
      <Card title="Свалени бланки" value={`${quota?.templates_used ?? 0}${isPro ? "" : " / 1"}`} icon={<FileText className="h-5 w-5 text-gold" />} />

      <div className="md:col-span-3 rounded-xl border border-border/60 bg-gradient-card p-6">
        <h3 className="mb-3 font-serif text-lg font-bold">Последни документи</h3>
        {docs.length === 0 ? (
          <p className="text-sm text-muted-foreground">Все още нямате запазени документи.</p>
        ) : (
          <ul className="divide-y divide-border/40">
            {docs.slice(0, 5).map((d) => (
              <li key={d.id} className="flex items-center justify-between py-2 text-sm">
                <span>{d.title}</span>
                <span className="text-xs text-muted-foreground">{new Date(d.created_at).toLocaleDateString("bg-BG")}</span>
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
function ContactsTab({ contacts, reload }: { contacts: Contact[]; reload: () => void }) {
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Contact | null>(null);

  const remove = async (id: string) => {
    if (!confirm("Изтриване на контрагента?")) return;
    const { error } = await supabase.from("contacts").delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Изтрит"); reload(); }
  };

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
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody>
              {contacts.map((c) => (
                <tr key={c.id} className="border-b border-border/40 last:border-0 hover:bg-gold/[0.04]">
                  <td className="px-4 py-3 font-medium">{c.name}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{c.type === "individual" ? "Физ. лице" : "Юр. лице"}</td>
                  <td className="px-4 py-3 text-xs">{c.egn || c.eik || "—"}</td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">{c.email || c.phone || "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(c); setOpen(true); }}>Редактирай</Button>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(c.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </td>
                </tr>
              ))}
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
  docs, folders, activeFolder, setActiveFolder, reload,
}: {
  docs: SavedDoc[]; folders: Folder[];
  activeFolder: string | "all"; setActiveFolder: (v: string | "all") => void; reload: () => void;
}) {
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
      <div>
        {docs.length === 0 ? (
          <div className="rounded-xl border border-border/60 bg-gradient-card p-10 text-center text-sm text-muted-foreground">
            Тази папка е празна.
          </div>
        ) : (
          <div className="grid gap-3">
            {docs.map((d) => (
              <div key={d.id} className="rounded-xl border border-border/60 bg-gradient-card p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="font-serif text-base font-bold">{d.title}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      {d.kind === "contract" ? "Договор" : "Бланка"} · {new Date(d.created_at).toLocaleDateString("bg-BG")}
                    </div>
                  </div>
                  <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" variant="outline" disabled={busy === d.id + "pdf"} onClick={() => redownload(d, "pdf")}>
                      {busy === d.id + "pdf" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Download className="mr-1 h-3 w-3" />} PDF
                    </Button>
                    <Button size="sm" variant="outline" disabled={busy === d.id + "docx"} onClick={() => redownload(d, "docx")}>
                      {busy === d.id + "docx" ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Download className="mr-1 h-3 w-3" />} DOCX
                    </Button>
                    <Select value={d.folder_id ?? "none"} onValueChange={(v) => move(d.id, v === "none" ? null : v)}>
                      <SelectTrigger className="h-9 w-32 text-xs"><SelectValue placeholder="Папка" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="none">— Без папка —</SelectItem>
                        {folders.map((f) => <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(d.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/* ============================ FOLDERS ============================ */
function FoldersTab({ folders, reload }: { folders: Folder[]; reload: () => void }) {
  const [name, setName] = useState("");
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
  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <Input placeholder="Име на нова папка…" value={name} onChange={(e) => setName(e.target.value)} />
        <Button onClick={create} className="bg-gradient-gold text-navy"><Plus className="mr-1 h-4 w-4" />Създай</Button>
      </div>
      <div className="grid gap-2">
        {folders.map((f) => (
          <div key={f.id} className="flex items-center justify-between rounded-md border border-border/60 bg-gradient-card px-4 py-3">
            <div className="flex items-center gap-2 text-sm">
              {f.is_favorites ? <Star className="h-4 w-4 fill-gold text-gold" /> : <FolderOpen className="h-4 w-4 text-gold" />}
              <span>{f.name}</span>
              {f.is_favorites && <span className="text-xs text-muted-foreground">(защитена)</span>}
            </div>
            {!f.is_favorites && (
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(f)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/* ============================ SUBSCRIPTION ============================ */
function SubscriptionTab({ quota, isPro }: { quota: Quota | null; isPro: boolean }) {
  const { user } = useAuth();
  const [busy, setBusy] = useState(false);
  const [checkoutOpen, setCheckoutOpen] = useState(false);

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

  return (
    <div className="rounded-xl border border-gold/30 bg-gradient-card p-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-xs uppercase tracking-wider text-gold">Текущ план</div>
          <h3 className="mt-1 font-serif text-2xl font-bold">{isPro ? "Pro" : "Free"}</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            {isPro
              ? "Имате неограничен брой сваляния."
              : `Безплатно: 1 договор + 1 бланка. Използвани: ${quota?.contracts_used ?? 0} договор(а), ${quota?.templates_used ?? 0} бланка(и).`}
          </p>
          {!isPro && (
            <p className="mt-3 text-sm">
              <span className="font-bold text-gold">Pro план — 9.99 EUR / месец</span>
              <span className="block text-xs text-muted-foreground">Неограничено сваляне на договори и бланки.</span>
            </p>
          )}
        </div>
        <Crown className="h-8 w-8 text-gold" />
      </div>
      <div className="mt-6 flex flex-wrap gap-3">
        {!isPro ? (
          <Button onClick={() => setCheckoutOpen(true)} className="bg-gradient-gold text-navy hover:shadow-gold">
            Премини на Pro
          </Button>
        ) : (
          <Button onClick={portal} disabled={busy} variant="outline" className="border-gold/40">
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Управление на абонамент
          </Button>
        )}
      </div>

      <Dialog open={checkoutOpen} onOpenChange={setCheckoutOpen}>
        <DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto p-0">
          <div className="p-6">
            {checkoutOpen && user && (
              <StripeEmbeddedCheckout
                priceId="pro_monthly"
                customerEmail={user.email}
                userId={user.id}
                returnUrl={`${window.location.origin}/checkout/return?session_id={CHECKOUT_SESSION_ID}`}
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
