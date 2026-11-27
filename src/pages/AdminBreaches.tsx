import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AdminMFAGuard } from "@/components/admin/AdminMFAGuard";
import { ArrowLeft, Loader2, Plus, ShieldAlert, Clock } from "@/icons";
import { toast } from "sonner";

interface Incident {
  id: string;
  title: string;
  detected_at: string;
  category: string;
  severity: string;
  affected_subjects_count: number;
  data_categories: string[];
  description: string;
  risk_assessment: string | null;
  root_cause: string | null;
  remediation: string | null;
  kzld_notified_at: string | null;
  kzld_reference: string | null;
  subjects_notified_at: string | null;
  status: string;
  closed_at: string | null;
}

const SEV_TONE: Record<string, string> = {
  low: "bg-muted text-muted-foreground",
  medium: "bg-amber-500/15 text-amber-600",
  high: "bg-orange-500/15 text-orange-600",
  critical: "bg-destructive/15 text-destructive",
};

function hoursSince(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / 3_600_000;
}

export default function AdminBreaches() {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Incident[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Incident | null>(null);
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState<Partial<Incident>>({
    title: "",
    category: "confidentiality",
    severity: "medium",
    affected_subjects_count: 0,
    data_categories: [],
    description: "",
    detected_at: new Date().toISOString().slice(0, 16),
  });

  useEffect(() => {
    if (loading || !user) { setAllowed(false); return; }
    supabase.rpc("is_staff", { _user_id: user.id }).then(({ data }) => setAllowed(Boolean(data)));
  }, [user, loading]);

  const load = async () => {
    setBusy(true);
    const { data, error } = await supabase
      .from("breach_incidents")
      .select("*")
      .order("detected_at", { ascending: false });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as Incident[]);
  };
  useEffect(() => { if (allowed) load(); }, [allowed]);

  const create = async () => {
    setBusy(true);
    const { error } = await supabase.from("breach_incidents").insert({
      title: draft.title!,
      detected_at: new Date(draft.detected_at!).toISOString(),
      category: draft.category!,
      severity: draft.severity!,
      affected_subjects_count: draft.affected_subjects_count ?? 0,
      data_categories: draft.data_categories ?? [],
      description: draft.description!,
      reported_by: user!.id,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Инцидентът е регистриран");
    setCreating(false);
    setDraft({ title: "", category: "confidentiality", severity: "medium", affected_subjects_count: 0, data_categories: [], description: "", detected_at: new Date().toISOString().slice(0, 16) });
    load();
  };

  const update = async () => {
    if (!editing) return;
    setBusy(true);
    const { error } = await supabase.from("breach_incidents").update({
      status: editing.status,
      severity: editing.severity,
      risk_assessment: editing.risk_assessment,
      root_cause: editing.root_cause,
      remediation: editing.remediation,
      kzld_notified_at: editing.kzld_notified_at,
      kzld_reference: editing.kzld_reference,
      subjects_notified_at: editing.subjects_notified_at,
      closed_at: editing.status === "closed" ? (editing.closed_at ?? new Date().toISOString()) : null,
    }).eq("id", editing.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Обновено");
    setEditing(null);
    load();
  };

  if (loading || allowed === null) return <div className="flex h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!allowed) return <div className="p-8">Forbidden</div>;

  const open = rows.filter((r) => r.status !== "closed");

  return (
    <AdminMFAGuard>
      <div className="min-h-dvh bg-background">
        <Header />
        <div className="container py-8">
          <div className="mb-6 flex items-center gap-3 flex-wrap">
            <Button asChild variant="ghost" size="sm"><Link to="/admin"><ArrowLeft className="mr-1 h-4 w-4" /> Admin</Link></Button>
            <h1 className="text-3xl font-bold flex items-center gap-2"><ShieldAlert className="h-7 w-7 text-gold" /> Breach Register</h1>
            <Badge variant="outline" className="ml-auto">{open.length} open</Badge>
            <Button size="sm" onClick={() => setCreating(true)}><Plus className="mr-1 h-4 w-4" /> Регистрирай инцидент</Button>
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Заглавие</th>
                    <th className="px-3 py-2 text-left">Категория</th>
                    <th className="px-3 py-2 text-left">Тежест</th>
                    <th className="px-3 py-2 text-left">Засегнати</th>
                    <th className="px-3 py-2 text-left">Detected</th>
                    <th className="px-3 py-2 text-left">72ч таймер</th>
                    <th className="px-3 py-2 text-left">КЗЛД</th>
                    <th className="px-3 py-2 text-left">Статус</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const h = hoursSince(r.detected_at);
                    const remaining = 72 - h;
                    const overdue = !r.kzld_notified_at && r.status !== "closed" && remaining < 0;
                    const urgent = !r.kzld_notified_at && r.status !== "closed" && remaining > 0 && remaining < 24;
                    return (
                      <tr key={r.id} className="border-t border-border/40">
                        <td className="px-3 py-2 font-medium max-w-xs truncate">{r.title}</td>
                        <td className="px-3 py-2">{r.category}</td>
                        <td className="px-3 py-2"><Badge className={SEV_TONE[r.severity] ?? ""}>{r.severity}</Badge></td>
                        <td className="px-3 py-2">{r.affected_subjects_count}</td>
                        <td className="px-3 py-2 text-xs">{new Date(r.detected_at).toLocaleString("bg-BG")}</td>
                        <td className="px-3 py-2 text-xs">
                          {r.kzld_notified_at ? (
                            <span className="text-emerald-600">✓ {new Date(r.kzld_notified_at).toLocaleDateString("bg-BG")}</span>
                          ) : r.status === "closed" ? (
                            <span className="text-muted-foreground">N/A</span>
                          ) : (
                            <span className={`inline-flex items-center gap-1 ${overdue ? "text-destructive font-semibold" : urgent ? "text-orange-600 font-medium" : "text-muted-foreground"}`}>
                              <Clock className="h-3 w-3" />
                              {overdue ? `+${Math.abs(remaining).toFixed(0)}ч закъснение` : `${remaining.toFixed(0)}ч оставащи`}
                            </span>
                          )}
                        </td>
                        <td className="px-3 py-2 text-xs">{r.kzld_reference ?? "—"}</td>
                        <td className="px-3 py-2"><Badge variant="outline">{r.status}</Badge></td>
                        <td className="px-3 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Open</Button></td>
                      </tr>
                    );
                  })}
                  {rows.length === 0 && <tr><td colSpan={9} className="px-3 py-8 text-center text-muted-foreground text-sm">Няма регистрирани инциденти. 🎉</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Нов инцидент</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div><Label>Заглавие</Label><Input value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} /></div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Категория</Label>
                <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="confidentiality">Поверителност</SelectItem>
                    <SelectItem value="integrity">Цялостност</SelectItem>
                    <SelectItem value="availability">Достъпност</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Тежест</Label>
                <Select value={draft.severity} onValueChange={(v) => setDraft({ ...draft, severity: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">low</SelectItem>
                    <SelectItem value="medium">medium</SelectItem>
                    <SelectItem value="high">high</SelectItem>
                    <SelectItem value="critical">critical</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Detected at</Label>
                <Input type="datetime-local" value={draft.detected_at} onChange={(e) => setDraft({ ...draft, detected_at: e.target.value })} />
              </div>
              <div>
                <Label>Засегнати субекти</Label>
                <Input type="number" min={0} value={draft.affected_subjects_count} onChange={(e) => setDraft({ ...draft, affected_subjects_count: parseInt(e.target.value) || 0 })} />
              </div>
            </div>
            <div><Label>Описание</Label><Textarea rows={3} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></div>
            <p className="text-xs text-muted-foreground">⏱ 72-часовият таймер за нотификация до КЗЛД започва от „Detected at".</p>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreating(false)}>Cancel</Button>
            <Button onClick={create} disabled={busy || !draft.title || !draft.description}>Регистрирай</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-xl">
          <DialogHeader><DialogTitle>{editing?.title}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Статус</Label>
                  <Select value={editing.status} onValueChange={(v) => setEditing({ ...editing, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="open">open</SelectItem>
                      <SelectItem value="investigating">investigating</SelectItem>
                      <SelectItem value="contained">contained</SelectItem>
                      <SelectItem value="closed">closed</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Тежест</Label>
                  <Select value={editing.severity} onValueChange={(v) => setEditing({ ...editing, severity: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">low</SelectItem>
                      <SelectItem value="medium">medium</SelectItem>
                      <SelectItem value="high">high</SelectItem>
                      <SelectItem value="critical">critical</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>КЗЛД notified</Label>
                  <Input type="datetime-local" value={editing.kzld_notified_at?.slice(0, 16) ?? ""} onChange={(e) => setEditing({ ...editing, kzld_notified_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                </div>
                <div>
                  <Label>КЗЛД reference</Label>
                  <Input value={editing.kzld_reference ?? ""} onChange={(e) => setEditing({ ...editing, kzld_reference: e.target.value || null })} />
                </div>
                <div className="col-span-2">
                  <Label>Subjects notified</Label>
                  <Input type="datetime-local" value={editing.subjects_notified_at?.slice(0, 16) ?? ""} onChange={(e) => setEditing({ ...editing, subjects_notified_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
                </div>
              </div>
              <div><Label>Risk assessment</Label><Textarea rows={2} value={editing.risk_assessment ?? ""} onChange={(e) => setEditing({ ...editing, risk_assessment: e.target.value || null })} /></div>
              <div><Label>Root cause</Label><Textarea rows={2} value={editing.root_cause ?? ""} onChange={(e) => setEditing({ ...editing, root_cause: e.target.value || null })} /></div>
              <div><Label>Remediation</Label><Textarea rows={2} value={editing.remediation ?? ""} onChange={(e) => setEditing({ ...editing, remediation: e.target.value || null })} /></div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={update} disabled={busy}>Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminMFAGuard>
  );
}
