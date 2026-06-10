import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import {
  ArrowLeft, Loader2, ShieldCheck, AlertTriangle, Eye, Activity,
  FileWarning, Cpu, UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { RangePicker, rangeToBounds, type AnalyticsRange } from "@/components/admin/analytics/RangePicker";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid, Legend,
} from "recharts";

interface PrivacyKpis {
  total_ai_calls: number;
  blocked_calls: number;
  errored_calls: number;
  pii_calls: number;
  special_category_calls: number;
  redacted_calls: number;
  fallback_used: number;
  unique_users: number;
  total_tokens_in: number;
  total_tokens_out: number;
  illegal_attempts: number;
}

interface BreakdownRow { label: string; count: number; }
interface SeriesPoint { bucket: string; total: number; pii: number; special: number; blocked: number; }

const KPI_DEFS: Array<{
  key: keyof PrivacyKpis;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hint?: (v: number, k: PrivacyKpis) => string;
  tone?: "default" | "warning" | "success";
}> = [
  { key: "total_ai_calls", label: "AI повиквания", icon: Activity },
  { key: "unique_users", label: "Уникални потребители", icon: UserCheck },
  {
    key: "pii_calls", label: "Със лични данни", icon: Eye, tone: "warning",
    hint: (v, k) => k.total_ai_calls ? `${Math.round((v / k.total_ai_calls) * 100)}%` : "—",
  },
  {
    key: "special_category_calls", label: "Специална категория", icon: AlertTriangle, tone: "warning",
    hint: (v, k) => k.total_ai_calls ? `${Math.round((v / k.total_ai_calls) * 100)}%` : "—",
  },
  {
    key: "redacted_calls", label: "Редактирани", icon: ShieldCheck, tone: "success",
    hint: (v, k) => k.pii_calls ? `${Math.round((v / k.pii_calls) * 100)}% от PII` : "—",
  },
  { key: "blocked_calls", label: "Блокирани", icon: FileWarning, tone: "warning" },
  { key: "errored_calls", label: "Грешки", icon: AlertTriangle, tone: "warning" },
  { key: "fallback_used", label: "Fallback модел", icon: Cpu },
  { key: "illegal_attempts", label: "Незаконно съдържание", icon: FileWarning, tone: "warning" },
];

function fmt(n: number | null | undefined): string {
  if (n == null) return "—";
  return new Intl.NumberFormat("bg-BG").format(n);
}

