import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AdminMFAGuard } from "@/components/admin/AdminMFAGuard";
import { ArrowLeft, Loader2, ClipboardCheck, ExternalLink, Save, Plus } from "lucide-react";
import { toast } from "sonner";

type Framework = "GDPR" | "AI_ACT" | "SOC2" | "ISO27001";
type Status = "done" | "in_progress" | "todo" | "not_applicable";
type Priority = "low" | "medium" | "high" | "critical";

interface Item {
  id: string; framework: Framework; control_ref: string; title: string;
  description: string | null; status: Status; owner_role: string | null;
  owner_user: string | null; evidence_url: string | null; evidence_notes: string | null;
  due_date: string | null; last_reviewed_at: string | null; priority: Priority;
}

const FW_LABEL: Record<Framework, string> = { GDPR: "GDPR", AI_ACT: "AI Act", SOC2: "SOC 2", ISO27001: "ISO 27001" };
const STATUS_LABEL: Record<Status, string> = { done: "Готово", in_progress: "В ход", todo: "Оставащо", not_applicable: "N/A" };
const STATUS_TONE: Record<Status, string> = {
  done: "bg-emerald-500/15 text-emerald-600",
  in_progress: "bg-amber-500/15 text-amber-600",
  todo: "bg-muted text-muted-foreground",
  not_applicable: "bg-blue-500/10 text-blue-600",
};
const PR_TONE: Record<Priority, string> = {
  critical: "bg-destructive/15 text-destructive",
  high: "bg-orange-500/15 text-orange-600",
  medium: "bg-amber-500/10 text-amber-600",
  low: "bg-muted text-muted-foreground",
};

