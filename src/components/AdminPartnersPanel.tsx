import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";
import { Check, Loader2, Plus, Trash2, X, ExternalLink } from "@/icons";

type Partner = {
  id: string;
  name: string;
  website_url: string | null;
  logo_url: string;
  status: "pending" | "approved" | "rejected";
  display_order: number;
  created_at: string;
};

export function AdminPartnersPanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Partner[]>([]);
  const [busy, setBusy] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState("");
  const [website, setWebsite] = useState("");
  const [file, setFile] = useState<File | null>(null);

  const load = async () => {
    setBusy(true);
    const { data, error } = await supabase
      .from("partners")
      .select("id,name,website_url,logo_url,status,display_order,created_at")
      .order("status", { ascending: true })
      .order("created_at", { ascending: false });
    setBusy(false);
    if (error) return toast.error(error.message);
    setRows((data as Partner[]) ?? []);
  };

  useEffect(() => { load(); }, []);

  const setStatus = async (p: Partner, status: Partner["status"]) => {
    const { error } = await supabase
      .from("partners")
      .update({ status, approved_by: user?.id, approved_at: status === "approved" ? new Date().toISOString() : null })
      .eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success(status === "approved" ? "Одобрено" : status === "rejected" ? "Отхвърлено" : "Обновено");
    load();
  };

  const remove = async (p: Partner) => {
    if (!confirm(`Изтриване на ${p.name}?`)) return;
    const { error } = await supabase.from("partners").delete().eq("id", p.id);
    if (error) return toast.error(error.message);
    toast.success("Изтрито");
    load();
  };

  const addPartner = async () => {
    if (!user) return;
    if (!name.trim()) return toast.error("Въведете име");
    if (!file) return toast.error("Качете лого");
    if (file.size > 2 * 1024 * 1024) return toast.error("Логото трябва да е до 2MB");
    setBusy(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${user.id}/${crypto.randomUUID()}.${ext}`;
      const { error: upErr } = await supabase.storage
        .from("partner-logos")
        .upload(path, file, { contentType: file.type });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("partner-logos").getPublicUrl(path);
      const { error: insErr } = await supabase.from("partners").insert({
        name: name.trim(),
        website_url: website.trim() || null,
        logo_url: pub.publicUrl,
        submitted_by: user.id,
        status: "approved",
        approved_by: user.id,
        approved_at: new Date().toISOString(),
      });
      if (insErr) throw insErr;
      toast.success("Партньорът е добавен");
      setName(""); setWebsite(""); setFile(null);
      setAddOpen(false);
      load();
    } catch (e: any) {
      toast.error(e.message || "Грешка");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mt-10">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">Партньори</h2>
        <Button onClick={() => setAddOpen(true)} size="sm">
          <Plus className="h-4 w-4 mr-1" /> Добави партньор
        </Button>
      </div>

      <div className="border rounded-lg overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Лого</TableHead>
              <TableHead>Име</TableHead>
              <TableHead>Линк</TableHead>
              <TableHead>Статус</TableHead>
              <TableHead className="text-right">Действия</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((p) => (
              <TableRow key={p.id}>
                <TableCell>
                  <img loading="lazy" decoding="async" src={p.logo_url} alt={p.name} className="h-10 w-auto max-w-[120px] object-contain" />
                </TableCell>
                <TableCell className="font-medium">{p.name}</TableCell>
                <TableCell>
                  {p.website_url ? (
                    <a href={p.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-gold hover:underline text-sm">
                      {p.website_url} <ExternalLink className="h-3 w-3" />
                    </a>
                  ) : <span className="text-xs text-muted-foreground">—</span>}
                </TableCell>
                <TableCell>
                  {p.status === "approved" ? <Badge className="bg-success text-white">Одобрен</Badge> :
                   p.status === "pending" ? <Badge variant="outline">Чакащ</Badge> :
                   <Badge variant="destructive">Отхвърлен</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex gap-1 justify-end flex-wrap">
                    {p.status !== "approved" && (
                      <Button size="sm" variant="outline" onClick={() => setStatus(p, "approved")}>
                        <Check className="h-3 w-3 mr-1 text-success" /> Одобри
                      </Button>
                    )}
                    {p.status !== "rejected" && (
                      <Button size="sm" variant="ghost" onClick={() => setStatus(p, "rejected")}>
                        <X className="h-3 w-3" />
                      </Button>
                    )}
                    <Button size="sm" variant="ghost" onClick={() => remove(p)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-8">Няма партньори</TableCell></TableRow>
            )}
          </TableBody>
        </Table>
      </div>

      <Dialog open={addOpen} onOpenChange={setAddOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Добави партньор</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Име</Label>
              <Input value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div>
              <Label>Линк (по избор)</Label>
              <Input value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://..." />
            </div>
            <div>
              <Label>Лого</Label>
              <Input type="file" accept="image/*" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAddOpen(false)} disabled={busy}>Отказ</Button>
            <Button onClick={addPartner} disabled={busy}>
              {busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />} Добави
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