function BreakdownCard({ title, rows, busy }: { title: string; rows: BreakdownRow[]; busy: boolean }) {
  const total = rows.reduce((s, r) => s + r.count, 0);
  return (
    <Card>
      <CardHeader className="pb-3"><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent>
        {busy ? (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">Няма данни.</p>
        ) : (
          <div className="space-y-2">
            {rows.map((r) => {
              const pct = total ? Math.round((r.count / total) * 100) : 0;
              return (
                <div key={r.label}>
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium truncate">{r.label}</span>
                    <span className="text-muted-foreground tabular-nums">{fmt(r.count)} <span className="text-xs">({pct}%)</span></span>
                  </div>
                  <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                    <div className="h-full bg-gold" style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function AdminPrivacy() {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [range, setRange] = useState<AnalyticsRange>("7d");
  const [busy, setBusy] = useState(false);
  const [kpis, setKpis] = useState<PrivacyKpis | null>(null);
  const [series, setSeries] = useState<SeriesPoint[]>([]);
  const [breakdown, setBreakdown] = useState<Record<string, BreakdownRow[]>>({});

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
        const dims = ["risk_level", "operation", "model", "status", "illegal_category"] as const;
        const [k, ts, ...bs] = await Promise.all([
          supabase.rpc("admin_privacy_kpis", { _from: bounds.from, _to: bounds.to }),
          supabase.rpc("admin_privacy_timeseries", { _from: bounds.from, _to: bounds.to, _bucket: bounds.bucket }),
          ...dims.map((d) => supabase.rpc("admin_privacy_breakdown", { _from: bounds.from, _to: bounds.to, _dim: d })),
        ]);
        if (cancelled) return;
        if (k.error) throw k.error;
        const row = (k.data as any[])?.[0];
        setKpis(row ? {
          total_ai_calls: Number(row.total_ai_calls),
          blocked_calls: Number(row.blocked_calls),
          errored_calls: Number(row.errored_calls),
          pii_calls: Number(row.pii_calls),
          special_category_calls: Number(row.special_category_calls),
          redacted_calls: Number(row.redacted_calls),
          fallback_used: Number(row.fallback_used),
          unique_users: Number(row.unique_users),
          total_tokens_in: Number(row.total_tokens_in),
          total_tokens_out: Number(row.total_tokens_out),
          illegal_attempts: Number(row.illegal_attempts),
        } : null);
        setSeries(((ts.data as any[]) ?? []).map((p) => ({
          bucket: new Date(p.bucket).toLocaleDateString("bg-BG", { day: "2-digit", month: "2-digit" }),
          total: Number(p.total),
          pii: Number(p.pii),
          special: Number(p.special),
          blocked: Number(p.blocked),
        })));
        const map: Record<string, BreakdownRow[]> = {};
        dims.forEach((d, i) => {
          const r = bs[i];
          map[d] = ((r.data as any[]) ?? []).map((x) => ({ label: x.label, count: Number(x.count) }));
        });
        setBreakdown(map);
      } catch (e: any) {
        toast.error(e?.message ?? "Грешка при зареждане");
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
          <h1 className="text-2xl font-bold mb-2">Достъп отказан</h1>
          <Button asChild variant="outline"><Link to="/">Начало</Link></Button>
        </div>
      </div>
    );
  }

  const piiRate = kpis && kpis.total_ai_calls ? Math.round((kpis.pii_calls / kpis.total_ai_calls) * 100) : 0;
  const redactRate = kpis && kpis.pii_calls ? Math.round((kpis.redacted_calls / kpis.pii_calls) * 100) : 0;

  return (
    <div className="min-h-dvh bg-background">
      <Header />
      <div className="container py-8 max-w-7xl">
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          <Button asChild variant="ghost" size="sm">
            <Link to="/admin"><ArrowLeft className="h-4 w-4 mr-1" /> Админ</Link>
          </Button>
          <h1 className="text-3xl font-bold flex items-center gap-2">
            <ShieldCheck className="h-7 w-7 text-gold" /> Privacy & AI Compliance
          </h1>
          <Button asChild variant="outline" size="sm">
            <Link to="/admin/privacy/illegal">🚫 Illegal content</Link>
          </Button>
          <div className="ml-auto"><RangePicker value={range} onChange={setRange} /></div>
        </div>

        <p className="text-sm text-muted-foreground mb-6 max-w-3xl">
          Агрегирани метрики за обработка на лични данни през AI слоя. Не се показва съдържание на документи — само бройки,
          разпределения и проценти. За GDPR Чл. 30 и AI Act Чл. 12 (Record-keeping).
        </p>

        {/* KPI grid */}
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
          {KPI_DEFS.map(({ key, label, icon: Icon, tone, hint }) => {
            const v = kpis?.[key] ?? 0;
            const toneClass =
              tone === "warning" ? "text-amber-600 dark:text-amber-400" :
              tone === "success" ? "text-emerald-600 dark:text-emerald-400" :
              "text-foreground";
            return (
              <Card key={key as string}>
                <CardContent className="pt-4 pb-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs text-muted-foreground">{label}</span>
                    <Icon className={`h-4 w-4 ${toneClass}`} />
                  </div>
                  <div className={`text-2xl font-bold tabular-nums ${toneClass}`}>
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : fmt(v)}
                  </div>
                  {hint && kpis ? <div className="text-xs text-muted-foreground mt-0.5">{hint(v, kpis)}</div> : null}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Compliance health badges */}
        <Card className="mb-6">
          <CardHeader className="pb-3"><CardTitle className="text-base">Здраве на компоненти</CardTitle></CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <Badge variant={redactRate >= 95 ? "default" : "destructive"}>
              Редакция PII: {redactRate}%
            </Badge>
            <Badge variant={piiRate < 60 ? "default" : "secondary"}>
              PII в трафика: {piiRate}%
            </Badge>
            <Badge variant={kpis && kpis.special_category_calls === 0 ? "default" : "destructive"}>
              Спец. категория: {fmt(kpis?.special_category_calls ?? 0)}
            </Badge>
            <Badge variant={kpis && kpis.errored_calls < kpis.total_ai_calls * 0.05 ? "default" : "destructive"}>
              Грешки: {fmt(kpis?.errored_calls ?? 0)}
            </Badge>
            <Badge variant="outline">
              Tokens in/out: {fmt(kpis?.total_tokens_in ?? 0)} / {fmt(kpis?.total_tokens_out ?? 0)}
            </Badge>
          </CardContent>
        </Card>

        {/* Timeseries */}
        <Card className="mb-6">
          <CardHeader className="pb-3"><CardTitle className="text-base">AI повиквания във времето</CardTitle></CardHeader>
          <CardContent>
            {busy ? (
              <div className="h-64 flex items-center justify-center"><Loader2 className="h-5 w-5 animate-spin" /></div>
            ) : series.length === 0 ? (
              <p className="text-sm text-muted-foreground">Няма данни.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={series}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="bucket" className="text-xs" />
                  <YAxis className="text-xs" />
                  <Tooltip />
                  <Legend />
                  <Area type="monotone" dataKey="total" name="Общо" stroke="hsl(var(--primary))" fill="hsl(var(--primary)/0.15)" />
                  <Area type="monotone" dataKey="pii" name="С PII" stroke="hsl(38 92% 50%)" fill="hsl(38 92% 50% / 0.15)" />
                  <Area type="monotone" dataKey="special" name="Спец. категория" stroke="hsl(0 72% 51%)" fill="hsl(0 72% 51% / 0.15)" />
                  <Area type="monotone" dataKey="blocked" name="Блокирани" stroke="hsl(220 9% 46%)" fill="hsl(220 9% 46% / 0.15)" />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Breakdowns */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          <BreakdownCard title="По ниво на риск" rows={breakdown.risk_level ?? []} busy={busy} />
          <BreakdownCard title="По операция" rows={breakdown.operation ?? []} busy={busy} />
          <BreakdownCard title="По модел" rows={breakdown.model ?? []} busy={busy} />
          <BreakdownCard title="По статус" rows={breakdown.status ?? []} busy={busy} />
          <BreakdownCard title="Ограничени обработки – категории" rows={breakdown.restricted_category ?? breakdown.illegal_category ?? []} busy={busy} />
        </div>

        <div className="mt-8 text-xs text-muted-foreground space-y-1">
          <p>• Период: {new Date(bounds.from).toLocaleString("bg-BG")} – {new Date(bounds.to).toLocaleString("bg-BG")}</p>
          <p>• Източници: <code>ai_audit_log</code> (само метаданни), <code>restricted_processing_events</code>.</p>
          <p>• Данните се пазят 12 месеца съгласно политиката за съхранение.</p>
        </div>
      </div>
    </div>
  );
}