export default function AdminCompliancePage() {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Item[]>([]);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<"ALL" | Framework>("ALL");
  const [editing, setEditing] = useState<Item | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    if (loading || !user) { setAllowed(false); return; }
    supabase.rpc("is_staff", { _user_id: user.id }).then(({ data }) => setAllowed(Boolean(data)));
  }, [user, loading]);

  const load = async () => {
    setBusy(true);
    const { data, error } = await supabase.from("compliance_items").select("*").order("framework").order("control_ref");
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as Item[]);
  };
  useEffect(() => { if (allowed) load(); }, [allowed]);

  const filtered = useMemo(() => tab === "ALL" ? rows : rows.filter((r) => r.framework === tab), [rows, tab]);
  const stats = useMemo(() => {
    const s = { done: 0, in_progress: 0, todo: 0, total: rows.length };
    rows.forEach((r) => { if (r.status !== "not_applicable") s[r.status]++; });
    return s;
  }, [rows]);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    const { error } = await supabase.from("compliance_items").update({
      title: editing.title, description: editing.description, status: editing.status,
      owner_role: editing.owner_role, evidence_url: editing.evidence_url,
      evidence_notes: editing.evidence_notes, due_date: editing.due_date,
      priority: editing.priority,
      last_reviewed_at: editing.status === "done" ? new Date().toISOString() : editing.last_reviewed_at,
    }).eq("id", editing.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Запазено"); setEditing(null); load();
  };

  if (loading || allowed === null) return <div className="flex min-h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  if (!allowed) return <div className="container py-20 text-center"><h1 className="text-2xl font-bold">Достъп отказан</h1></div>;

  const pct = stats.total ? Math.round((stats.done / stats.total) * 100) : 0;

  return (
    <AdminMFAGuard>
      <div className="min-h-dvh">
        <Header />
        <div className="container py-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Link to="/admin" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="h-3 w-3" /> Admin</Link>
              <h1 className="font-serif text-3xl font-bold flex items-center gap-2"><ClipboardCheck className="h-6 w-6 text-gold" /> Compliance табло</h1>
              <p className="text-sm text-muted-foreground">GDPR · AI Act · SOC 2 · ISO 27001 — единна матрица</p>
            </div>
            <Button onClick={() => setNewOpen(true)}><Plus className="mr-2 h-4 w-4" /> Нов контрол</Button>
          </div>

          <div className="grid gap-3 md:grid-cols-4">
            <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Готови</p><p className="text-2xl font-bold text-emerald-600">{stats.done}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">В ход</p><p className="text-2xl font-bold text-amber-600">{stats.in_progress}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Оставащи</p><p className="text-2xl font-bold">{stats.todo}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Цялостен % готовност</p><p className="text-2xl font-bold text-gold">{pct}%</p></CardContent></Card>
          </div>

          <Tabs value={tab} onValueChange={(v: any) => setTab(v)}>
            <TabsList>
              <TabsTrigger value="ALL">Всички</TabsTrigger>
              <TabsTrigger value="GDPR">GDPR</TabsTrigger>
              <TabsTrigger value="AI_ACT">AI Act</TabsTrigger>
              <TabsTrigger value="SOC2">SOC 2</TabsTrigger>
              <TabsTrigger value="ISO27001">ISO 27001</TabsTrigger>
            </TabsList>
          </Tabs>

          {busy && <Loader2 className="h-5 w-5 animate-spin" />}

          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr className="text-left">
                  <th className="p-3">Framework</th>
                  <th className="p-3">Контрол</th>
                  <th className="p-3">Заглавие</th>
                  <th className="p-3">Статус</th>
                  <th className="p-3">Приоритет</th>
                  <th className="p-3">Отговорник</th>
                  <th className="p-3">Evidence</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((r) => (
                  <tr key={r.id} className="border-t hover:bg-muted/30 cursor-pointer" onClick={() => setEditing(r)}>
                    <td className="p-3"><Badge variant="outline">{FW_LABEL[r.framework]}</Badge></td>
                    <td className="p-3 font-mono text-xs">{r.control_ref}</td>
                    <td className="p-3">{r.title}</td>
                    <td className="p-3"><Badge className={STATUS_TONE[r.status]}>{STATUS_LABEL[r.status]}</Badge></td>
                    <td className="p-3"><Badge className={PR_TONE[r.priority]}>{r.priority}</Badge></td>
                    <td className="p-3 text-xs text-muted-foreground">{r.owner_role ?? "—"}</td>
                    <td className="p-3 text-xs">
                      {r.evidence_url ? <a href={r.evidence_url} target="_blank" rel="noopener" onClick={(e) => e.stopPropagation()} className="inline-flex items-center gap-1 text-gold hover:underline"><ExternalLink className="h-3 w-3" /> link</a>
                        : r.evidence_notes ? <span className="text-muted-foreground">{r.evidence_notes.slice(0,40)}{r.evidence_notes.length>40?"…":""}</span>
                        : "—"}
                    </td>
                  </tr>
                ))}
                {!filtered.length && <tr><td colSpan={7} className="p-6 text-center text-muted-foreground">Няма контроли.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{editing && `${FW_LABEL[editing.framework]} ${editing.control_ref}`}</DialogTitle></DialogHeader>
            {editing && (
              <div className="space-y-3">
                <div><Label>Заглавие</Label><Input value={editing.title} onChange={(e) => setEditing({...editing, title: e.target.value})} /></div>
                <div><Label>Описание</Label><Textarea rows={2} value={editing.description ?? ""} onChange={(e) => setEditing({...editing, description: e.target.value})} /></div>
                <div className="grid gap-3 md:grid-cols-2">
                  <div>
                    <Label>Статус</Label>
                    <Select value={editing.status} onValueChange={(v: any) => setEditing({...editing, status: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{(Object.keys(STATUS_LABEL) as Status[]).map((s) => <SelectItem key={s} value={s}>{STATUS_LABEL[s]}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Приоритет</Label>
                    <Select value={editing.priority} onValueChange={(v: any) => setEditing({...editing, priority: v})}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>{(["critical","high","medium","low"] as Priority[]).map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div><Label>Отговорна роля</Label><Input value={editing.owner_role ?? ""} onChange={(e) => setEditing({...editing, owner_role: e.target.value})} placeholder="DPO / CTO / Product / HR" /></div>
                  <div><Label>Краен срок</Label><Input type="date" value={editing.due_date ?? ""} onChange={(e) => setEditing({...editing, due_date: e.target.value || null})} /></div>
                </div>
                <div><Label>Evidence URL</Label><Input value={editing.evidence_url ?? ""} onChange={(e) => setEditing({...editing, evidence_url: e.target.value})} placeholder="https://... / mem://..." /></div>
                <div><Label>Evidence бележки</Label><Textarea rows={2} value={editing.evidence_notes ?? ""} onChange={(e) => setEditing({...editing, evidence_notes: e.target.value})} /></div>
                {editing.last_reviewed_at && <p className="text-xs text-muted-foreground">Последен преглед: {new Date(editing.last_reviewed_at).toLocaleString("bg-BG")}</p>}
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Отказ</Button>
              <Button onClick={save} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<Save className="mr-2 h-4 w-4" />Запази</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <NewItemDialog open={newOpen} onClose={() => setNewOpen(false)} onDone={load} />
      </div>
    </AdminMFAGuard>
  );
}

function NewItemDialog({ open, onClose, onDone }: { open: boolean; onClose: () => void; onDone: () => void }) {
  const [framework, setFramework] = useState<Framework>("GDPR");
  const [ref, setRef] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const create = async () => {
    if (!ref || !title) { toast.error("Попълни ref и заглавие"); return; }
    setBusy(true);
    const { error } = await supabase.from("compliance_items").insert({ framework, control_ref: ref, title });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Създаден"); setRef(""); setTitle(""); onDone(); onClose();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader><DialogTitle>Нов контрол</DialogTitle></DialogHeader>
        <div className="space-y-3">
          <div>
            <Label>Framework</Label>
            <Select value={framework} onValueChange={(v: any) => setFramework(v)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{(Object.keys(FW_LABEL) as Framework[]).map((s) => <SelectItem key={s} value={s}>{FW_LABEL[s]}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div><Label>Control ref</Label><Input value={ref} onChange={(e) => setRef(e.target.value)} placeholder="напр. Art.32 / CC6.1" /></div>
          <div><Label>Заглавие</Label><Input value={title} onChange={(e) => setTitle(e.target.value)} /></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Отказ</Button>
          <Button onClick={create} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Създай</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
