import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { AdminMFAGuard } from "@/components/admin/AdminMFAGuard";
import { ArrowLeft, Loader2, Activity, RefreshCw } from "lucide-react";
import { toast } from "sonner";

interface Metric {
  id: string;
  date: string;
  operation: string;
  total_calls: number;
  blocked_count: number;
  redaction_count: number;
  fallback_count: number;
  special_category_blocks: number;
  user_complaints: number;
  notes: string | null;
}

export default function AdminAiPostMarket() {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<Metric[]>([]);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (loading || !user) { setAllowed(false); return; }
    supabase.rpc("is_staff", { _user_id: user.id }).then(({ data }) => setAllowed(Boolean(data)));
  }, [user, loading]);

  const load = async () => {
    setBusy(true);
    const { data, error } = await supabase
      .from("ai_post_market_metrics")
      .select("*")
      .order("date", { ascending: false })
      .limit(180);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    setRows((data ?? []) as Metric[]);
  };
  useEffect(() => { if (allowed) load(); }, [allowed]);

  const rollup = async () => {
    setBusy(true);
    const { error } = await supabase.functions.invoke("ai-post-market-rollup", { body: {} });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Rollup готов");
    load();
  };

  const summary = useMemo(() => {
    const last30 = rows.filter((r) => new Date(r.date) > new Date(Date.now() - 30 * 86_400_000));
    const acc = { calls: 0, blocked: 0, redaction: 0, fallback: 0, special: 0, complaints: 0 };
    last30.forEach((r) => {
      acc.calls += r.total_calls;
      acc.blocked += r.blocked_count;
      acc.redaction += r.redaction_count;
      acc.fallback += r.fallback_count;
      acc.special += r.special_category_blocks;
      acc.complaints += r.user_complaints;
    });
    return acc;
  }, [rows]);

  if (loading || allowed === null) return <div className="flex h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (!allowed) return <div className="p-8">Forbidden</div>;

  return (
    <AdminMFAGuard>
      <div className="min-h-dvh bg-background">
        <Header />
        <div className="container py-8">
          <div className="mb-6 flex items-center gap-3 flex-wrap">
            <Button asChild variant="ghost" size="sm"><Link to="/admin"><ArrowLeft className="mr-1 h-4 w-4" /> Admin</Link></Button>
            <h1 className="text-3xl font-bold flex items-center gap-2"><Activity className="h-7 w-7 text-gold" /> AI Post-Market Monitoring</h1>
            <Button size="sm" variant="outline" className="ml-auto" onClick={rollup} disabled={busy}><RefreshCw className="mr-1 h-4 w-4" /> Run rollup</Button>
          </div>

          <p className="mb-4 text-sm text-muted-foreground">
            Чл. 72 AI Act. Дневен агрегат от <code>ai_audit_log</code>. Резюме за последните 30 дни.
          </p>

          <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-6">
            <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Calls (30d)</div><div className="text-2xl font-semibold">{summary.calls}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Blocked</div><div className="text-2xl font-semibold">{summary.blocked}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Redaction</div><div className="text-2xl font-semibold">{summary.redaction}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Fallback</div><div className="text-2xl font-semibold">{summary.fallback}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Спец. категории</div><div className="text-2xl font-semibold">{summary.special}</div></CardContent></Card>
            <Card><CardContent className="p-3"><div className="text-xs text-muted-foreground">Оплаквания</div><div className="text-2xl font-semibold">{summary.complaints}</div></CardContent></Card>
          </div>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-muted/40 text-xs uppercase tracking-wider text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2 text-left">Дата</th>
                    <th className="px-3 py-2 text-left">Operation</th>
                    <th className="px-3 py-2 text-right">Calls</th>
                    <th className="px-3 py-2 text-right">Blocked</th>
                    <th className="px-3 py-2 text-right">Redaction</th>
                    <th className="px-3 py-2 text-right">Fallback</th>
                    <th className="px-3 py-2 text-right">Spec.cat</th>
                    <th className="px-3 py-2 text-right">Complaints</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t border-border/40">
                      <td className="px-3 py-2 whitespace-nowrap">{r.date}</td>
                      <td className="px-3 py-2"><Badge variant="outline">{r.operation}</Badge></td>
                      <td className="px-3 py-2 text-right">{r.total_calls}</td>
                      <td className="px-3 py-2 text-right">{r.blocked_count}</td>
                      <td className="px-3 py-2 text-right">{r.redaction_count}</td>
                      <td className="px-3 py-2 text-right">{r.fallback_count}</td>
                      <td className="px-3 py-2 text-right">{r.special_category_blocks}</td>
                      <td className="px-3 py-2 text-right">{r.user_complaints}</td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground text-sm">Все още няма данни. Натиснете „Run rollup".</td></tr>}
                </tbody>
              </table>
            </CardContent>
          </Card>
        </div>
      </div>
    </AdminMFAGuard>
  );
}
