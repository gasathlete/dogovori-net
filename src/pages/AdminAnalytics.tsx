import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, BarChart3, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { RangePicker, rangeToBounds, type AnalyticsRange } from "@/components/admin/analytics/RangePicker";
import { KpiCards, type Kpis } from "@/components/admin/analytics/KpiCards";
import { TrafficChart, type TimeseriesPoint } from "@/components/admin/analytics/TrafficChart";
import { TopList, type TopRow } from "@/components/admin/analytics/TopList";
import { AppKpiPanel, type AppKpis } from "@/components/admin/analytics/AppKpiPanel";

export default function AdminAnalytics() {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [range, setRange] = useState<AnalyticsRange>("7d");
  const [busy, setBusy] = useState(false);
  const [kpis, setKpis] = useState<Kpis | null>(null);
  const [series, setSeries] = useState<TimeseriesPoint[]>([]);
  const [top, setTop] = useState<Record<string, TopRow[]>>({});
  const [app, setApp] = useState<AppKpis | null>(null);

  const bounds = useMemo(() => rangeToBounds(range), [range]);

  useEffect(() => {
    if (loading) return;
    if (!user) { setAllowed(false); return; }
    supabase.rpc("is_staff", { _user_id: user.id }).then(({ data }) => setAllowed(Boolean(data)));
  }, [user, loading]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    (async () => {
      setBusy(true);
      try {
        const dims = ["path", "referrer_host", "country", "device", "browser"] as const;
        const [k, ts, app, ...tops] = await Promise.all([
          supabase.rpc("analytics_kpis", { _from: bounds.from, _to: bounds.to }),
          supabase.rpc("analytics_timeseries", { _from: bounds.from, _to: bounds.to, _bucket: bounds.bucket }),
          supabase.rpc("analytics_app_kpis", { _from: bounds.from, _to: bounds.to }),
          ...dims.map((d) => supabase.rpc("analytics_top", { _from: bounds.from, _to: bounds.to, _dim: d, _limit: 10 })),
        ]);
        if (cancelled) return;
        if (k.error) throw k.error;
        const row = (k.data as any[])?.[0];
        setKpis(row ? { visitors: Number(row.visitors), pageviews: Number(row.pageviews), bounce_rate: Number(row.bounce_rate), avg_duration_ms: Number(row.avg_duration_ms) } : null);
        setSeries(((ts.data as any[]) ?? []).map((p) => ({ bucket: p.bucket, visitors: Number(p.visitors), pageviews: Number(p.pageviews) })));
        const a = (app.data as any[])?.[0];
        setApp(a ? { signups: Number(a.signups), ops: Number(a.ops), paid_conversions: Number(a.paid_conversions), conversion_rate: Number(a.conversion_rate) } : null);
        const map: Record<string, TopRow[]> = {};
        dims.forEach((d, i) => {
          const r = tops[i];
          map[d] = ((r.data as any[]) ?? []).map((x) => ({ label: x.label, visitors: Number(x.visitors), pageviews: Number(x.pageviews) }));
        });
        setTop(map);
      } catch (e: any) {
        toast.error(e?.message ?? "Failed to load analytics");
      } finally {
        if (!cancelled) setBusy(false);
      }
    })();
    return () => { cancelled = true; };
  }, [allowed, bounds.from, bounds.to, bounds.bucket]);

  if (loading || allowed === null) {
    return <div className="flex min-h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  }
  if (!allowed) {
    return (
      <div className="min-h-dvh"><Header />
        <div className="container py-20 text-center">
          <h1 className="text-2xl font-bold mb-2">Access denied</h1>
          <Button asChild variant="outline"><Link to="/">Home</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background">
      <Header />
      <div className="container py-8 space-y-6">
        <div className="flex items-center gap-3 flex-wrap">
          <Button asChild variant="ghost" size="sm"><Link to="/admin"><ArrowLeft className="h-4 w-4 mr-1" /> Admin</Link></Button>
          <h1 className="text-3xl font-bold flex items-center gap-2"><BarChart3 className="h-7 w-7 text-gold" /> Analytics</h1>
          <div className="ml-auto"><RangePicker value={range} onChange={setRange} /></div>
        </div>

        <KpiCards data={kpis} loading={busy} />
        <TrafficChart data={series} bucket={bounds.bucket} />
        <div className="grid lg:grid-cols-2 gap-6">
          <TopList data={top} />
          <AppKpiPanel data={app} />
        </div>
        <p className="text-xs text-muted-foreground">
          First-party analytics. No raw IPs stored — only a daily-rotated visitor hash. Respects analytics cookie consent.
        </p>
      </div>
    </div>
  );
}
