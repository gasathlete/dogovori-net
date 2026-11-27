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
import { ArrowLeft, Loader2, Save, Users } from "@/icons";
import { toast } from "sonner";

interface Vendor {
  id: string;
  vendor_name: string;
  category: string;
  role: string;
  country: string | null;
  dpa_url: string | null;
  scc_signed: boolean;
  scc_module: string | null;
  soc2_url: string | null;
  iso27001: boolean;
  security_contact: string | null;
  last_reviewed_at: string | null;
  next_review_at: string | null;
  status: string;
  risk_level: string;
  notes: string | null;
}

const RISK_TONE: Record<string, string> = {
  low: "bg-emerald-500/15 text-emerald-600",
  medium: "bg-amber-500/15 text-amber-600",
  high: "bg-destructive/15 text-destructive",
};

export default function AdminVendors() {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Vendor[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Vendor | null>(null);

  useEffect(() => {
    if (loading || !user) { setAllowed(false); return; }
    supabase.rpc("is_staff", { _user_id: user.id }).then(({ data }) => setAllowed(Boolean(data)));
  }, [user, loading]);

  const load = async () => {
    setBusy(true);
    const { data, error } = await supabase
      .from("vendor_assessments")
      .select("*")
      .order("vendor_name");
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as Vendor[]);
  };
  useEffect(() => { if (allowed) load(); }, [allowed]);

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    const { error } = await supabase
      .from("vendor_assessments")
      .update({
        status: editing.status,
        risk_level: editing.risk_level,
        scc_signed: editing.scc_signed,
        scc_module: editing.scc_module,
        last_reviewed_at: editing.last_reviewed_at,
        next_review_at: editing.next_review_at,
        notes: editing.notes,
      })
      .eq("id", editing.id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Saved");
    setEditing(null);
    load();
  };

  if (loading || allowed === null) return <div className="flex h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!allowed) return <div className="p-8">Forbidden</div>;

  const overdue = rows.filter((r) => r.next_review_at && new Date(r.next_review_at) < new Date());

  return (
    <AdminMFAGuard>
      <div className="min-h-dvh bg-background">
        <Header />
        <div className="container py-8">
          <div className="mb-6 flex items-center gap-3 flex-wrap">
            <Button asChild variant="ghost" size="sm"><Link to="/admin"><ArrowLeft className="mr-1 h-4 w-4" /> Admin</Link></Button>
            <h1 className="text-3xl font-bold flex items-center gap-2"><Users className="h-7 w-7 text-gold" /> Vendor Due Diligence</h1>
            <Badge variant="outline" className="ml-auto">{rows.length} вендори</Badge>
            {overdue.length > 0 && <Badge className="bg-destructive/15 text-destructive">{overdue.length} закъснели прегледи</Badge>}
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Вендор</th>
                    <th className="px-3 py-2 text-left">Роля</th>
                    <th className="px-3 py-2 text-left">Държава</th>
                    <th className="px-3 py-2 text-left">DPA / SCC</th>
                    <th className="px-3 py-2 text-left">SOC2 / ISO</th>
                    <th className="px-3 py-2 text-left">Риск</th>
                    <th className="px-3 py-2 text-left">Преглед</th>
                    <th className="px-3 py-2"></th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => {
                    const isOverdue = r.next_review_at && new Date(r.next_review_at) < new Date();
                    return (
                      <tr key={r.id} className="border-t border-border/40">
                        <td className="px-3 py-2 font-medium">{r.vendor_name}<div className="text-xs text-muted-foreground">{r.category}</div></td>
                        <td className="px-3 py-2">{r.role}</td>
                        <td className="px-3 py-2">{r.country ?? "—"}</td>
                        <td className="px-3 py-2">
                          {r.dpa_url ? <a href={r.dpa_url} target="_blank" rel="noreferrer" className="text-gold underline">DPA</a> : "—"}
                          {r.scc_signed && <span className="ml-2 text-xs">SCC {r.scc_module ?? ""}</span>}
                        </td>
                        <td className="px-3 py-2 text-xs">
                          {r.soc2_url ? <a href={r.soc2_url} target="_blank" rel="noreferrer" className="text-gold underline">SOC2</a> : "—"}
                          {r.iso27001 && <span className="ml-2">ISO27001</span>}
                        </td>
                        <td className="px-3 py-2"><Badge className={RISK_TONE[r.risk_level] ?? ""}>{r.risk_level}</Badge></td>
                        <td className="px-3 py-2 text-xs">
                          <div>Last: {r.last_reviewed_at ?? "—"}</div>
                          <div className={isOverdue ? "text-destructive font-medium" : ""}>Next: {r.next_review_at ?? "—"}</div>
                        </td>
                        <td className="px-3 py-2 text-right"><Button size="sm" variant="ghost" onClick={() => setEditing(r)}>Edit</Button></td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </div>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>{editing?.vendor_name}</DialogTitle></DialogHeader>
          {editing && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <Label>Status</Label>
                  <Select value={editing.status} onValueChange={(v) => setEditing({ ...editing, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="pending">pending</SelectItem>
                      <SelectItem value="approved">approved</SelectItem>
                      <SelectItem value="restricted">restricted</SelectItem>
                      <SelectItem value="terminated">terminated</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Risk</Label>
                  <Select value={editing.risk_level} onValueChange={(v) => setEditing({ ...editing, risk_level: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="low">low</SelectItem>
                      <SelectItem value="medium">medium</SelectItem>
                      <SelectItem value="high">high</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Last reviewed</Label>
                  <Input type="date" value={editing.last_reviewed_at ?? ""} onChange={(e) => setEditing({ ...editing, last_reviewed_at: e.target.value || null })} />
                </div>
                <div>
                  <Label>Next review</Label>
                  <Input type="date" value={editing.next_review_at ?? ""} onChange={(e) => setEditing({ ...editing, next_review_at: e.target.value || null })} />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="scc" checked={editing.scc_signed} onChange={(e) => setEditing({ ...editing, scc_signed: e.target.checked })} />
                <Label htmlFor="scc">SCC signed</Label>
                <Input className="ml-2" placeholder="module (e.g. 2)" value={editing.scc_module ?? ""} onChange={(e) => setEditing({ ...editing, scc_module: e.target.value || null })} />
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea rows={3} value={editing.notes ?? ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value || null })} />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setEditing(null)}>Cancel</Button>
            <Button onClick={save} disabled={busy}><Save className="mr-1 h-4 w-4" /> Save</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminMFAGuard>
  );
}
