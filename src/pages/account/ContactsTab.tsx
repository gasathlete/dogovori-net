import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  Users, FolderOpen, FileText, CreditCard, Settings as SettingsIcon, LogOut, Crown, Bird, Loader2, Plus, Trash2, Star, Download, ArrowLeft, X, MessageSquare, Check, Lock, RefreshCw, Sparkles, Building2, Bell, LayoutDashboard,
} from "lucide-react";
import { NotificationsTab } from "@/components/NotificationsTab";
import { useUnreadNotifications } from "@/hooks/useUnreadNotifications";

import { useTeam } from "@/hooks/useTeam";
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
import { LegalDisclaimer } from "@/components/LegalDisclaimer";
import { Seo } from "@/components/Seo";
import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend, AreaChart, Area, LineChart, Line, ReferenceLine,
} from "recharts";
import { getUnlockedTiers, getNextTier, REWARD_TIERS } from "@/lib/rewards";

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
type Quota = { contracts_used: number; templates_used: number; plan: "free" | "pro"; pro_until: string | null; analyses_used?: number; total_used?: number; monthly_total_used?: number; bonus_contracts?: number; pro_monthly_used?: number; monthly_reset_at?: string | null; pro_period_start?: string | null; signup_at?: string | null };
type UploadedContract = {
  id: string; title: string; source: "pdf" | "docx" | "paste";
  folder_id: string | null; contact_id: string | null;
  original_filename: string | null; storage_path: string | null;
  created_at: string;
};
type RiskAnalysisLite = { uploaded_contract_id: string; score: number; contract_type: string; created_at: string };

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

export default ContactsTab;
