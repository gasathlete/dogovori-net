import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AdminMFAGuard } from "@/components/admin/AdminMFAGuard";
import { ArrowLeft, Loader2, Plus, DatabaseBackup, Save, PlayCircle } from "@/icons";
import { toast } from "sonner";

interface Step { id: string; label: string; done: boolean; }
interface Drill {
  id: string; scheduled_at: string; executed_at: string | null;
  outcome: "success" | "partial" | "failure" | "skipped" | null;
  rto_measured_minutes: number | null; rpo_measured_minutes: number | null;
  rto_target_minutes: number; rpo_target_minutes: number;
  source_backup: string | null; steps: Step[];
  issues: string | null; remediation: string | null; evidence_url: string | null;
}

const OUTCOME_LABEL: Record<NonNullable<Drill["outcome"]>, string> = {
  success: "Успех", partial: "Частичен", failure: "Срив", skipped: "Пропуснат",
};
const OUTCOME_TONE: Record<NonNullable<Drill["outcome"]>, string> = {
  success: "bg-emerald-500/15 text-emerald-600",
  partial: "bg-amber-500/15 text-amber-600",
  failure: "bg-destructive/15 text-destructive",
  skipped: "bg-muted text-muted-foreground",
};

const DEFAULT_STEPS: Step[] = [
  { id: "snapshot", label: "Идентифицирай target snapshot/PITR point", done: false },
  { id: "isolated", label: "Restore в изолирана среда", done: false },
  { id: "verify_schema", label: "Verify schema integrity", done: false },
  { id: "verify_rows", label: "Verify row counts срещу production", done: false },
  { id: "verify_app", label: "Smoke test критични flows", done: false },
  { id: "measure_rto", label: "Запиши RTO (минути)", done: false },
  { id: "measure_rpo", label: "Запиши RPO (минути)", done: false },
  { id: "cleanup", label: "Изтрий тестовата среда", done: false },
  { id: "document", label: "Попълни форма с резултати", done: false },
];

