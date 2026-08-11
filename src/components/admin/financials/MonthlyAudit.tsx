import { useEffect, useMemo, useState } from "react";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, RotateCcw, Download, TrendingUp, Target } from "@/icons";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";
import { fmtEur, fmtEur2, fmtPct } from "@/lib/financials/scenarios";
import {
  DEFAULT_AUDIT_ASSUMPTIONS, computeAuditMonth, monthLabel, projectToTarget,
  type AuditAssumptions, type AuditRow,
} from "@/lib/financials/audit";
import { toCsv, downloadCsv } from "@/lib/csv";

const KEY = "admin-financials-audit-v1";

function load(): AuditAssumptions {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...DEFAULT_AUDIT_ASSUMPTIONS, ...JSON.parse(raw) };
  } catch {}
  return DEFAULT_AUDIT_ASSUMPTIONS;
}

export function MonthlyAudit() {
  const [rows, setRows] = useState<AuditRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [months, setMonths] = useState(6);
  const [a, setA] = useState<AuditAssumptions>(() => load());
  const [simOn, setSimOn] = useState(false);

  useEffect(() => {
    let alive = true;
    setRows(null);
    supabase.rpc("admin_financial_audit", { _months: months }).then(({ data, error }) => {
      if (!alive) return;
      if (error) { setError(error.message); setRows([]); return; }
      setError(null);
      setRows((data ?? []) as unknown as AuditRow[]);
    });
    return () => { alive = false; };
  }, [months]);

  useEffect(() => {
    try { localStorage.setItem(KEY, JSON.stringify(a)); } catch {}
  }, [a]);

  const actual = useMemo(() => (rows ?? []).map((r) => computeAuditMonth(r, a, false)), [rows, a]);
  const simulated = useMemo(() => (rows ?? []).map((r) => computeAuditMonth(r, a, true)), [rows, a]);
  const view = simOn ? simulated : actual;
  const latest = view[view.length - 1];
  const target = latest ? projectToTarget(latest, a) : null;

  const chart = view.map((c) => ({
    name: monthLabel(c.row.month),
    Приход: Math.round(c.net_revenue * 100) / 100,
    "AI разход": Math.round(c.ai_cost * 100) / 100,
    Stripe: Math.round(c.stripe_fees * 100) / 100,
    Фиксирани: a.fixed_costs_eur + a.marketing_eur,
    Нето: Math.round(c.net_profit * 100) / 100,
  }));

  const opsChart = view.map((c) => ({
    name: monthLabel(c.row.month),
    Шаблони: c.row.ops_template,
    Договори: c.row.ops_contract,
    Анализи: c.row.ops_analysis,
    Корекции: c.row.ops_corrections,
    Регистрации: c.row.new_signups,
  }));

  const exportCsv = () => {
    downloadCsv(
      "dogovori-monthly-audit.csv",
      toCsv(
        view.map((c) => ({
          month: c.row.month,
          signups: c.row.new_signups,
          paid_units: Math.round(c.paid_units),
          ops: c.row.ops_total,
          ai_calls: c.row.ai_calls,
          net_revenue: c.net_revenue.toFixed(2),
          ai_cost: c.ai_cost.toFixed(2),
          stripe: c.stripe_fees.toFixed(2),
          net_profit: c.net_profit.toFixed(2),
          gross_margin: c.gross_margin_pct.toFixed(1),
        })),
        [
          { key: "month", label: "Месец" },
          { key: "signups", label: "Регистрации" },
          { key: "paid_units", label: "Платени единици" },
          { key: "ops", label: "Операции" },
          { key: "ai_calls", label: "AI заявки" },
          { key: "net_revenue", label: "Приход нето €" },
          { key: "ai_cost", label: "AI разход €" },
          { key: "stripe", label: "Stripe €" },
          { key: "net_profit", label: "Нето печалба €" },
          { key: "gross_margin", label: "Gross margin %" },
        ],
      ),
    );
  };

  if (rows === null) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 className="h-5 w-5 animate-spin text-gold" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-sm text-muted-foreground">
          Реални данни от базата: регистрации, платени абонати, изразходвани операции и логнат AI разход.
        </p>
        <div className="ml-auto flex items-center gap-2">
          {[3, 6, 12].map((m) => (
            <Button key={m} size="sm" variant={months === m ? "default" : "outline"} onClick={() => setMonths(m)}>
              {m} мес.
            </Button>
          ))}
          <Button size="sm" variant={simOn ? "default" : "outline"} onClick={() => setSimOn((v) => !v)}>
            <TrendingUp className="h-4 w-4 mr-1" /> Симулация
          </Button>
          <Button size="sm" variant="outline" onClick={exportCsv}><Download className="h-4 w-4 mr-1" /> CSV</Button>
        </div>
      </div>

      {error && (
        <Card className="p-4 border-destructive/40 text-sm text-destructive">{error}</Card>
      )}

      {/* KPI strip — latest month */}
      {latest && (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Kpi label="Приход нето (посл. месец)" value={fmtEur2(latest.net_revenue)} />
          <Kpi label="Разход (AI + Stripe + фикс.)"
            value={fmtEur2(latest.variable_cost + a.fixed_costs_eur + a.marketing_eur)} tone="muted" />
          <Kpi label="Нето резултат" value={fmtEur2(latest.net_profit)}
            tone={latest.net_profit >= 0 ? "good" : "bad"} />
          <Kpi label="Gross margin" value={fmtPct(latest.gross_margin_pct, 1)}
            tone={latest.gross_margin_pct >= 70 ? "good" : latest.gross_margin_pct >= 40 ? "default" : "bad"} />
          <Kpi label="Платени единици" value={Math.round(latest.paid_units).toString()} />
          <Kpi label="Операции / платен юзър" value={latest.ops_per_paid_user.toFixed(1)} />
          <Kpi label="Себестойност / операция" value={fmtEur2(latest.cost_per_op)} tone="muted" />
          <Kpi label="Break-even (платени)"
            value={isFinite(latest.breakeven_paid_units) ? `${latest.breakeven_paid_units}` : "n/a"} />
        </div>
      )}

      {/* Target panel */}
      {target && (
        <Card className="p-5 space-y-3 border-gold/30">
          <div className="flex items-center gap-2">
            <Target className="h-5 w-5 text-gold" />
            <h3 className="font-serif text-lg">Целеви брой платени потребители</h3>
            <Badge variant="outline" className="ml-auto">{target.gap} до целта</Badge>
          </div>
          <div className="flex flex-wrap items-end gap-4">
            <div className="w-48 space-y-1">
              <Label className="text-xs">Цел (платени единици)</Label>
              <Input type="number" value={a.target_paid_users}
                onChange={(e) => setA({ ...a, target_paid_users: Number(e.target.value) || 0 })} />
            </div>
            <div className="grid flex-1 grid-cols-2 gap-3 sm:grid-cols-4 text-sm">
              <Kpi label="Приход нето / мес." value={fmtEur2(target.net_revenue)} />
              <Kpi label="ARR нето" value={fmtEur(target.arr_net)} />
              <Kpi label="Нето печалба / мес." value={fmtEur2(target.net_profit)}
                tone={target.net_profit >= 0 ? "good" : "bad"} />
              <Kpi label="Нето маржин" value={fmtPct(target.net_margin_pct, 1)} />
            </div>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
            <div className="h-full bg-gold transition-all"
              style={{ width: `${Math.min(100, target.target > 0 ? (Math.round(latest!.paid_units) / target.target) * 100 : 0)}%` }} />
          </div>
        </Card>
      )}

      {/* Assumptions + simulation */}
      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5 space-y-4">
          <h3 className="font-serif text-lg">Разходни допускания</h3>
          <div className="grid grid-cols-2 gap-3">
            <NumField label="ARPU бруто €" value={a.arpu_gross_eur} onChange={(v) => setA({ ...a, arpu_gross_eur: v })} />
            <NumField label="Цена / място €" value={a.seat_gross_eur} onChange={(v) => setA({ ...a, seat_gross_eur: v })} />
            <NumField label="Фиксирани €/мес." value={a.fixed_costs_eur} onChange={(v) => setA({ ...a, fixed_costs_eur: v })} />
            <NumField label="Маркетинг €/мес." value={a.marketing_eur} onChange={(v) => setA({ ...a, marketing_eur: v })} />
            <NumField label="Мин. цена / операция €" step={0.001} value={a.fallback_cost_per_op_eur}
              onChange={(v) => setA({ ...a, fallback_cost_per_op_eur: v })} />
          </div>
          <Button variant="ghost" size="sm" onClick={() => setA(DEFAULT_AUDIT_ASSUMPTIONS)}>
            <RotateCcw className="h-4 w-4 mr-1" /> Reset
          </Button>
        </Card>

        <Card className={`p-5 space-y-4 ${simOn ? "border-emerald-500/40 bg-emerald-500/5" : ""}`}>
          <div className="flex items-center gap-2">
            <h3 className="font-serif text-lg">Симулация</h3>
            <Badge variant={simOn ? "default" : "outline"} className="ml-auto">
              {simOn ? "включена" : "изключена"}
            </Badge>
          </div>
          <SliderRow label="Платени потребители" suffix="x" value={a.sim_paid_multiplier} min={0.5} max={10} step={0.5}
            onChange={(v) => { setSimOn(true); setA({ ...a, sim_paid_multiplier: v }); }} />
          <SliderRow label="Цена" suffix="x" value={a.sim_price_multiplier} min={0.5} max={3} step={0.05}
            onChange={(v) => { setSimOn(true); setA({ ...a, sim_price_multiplier: v }); }} />
          <SliderRow label="Потребление (ops / юзър)" suffix="x" value={a.sim_usage_multiplier} min={0.2} max={4} step={0.1}
            onChange={(v) => { setSimOn(true); setA({ ...a, sim_usage_multiplier: v }); }} />
          {latest && simOn && actual[actual.length - 1] && (
            <p className="text-xs text-muted-foreground">
              Спрямо реалния месец: нето {fmtEur2(actual[actual.length - 1].net_profit)} →{" "}
              <strong className={latest.net_profit >= 0 ? "text-emerald-500" : "text-destructive"}>
                {fmtEur2(latest.net_profit)}
              </strong>
            </p>
          )}
        </Card>
      </div>

      {/* Revenue vs cost chart */}
      <Card className="p-5">
        <h3 className="font-serif text-lg mb-4">Приход / разход по месеци {simOn && "(симулация)"}</h3>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chart}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend />
              <Bar dataKey="Приход" fill="hsl(var(--gold))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="AI разход" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Stripe" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Фиксирани" fill="hsl(var(--secondary))" radius={[4, 4, 0, 0]} />
              <Line type="monotone" dataKey="Нето" stroke="hsl(var(--primary))" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Ops usage chart */}
      <Card className="p-5">
        <h3 className="font-serif text-lg mb-4">Статистика на използваните операции</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={opsChart}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
              <Tooltip contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8 }} />
              <Legend />
              <Area type="monotone" dataKey="Шаблони" stackId="1" stroke="hsl(var(--gold))" fill="hsl(var(--gold) / 0.35)" />
              <Area type="monotone" dataKey="Договори" stackId="1" stroke="hsl(var(--primary))" fill="hsl(var(--primary) / 0.3)" />
              <Area type="monotone" dataKey="Анализи" stackId="1" stroke="hsl(var(--accent))" fill="hsl(var(--accent) / 0.3)" />
              <Area type="monotone" dataKey="Корекции" stackId="1" stroke="hsl(var(--muted-foreground))" fill="hsl(var(--muted-foreground) / 0.25)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </Card>

      {/* Monthly audit table */}
      <Card className="p-0 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
            <tr>
              {["Месец", "Регистрации", "Платени", "Операции", "AI заявки", "Приход нето", "AI разход", "Stripe", "Нето", "Margin"].map((h) => (
                <th key={h} className="px-3 py-2 text-left font-medium whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.map((c) => (
              <tr key={c.row.month} className="border-t border-border">
                <td className="px-3 py-2 whitespace-nowrap">{monthLabel(c.row.month)}</td>
                <td className="px-3 py-2">{c.row.new_signups}</td>
                <td className="px-3 py-2">{Math.round(c.paid_units)}</td>
                <td className="px-3 py-2">{Math.round(c.row.ops_total)}</td>
                <td className="px-3 py-2">{c.row.ai_calls}</td>
                <td className="px-3 py-2">{fmtEur2(c.net_revenue)}</td>
                <td className="px-3 py-2 text-muted-foreground">{fmtEur2(c.ai_cost)}</td>
                <td className="px-3 py-2 text-muted-foreground">{fmtEur2(c.stripe_fees)}</td>
                <td className={`px-3 py-2 font-medium ${c.net_profit >= 0 ? "text-emerald-500" : "text-destructive"}`}>
                  {fmtEur2(c.net_profit)}
                </td>
                <td className="px-3 py-2">{fmtPct(c.gross_margin_pct, 0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}

function Kpi({ label, value, tone = "default" }: { label: string; value: string; tone?: "default" | "muted" | "good" | "bad" }) {
  const cls =
    tone === "good" ? "text-emerald-500" : tone === "bad" ? "text-destructive" : tone === "muted" ? "text-muted-foreground" : "";
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={`font-semibold ${cls}`}>{value}</div>
    </div>
  );
}

function NumField({ label, value, onChange, step = 0.1 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <Input type="number" step={step} value={value} onChange={(e) => onChange(Number(e.target.value) || 0)} />
    </div>
  );
}

function SliderRow({ label, value, onChange, min, max, step, suffix }: {
  label: string; value: number; onChange: (v: number) => void; min: number; max: number; step: number; suffix?: string;
}) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <Label>{label}</Label>
        <span className="font-mono text-xs">{value}{suffix}</span>
      </div>
      <Slider value={[value]} min={min} max={max} step={step} onValueChange={(v) => onChange(v[0])} />
    </div>
  );
}
