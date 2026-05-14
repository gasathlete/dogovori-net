import { useEffect, useState, useCallback } from "react";
import { Loader2, Plus, Trash2, Search, Upload, Pencil, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type Contact = {
  id: string;
  name: string;
  type: "individual" | "company";
  eik: string | null;
  vat_number: string | null;
  address: string | null;
  mol: string | null;
  email: string | null;
  phone: string | null;
  notes: string | null;
  user_id: string;
  team_id: string | null;
  created_at: string;
};

const empty: Partial<Contact> = { type: "company", name: "" };

export function TeamContacts({ teamId, isAdmin }: { teamId: string; isAdmin: boolean }) {
  const { user } = useAuth();
  const [list, setList] = useState<Contact[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [editOpen, setEditOpen] = useState(false);
  const [editing, setEditing] = useState<Partial<Contact>>(empty);
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("contacts")
      .select("*").eq("team_id", teamId).is("deleted_at", null)
      .order("name", { ascending: true });
    setList((data as Contact[]) ?? []);
    setLoading(false);
  }, [teamId]);

  useEffect(() => { load(); }, [load]);

  const openNew = () => { setEditing({ ...empty }); setEditOpen(true); };
  const openEdit = (c: Contact) => { setEditing(c); setEditOpen(true); };

  const lookup = async () => {
    if (!editing.eik) return;
    setBusy(true);
    const { data, error } = await supabase.functions.invoke("lookup-eik", { body: { eik: editing.eik } });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    if (data?.ok && data.data) {
      setEditing({
        ...editing,
        name: editing.name || data.data.name || "",
        vat_number: editing.vat_number || data.data.vat_number || null,
        address: editing.address || data.data.address || null,
        mol: editing.mol || data.data.mol || null,
        type: "company",
      });
      toast.success("Попълнено");
    } else {
      toast.message(data?.error || "Няма данни");
      if (data?.suggested?.vat_number) setEditing({ ...editing, vat_number: editing.vat_number || data.suggested.vat_number });
    }
  };

  const save = async () => {
    if (!editing.name || editing.name.length < 2) { toast.error("Името е задължително"); return; }
    if (!user) return;
    setBusy(true);
    const payload = {
      name: editing.name, type: editing.type || "company",
      eik: editing.eik || null, vat_number: editing.vat_number || null,
      address: editing.address || null, mol: editing.mol || null,
      email: editing.email || null, phone: editing.phone || null,
      notes: editing.notes || null, team_id: teamId,
    };
    let error;
    if (editing.id) {
      ({ error } = await supabase.from("contacts").update(payload).eq("id", editing.id));
    } else {
      ({ error } = await supabase.from("contacts").insert({ ...payload, user_id: user.id }));
    }
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(editing.id ? "Обновен" : "Добавен");
    setEditOpen(false); setEditing(empty); load();
  };

  const remove = async (c: Contact) => {
    if (!confirm(`Изтрий "${c.name}"?`)) return;
    const { error } = await supabase.from("contacts").update({ deleted_at: new Date().toISOString() }).eq("id", c.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Изтрит"); load();
  };

  const importCsv = async (file: File) => {
    if (!user) return;
    const text = await file.text();
    const lines = text.split(/\r?\n/).filter(Boolean);
    if (lines.length < 2) { toast.error("Празен CSV"); return; }
    const headers = lines[0].split(/[,;]/).map((h) => h.trim().toLowerCase());
    const idx = (k: string) => headers.findIndex((h) => h === k || h.includes(k));
    const map = {
      name: idx("name") >= 0 ? idx("name") : idx("име"),
      eik: idx("eik") >= 0 ? idx("eik") : idx("ЕИК"),
      vat: idx("vat") >= 0 ? idx("vat") : idx("ддс"),
      address: idx("address") >= 0 ? idx("address") : idx("адрес"),
      mol: idx("mol") >= 0 ? idx("mol") : idx("мол"),
      email: idx("email") >= 0 ? idx("email") : idx("имейл"),
      phone: idx("phone") >= 0 ? idx("phone") : idx("телефон"),
    };
    if (map.name < 0) { toast.error("Липсва колона 'name' / 'име'"); return; }
    const rows = lines.slice(1).map((ln) => {
      const cols = ln.split(/[,;]/).map((c) => c.trim().replace(/^"|"$/g, ""));
      const name = cols[map.name];
      if (!name) return null;
      return {
        user_id: user.id, team_id: teamId, name,
        type: map.eik >= 0 && cols[map.eik] ? "company" : "individual",
        eik: map.eik >= 0 ? cols[map.eik] || null : null,
        vat_number: map.vat >= 0 ? cols[map.vat] || null : null,
        address: map.address >= 0 ? cols[map.address] || null : null,
        mol: map.mol >= 0 ? cols[map.mol] || null : null,
        email: map.email >= 0 ? cols[map.email] || null : null,
        phone: map.phone >= 0 ? cols[map.phone] || null : null,
      };
    }).filter(Boolean) as any[];
    if (rows.length === 0) { toast.error("Няма валидни редове"); return; }
    const { error } = await supabase.from("contacts").insert(rows);
    if (error) { toast.error(error.message); return; }
    toast.success(`Внесени ${rows.length} контакта`);
    setImportOpen(false); load();
  };

  const filtered = list.filter((c) => {
    if (!search) return true;
    const q = search.toLowerCase();
    return c.name.toLowerCase().includes(q) || (c.eik || "").includes(q) || (c.email || "").toLowerCase().includes(q);
  });

  return (
    <div className="rounded-2xl border border-border/60 bg-gradient-card p-6">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h2 className="font-serif text-xl font-bold">Контакти на фирмата</h2>
          <p className="mt-1 text-xs text-muted-foreground">Споделени с всички членове. Използват се при създаване на договори.</p>
        </div>
        <div className="flex gap-2">
          <Button onClick={() => setImportOpen(true)} size="sm" variant="outline"><Upload className="mr-2 h-4 w-4" />CSV</Button>
          <Button onClick={openNew} size="sm" className="bg-gradient-gold text-navy"><Plus className="mr-2 h-4 w-4" />Нов</Button>
        </div>
      </div>

      <div className="relative mb-3">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Търсене по име, ЕИК, имейл…" className="pl-9" />
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-gold" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-dashed border-border/60 px-4 py-8 text-center text-sm text-muted-foreground">
          {list.length === 0 ? "Все още няма споделени контакти." : "Няма съвпадение."}
        </div>
      ) : (
        <ul className="divide-y divide-border/40">
          {filtered.map((c) => (
            <li key={c.id} className="flex items-center justify-between gap-3 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <span className="truncate">{c.name}</span>
                  <span className="rounded-full border border-border/60 px-2 py-0.5 text-[10px] uppercase text-muted-foreground">{c.type === "company" ? "Фирма" : "Лице"}</span>
                </div>
                <div className="mt-0.5 truncate text-xs text-muted-foreground">
                  {[c.eik && `ЕИК ${c.eik}`, c.email, c.phone].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="flex shrink-0 gap-1">
                <Button variant="ghost" size="sm" onClick={() => openEdit(c)}><Pencil className="h-4 w-4" /></Button>
                {(isAdmin || c.user_id === user?.id) && (
                  <Button variant="ghost" size="sm" onClick={() => remove(c)}><Trash2 className="h-4 w-4 text-destructive" /></Button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader><DialogTitle>{editing.id ? "Редакция" : "Нов контакт"}</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <Button variant={editing.type === "company" ? "default" : "outline"} size="sm" onClick={() => setEditing({ ...editing, type: "company" })} className={editing.type === "company" ? "bg-gradient-gold text-navy" : ""}>Фирма</Button>
              <Button variant={editing.type === "individual" ? "default" : "outline"} size="sm" onClick={() => setEditing({ ...editing, type: "individual" })} className={editing.type === "individual" ? "bg-gradient-gold text-navy" : ""}>Физ. лице</Button>
            </div>
            {editing.type === "company" && (
              <div>
                <Label>ЕИК</Label>
                <div className="flex gap-2">
                  <Input value={editing.eik || ""} onChange={(e) => setEditing({ ...editing, eik: e.target.value })} placeholder="123456789" />
                  <Button type="button" variant="outline" onClick={lookup} disabled={busy || !editing.eik}>Справка</Button>
                </div>
              </div>
            )}
            <div>
              <Label>Име{editing.type === "company" ? " на фирмата" : ""} *</Label>
              <Input value={editing.name || ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
            </div>
            {editing.type === "company" && (
              <>
                <div className="grid grid-cols-2 gap-2">
                  <div><Label>ДДС №</Label><Input value={editing.vat_number || ""} onChange={(e) => setEditing({ ...editing, vat_number: e.target.value })} /></div>
                  <div><Label>МОЛ</Label><Input value={editing.mol || ""} onChange={(e) => setEditing({ ...editing, mol: e.target.value })} /></div>
                </div>
                <div><Label>Адрес</Label><Input value={editing.address || ""} onChange={(e) => setEditing({ ...editing, address: e.target.value })} /></div>
              </>
            )}
            <div className="grid grid-cols-2 gap-2">
              <div><Label>Имейл</Label><Input type="email" value={editing.email || ""} onChange={(e) => setEditing({ ...editing, email: e.target.value })} /></div>
              <div><Label>Телефон</Label><Input value={editing.phone || ""} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} /></div>
            </div>
            <div><Label>Бележки</Label><Input value={editing.notes || ""} onChange={(e) => setEditing({ ...editing, notes: e.target.value })} /></div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditOpen(false)}><X className="mr-2 h-4 w-4" />Отказ</Button>
              <Button onClick={save} disabled={busy} className="bg-gradient-gold text-navy">
                {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />} Запази
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={importOpen} onOpenChange={setImportOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Импорт от CSV</DialogTitle></DialogHeader>
          <div className="space-y-3 text-sm">
            <p>Поддържани колони (разделител запетая или точка-запетая): <code>name, eik, vat, address, mol, email, phone</code>. Първи ред = заглавия.</p>
            <Input type="file" accept=".csv,text/csv" onChange={(e) => e.target.files?.[0] && importCsv(e.target.files[0])} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
