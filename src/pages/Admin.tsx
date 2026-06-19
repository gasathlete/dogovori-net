import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Crown, Loader2, Search, ShieldCheck, ShieldOff, Plus } from "lucide-react";
import { AdminPartnersPanel } from "@/components/AdminPartnersPanel";
import { AdminBlanksPanel } from "@/components/AdminBlanksPanel";
import { AdminUserArticlesPanel } from "@/components/AdminUserArticlesPanel";
import { AdminGscPanel } from "@/components/AdminGscPanel";
import { AdminNotificationsPanel } from "@/components/AdminNotificationsPanel";
import { BlankCacheWarmer } from "@/components/admin/BlankCacheWarmer";
import { AdminMFAGuard } from "@/components/admin/AdminMFAGuard";

type Row = {
  user_id: string;
  email: string;
  display_name: string | null;
  plan: "free" | "pro";
  pro_until: string | null;
  contracts_used: number;
  analyses_used: number;
  bonus_contracts: number;
  ops_total: number;
  ops_monthly: number;
  is_moderator: boolean;
  is_admin: boolean;
  created_at: string;
};


export default function AdminPage() {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [search, setSearch] = useState("");
  const [busy, setBusy] = useState(false);
  const [proDialog, setProDialog] = useState<{ row: Row; months: string } | null>(null);
  const [bonusDialog, setBonusDialog] = useState<{ row: Row; count: string } | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { setAllowed(false); return; }
    supabase.rpc("is_staff", { _user_id: user.id }).then(({ data, error }) => {
      if (error) { setAllowed(false); return; }
      setAllowed(Boolean(data));
    });
  }, [user, loading]);

  const load = async (q?: string) => {
    setBusy(true);
    const { data, error } = await supabase.rpc("admin_list_users", { _search: q || null, _limit: 200 });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setRows((data as Row[]) ?? []);
  };

  useEffect(() => { if (allowed) load(); }, [allowed]);

  if (loading || allowed === null) {
    return <div className="flex min-h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  }
  if (!allowed) {
    return (
      <div className="min-h-dvh">
        <Header />
        <div className="container py-20 text-center">
          <h1 className="text-2xl font-bold mb-2">Достъп отказан</h1>
          <p className="text-muted-foreground mb-4">Тази страница е достъпна само за модератори.</p>
          <Button asChild variant="outline"><Link to="/">Към начало</Link></Button>
        </div>
      </div>
    );
  }

  const grantPro = async () => {
    if (!proDialog) return;
    const months = parseInt(proDialog.months, 10);
    if (!Number.isFinite(months) || months <= 0) { toast.error("Невалиден брой месеци"); return; }
    setBusy(true);
    const { error } = await supabase.rpc("admin_set_pro", { _user_id: proDialog.row.user_id, _months: months });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`Pro достъп даден за ${months} м.`);
    setProDialog(null);
    load(search);
  };

  const revokePro = async (row: Row) => {
    if (!confirm(`Премахване на Pro за ${row.email}?`)) return;
    const { error } = await supabase.rpc("admin_revoke_pro", { _user_id: row.user_id });
    if (error) { toast.error(error.message); return; }
    toast.success("Pro отнет");
    load(search);
  };

  const addBonus = async () => {
    if (!bonusDialog) return;
    const count = parseInt(bonusDialog.count, 10);
    if (!Number.isFinite(count) || count <= 0) { toast.error("Невалиден брой"); return; }
    const { error } = await supabase.rpc("admin_add_bonus_contracts", { _user_id: bonusDialog.row.user_id, _count: count });
    if (error) { toast.error(error.message); return; }
    toast.success(`+${count} бонус договора`);
    setBonusDialog(null);
    load(search);
  };

  const toggleRole = async (row: Row, role: "moderator" | "admin", grant: boolean) => {
    const { error } = await supabase.rpc("admin_set_role", { _user_id: row.user_id, _role: role, _grant: grant });
    if (error) { toast.error(error.message); return; }
    toast.success("Ролята е обновена");
    load(search);
  };

  return (
    <AdminMFAGuard>
    <div className="min-h-dvh bg-background">
      <Header />
      <div className="container py-8">
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Button asChild variant="ghost" size="sm"><Link to="/account"><ArrowLeft className="h-4 w-4 mr-1" /> Профил</Link></Button>
          <h1 className="text-3xl font-bold flex items-center gap-2"><ShieldCheck className="h-7 w-7 text-gold" /> Модераторски панел</h1>
          <Button asChild variant="outline" size="sm" className="ml-auto border-gold/40"><Link to="/admin/analytics">📊 Analytics</Link></Button>
          <Button asChild variant="outline" size="sm" className="border-gold/40"><Link to="/admin/perf">⚡ Performance</Link></Button>
          <Button asChild variant="outline" size="sm" className="border-gold/40"><Link to="/admin/privacy">🛡️ Privacy</Link></Button>
          <Button asChild variant="outline" size="sm" className="border-gold/40"><Link to="/admin/compliance">✅ Compliance</Link></Button>
          <Button asChild variant="outline" size="sm" className="border-gold/40"><Link to="/admin/vendors">🤝 Vendors</Link></Button>
          <Button asChild variant="outline" size="sm" className="border-gold/40"><Link to="/admin/breaches">🚨 Breaches</Link></Button>
          <Button asChild variant="outline" size="sm" className="border-gold/40"><Link to="/admin/ai-post-market">📈 AI Monitor</Link></Button>
          <Button asChild variant="outline" size="sm" className="border-gold/40"><Link to="/admin/training">📚 Training</Link></Button>
          <Button asChild variant="outline" size="sm" className="border-gold/40"><Link to="/admin/pentest">🔒 Пен-тестове</Link></Button>
          <Button asChild variant="outline" size="sm" className="border-gold/40"><Link to="/admin/restore-drills">💾 Restore drills</Link></Button>
          <Button asChild variant="outline" size="sm" className="border-gold/40"><Link to="/admin/subscriptions">💳 Абонаменти & екипи</Link></Button>
          <Button asChild variant="outline" size="sm" className="border-gold/40"><Link to="/admin/plans">💶 Планове и цени</Link></Button>
          <Button asChild variant="outline" size="sm" className="border-gold/40"><Link to="/admin/ai-training">🧠 AI обучение</Link></Button>
          <Button asChild variant="outline" size="sm" className="border-gold/40"><Link to="/admin/legal-kb">📖 Нормативна база</Link></Button>
          <Button asChild variant="outline" size="sm" className="border-gold/40"><Link to="/admin/feedback">💬 Обратна връзка</Link></Button>
          <BlankCacheWarmer />
        </div>

        <div className="flex gap-2 mb-4">
          <div className="relative flex-1 max-w-md">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input placeholder="Търсене по имейл или име..." value={search} onChange={(e) => setSearch(e.target.value)} onKeyDown={(e) => e.key === "Enter" && load(search)} className="pl-9" />
          </div>
          <Button onClick={() => load(search)} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Търси"}</Button>
        </div>

        <div className="border rounded-lg overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Потребител</TableHead>
                <TableHead>План</TableHead>
                <TableHead>Pro до</TableHead>
                <TableHead className="text-center">Договори</TableHead>
                <TableHead className="text-center">Анализи</TableHead>
                <TableHead className="text-center">Бонус</TableHead>
                <TableHead>Роля</TableHead>
                <TableHead className="text-right">Действия</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.user_id}>
                  <TableCell>
                    <div className="font-medium">{r.email}</div>
                    {r.display_name && <div className="text-xs text-muted-foreground">{r.display_name}</div>}
                  </TableCell>
                  <TableCell>
                    {r.plan === "pro" ? <Badge className="bg-gold text-gold-foreground"><Crown className="h-3 w-3 mr-1" />Pro</Badge> : <Badge variant="outline">Free</Badge>}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">{r.pro_until ? new Date(r.pro_until).toLocaleDateString("bg-BG") : "—"}</TableCell>
                  <TableCell className="text-center">{r.contracts_used}</TableCell>
                  <TableCell className="text-center">{r.analyses_used}</TableCell>
                  <TableCell className="text-center">{r.bonus_contracts}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {r.is_admin && <Badge variant="secondary">Admin</Badge>}
                      {r.is_moderator && <Badge variant="secondary">Mod</Badge>}
                      {!r.is_admin && !r.is_moderator && <span className="text-xs text-muted-foreground">user</span>}
                    </div>
                  </TableCell>
                  <TableCell className="text-right">
                    <div className="flex gap-1 justify-end flex-wrap">
                      <Button size="sm" variant="outline" onClick={() => setProDialog({ row: r, months: "1" })}>
                        <Crown className="h-3 w-3 mr-1" /> Pro
                      </Button>
                      {r.plan === "pro" && (
                        <Button size="sm" variant="ghost" onClick={() => revokePro(r)}><ShieldOff className="h-3 w-3" /></Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setBonusDialog({ row: r, count: "1" })}>
                        <Plus className="h-3 w-3" /> бонус
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleRole(r, "moderator", !r.is_moderator)}>
                        {r.is_moderator ? "− Mod" : "+ Mod"}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow><TableCell colSpan={8} className="text-center text-muted-foreground py-8">Няма резултати</TableCell></TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        <AdminNotificationsPanel />
        <AdminPartnersPanel />
        <AdminBlanksPanel />
        <AdminUserArticlesPanel />
        <AdminGscPanel />
      </div>

      <Dialog open={!!proDialog} onOpenChange={(o) => !o && setProDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Даване на Pro абонамент</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{proDialog?.row.email}</p>
            <Select value={proDialog?.months} onValueChange={(v) => proDialog && setProDialog({ ...proDialog, months: v })}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="1">1 месец</SelectItem>
                <SelectItem value="3">3 месеца</SelectItem>
                <SelectItem value="6">6 месеца</SelectItem>
                <SelectItem value="12">12 месеца</SelectItem>
                <SelectItem value="24">24 месеца</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setProDialog(null)}>Отказ</Button>
            <Button onClick={grantPro} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin mr-1" />}Дай Pro</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!bonusDialog} onOpenChange={(o) => !o && setBonusDialog(null)}>
        <DialogContent>
          <DialogHeader><DialogTitle>Добави бонус договори</DialogTitle></DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">{bonusDialog?.row.email}</p>
            <Input type="number" min={1} value={bonusDialog?.count ?? ""} onChange={(e) => bonusDialog && setBonusDialog({ ...bonusDialog, count: e.target.value })} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBonusDialog(null)}>Отказ</Button>
            <Button onClick={addBonus}>Добави</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </AdminMFAGuard>
  );
}