export default function AdminRestoreDrillsPage() {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Drill[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Drill | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  useEffect(() => {
    if (loading || !user) { setAllowed(false); return; }
    supabase.rpc("is_staff", { _user_id: user.id }).then(({ data }) => setAllowed(Boolean(data)));
  }, [user, loading]);

  const load = async () => {
    setBusy(true);
    const { data, error } = await supabase.from("restore_drills").select("*").order("scheduled_at", { ascending: false });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setRows(((data ?? []) as any[]).map((r) => ({ ...r, steps: (r.steps as any) ?? [] })) as Drill[]);
  };
  useEffect(() => { if (allowed) load(); }, [allowed]);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    const { error } = await supabase.from("restore_drills").update({
      scheduled_at: editing.scheduled_at, executed_at: editing.executed_at,
      outcome: editing.outcome, rto_measured_minutes: editing.rto_measured_minutes,
      rpo_measured_minutes: editing.rpo_measured_minutes, source_backup: editing.source_backup,
      steps: editing.steps as any, issues: editing.issues, remediation: editing.remediation,
      evidence_url: editing.evidence_url,
    }).eq("id", editing.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Запазено"); setEditing(null); load();
  };

  const markExecuted = () => {
    if (!editing) return;
    setEditing({ ...editing, executed_at: new Date().toISOString(), outcome: editing.outcome ?? "success" });
  };

  const toggleStep = (i: number) => {
    if (!editing) return;
    const s = [...editing.steps]; s[i] = { ...s[i], done: !s[i].done };
    setEditing({ ...editing, steps: s });
  };

  if (loading || allowed === null) return <div className="flex min-h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  if (!allowed) return <div className="container py-20 text-center"><h1 className="text-2xl font-bold">Достъп отказан</h1></div>;

  return (
    <AdminMFAGuard>
      <div className="min-h-dvh">
        <Header />
        <div className="container py-8 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <Link to="/admin" className="text-sm text-muted-foreground inline-flex items-center gap-1 hover:text-foreground"><ArrowLeft className="h-3 w-3" /> Admin</Link>
              <h1 className="font-serif text-3xl font-bold flex items-center gap-2"><DatabaseBackup className="h-6 w-6 text-gold" /> Restore Drills</h1>
              <p className="text-sm text-muted-foreground">График, изпълнение, RTO/RPO логове</p>
            </div>
            <Button onClick={() => setNewOpen(true)}><Plus className="mr-2 h-4 w-4" /> Нов drill</Button>
          </div>

          {busy && <Loader2 className="h-5 w-5 animate-spin" />}

          <div className="grid gap-4 md:grid-cols-2">
            {rows.map((r) => (
              <Card key={r.id} className="hover:border-gold/40 cursor-pointer transition" onClick={() => setEditing(r)}>
                <CardHeader>
                  <div className="flex items-start justify-between">
                    <CardTitle className="text-base">Drill {new Date(r.scheduled_at).toLocaleDateString("bg-BG")}</CardTitle>
                    {r.outcome ? <Badge className={OUTCOME_TONE[r.outcome]}>{OUTCOME_LABEL[r.outcome]}</Badge>
                              : <Badge variant="outline">Предстои</Badge>}
                  </div>
                </CardHeader>
                <CardContent className="space-y-1 text-xs">
                  <div className="flex justify-between"><span className="text-muted-foreground">Изпълнен</span><span>{r.executed_at ? new Date(r.executed_at).toLocaleString("bg-BG") : "—"}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">RTO (мерен/цел)</span><span className="font-mono">{r.rto_measured_minutes ?? "—"} / {r.rto_target_minutes} мин</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">RPO (мерен/цел)</span><span className="font-mono">{r.rpo_measured_minutes ?? "—"} / {r.rpo_target_minutes} мин</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">Steps</span><span>{r.steps.filter(s=>s.done).length}/{r.steps.length}</span></div>
                </CardContent>
              </Card>
            ))}
            {!rows.length && !busy && <p className="text-muted-foreground">Няма drill-ове.</p>}
          </div>
        </div>

        <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Restore Drill — {editing && new Date(editing.scheduled_at).toLocaleDateString("bg-BG")}</DialogTitle></DialogHeader>
            {editing && (
              <div className="space-y-4">
                <div className="grid gap-3 md:grid-cols-2">
                  <div><Label>Планиран за</Label><Input type="datetime-local" value={editing.scheduled_at.slice(0,16)} onChange={(e) => setEditing({...editing, scheduled_at: new Date(e.target.value).toISOString()})} /></div>
                  <div><Label>Изпълнен на</Label>
                    <div className="flex gap-2">
                      <Input type="datetime-local" value={editing.executed_at?.slice(0,16) ?? ""} onChange={(e) => setEditing({...editing, executed_at: e.target.value ? new Date(e.target.value).toISOString() : null})} />
                      <Button size="icon" variant="outline" onClick={markExecuted} title="Сега"><PlayCircle className="h-4 w-4" /></Button>
                    </div>
                  </div>
                  <div>
                    <Label>Резултат</Label>
                    <Select value={editing.outcome ?? "_none"} onValueChange={(v: any) => setEditing({...editing, outcome: v === "_none" ? null : v})}>
                      <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="_none">—</SelectItem>
                        {(Object.keys(OUTCOME_LABEL) as Array<NonNullable<Drill["outcome"]>>).map((s) => <SelectItem key={s} value={s}>{OUTCOME_LABEL[s]}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div><Label>Source backup ID</Label><Input value={editing.source_backup ?? ""} onChange={(e) => setEditing({...editing, source_backup: e.target.value})} placeholder="snapshot-xxxx" /></div>
                  <div><Label>RTO измерено (мин)</Label><Input type="number" min={0} value={editing.rto_measured_minutes ?? ""} onChange={(e) => setEditing({...editing, rto_measured_minutes: e.target.value ? +e.target.value : null})} /></div>
                  <div><Label>RPO измерено (мин)</Label><Input type="number" min={0} value={editing.rpo_measured_minutes ?? ""} onChange={(e) => setEditing({...editing, rpo_measured_minutes: e.target.value ? +e.target.value : null})} /></div>
                </div>

                <div>
                  <Label>Стъпки ({editing.steps.filter(s=>s.done).length}/{editing.steps.length})</Label>
                  <div className="space-y-2 mt-2 rounded-lg border p-3 max-h-56 overflow-y-auto">
                    {editing.steps.map((s, i) => (
                      <label key={s.id} className="flex items-start gap-2 cursor-pointer">
                        <Checkbox checked={s.done} onCheckedChange={() => toggleStep(i)} />
                        <span className={`text-sm ${s.done ? "line-through text-muted-foreground" : ""}`}>{s.label}</span>
                      </label>
                    ))}
                  </div>
                </div>

                <div><Label>Срив / проблеми</Label><Textarea rows={3} value={editing.issues ?? ""} onChange={(e) => setEditing({...editing, issues: e.target.value})} /></div>
                <div><Label>Remediation</Label><Textarea rows={3} value={editing.remediation ?? ""} onChange={(e) => setEditing({...editing, remediation: e.target.value})} /></div>
                <div><Label>Evidence URL</Label><Input value={editing.evidence_url ?? ""} onChange={(e) => setEditing({...editing, evidence_url: e.target.value})} placeholder="https://..." /></div>
              </div>
            )}
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>Отказ</Button>
              <Button onClick={save} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}<Save className="mr-2 h-4 w-4" />Запази</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        <Dialog open={newOpen} onOpenChange={(o) => !o && setNewOpen(false)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Нов restore drill</DialogTitle></DialogHeader>
            <NewDrillForm onClose={() => setNewOpen(false)} onDone={load} />
          </DialogContent>
        </Dialog>
      </div>
    </AdminMFAGuard>
  );
}

function NewDrillForm({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const next = new Date(Date.now() + 6 * 30 * 24 * 3600 * 1000);
  const [date, setDate] = useState(next.toISOString().slice(0,16));
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    const { error } = await supabase.from("restore_drills").insert({
      scheduled_at: new Date(date).toISOString(),
      steps: DEFAULT_STEPS as any,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Създаден"); onDone(); onClose();
  };
  return (
    <>
      <div><Label>Планирана дата</Label><Input type="datetime-local" value={date} onChange={(e) => setDate(e.target.value)} /></div>
      <DialogFooter className="mt-4">
        <Button variant="outline" onClick={onClose}>Отказ</Button>
        <Button onClick={create} disabled={busy}>{busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Създай</Button>
      </DialogFooter>
    </>
  );
}
