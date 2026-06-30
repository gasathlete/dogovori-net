import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Coins, Loader2, Download } from "lucide-react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  DEFAULT_MODEL_PRICES,
  DEFAULT_SCENARIOS,
  PLANS,
  type PlanKey,
  type ScenarioInput,
} from "@/lib/financials/assumptions";
import { computeScenario, fmtEur, fmtEur2 } from "@/lib/financials/scenarios";
import { toCsv, downloadCsv } from "@/lib/csv";

export default function AdminFinancials() {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [scenarios, setScenarios] = useState<ScenarioInput[]>(DEFAULT_SCENARIOS);
  const [prices, setPrices] = useState(DEFAULT_MODEL_PRICES);

  useEffect(() => {
    if (loading) return;
    if (!user) { setAllowed(false); return; }
    supabase.rpc("is_staff", { _user_id: user.id }).then(({ data }) => setAllowed(Boolean(data)));
  }, [user, loading]);

  const results = useMemo(() => scenarios.map((s) => computeScenario(s, prices)), [scenarios, prices]);

  const chartData = useMemo(() => results.map((r) => ({
    name: r.name,
    Приходи: Math.round(r.mrr_net),
    "AI разход": Math.round(r.ai_cost),
    "Stripe такси": Math.round(r.stripe_fees),
    Фиксирани: Math.round(r.fixed_costs),
    "Нето печалба": Math.round(r.net_profit),
  })), [results]);

  const updateScenario = (i: number, patch: Partial<ScenarioInput>) => {
    setScenarios((prev) => prev.map((s, idx) => (idx === i ? { ...s, ...patch } : s)));
  };

  const updateMix = (i: number, key: PlanKey, val: number) => {
    setScenarios((prev) => prev.map((s, idx) => (idx === i ? { ...s, mix: { ...s.mix, [key]: val } } : s)));
  };

  const exportCsv = () => {
    const rows = results.flatMap((r) => [
      { Сценарий: r.name, Метрика: "Активни юзъри", Стойност: scenarios[results.indexOf(r)].active_users },
      { Сценарий: r.name, Метрика: "MRR нето", Стойност: r.mrr_net.toFixed(2) },
      { Сценарий: r.name, Метрика: "ARR нето", Стойност: r.arr_net.toFixed(2) },
      { Сценарий: r.name, Метрика: "AI разход", Стойност: r.ai_cost.toFixed(2) },
      { Сценарий: r.name, Метрика: "Stripe такси", Стойност: r.stripe_fees.toFixed(2) },
      { Сценарий: r.name, Метрика: "Фиксирани разходи", Стойност: r.fixed_costs.toFixed(2) },
      { Сценарий: r.name, Метрика: "Нето печалба", Стойност: r.net_profit.toFixed(2) },
      { Сценарий: r.name, Метрика: "Gross margin %", Стойност: r.gross_margin_pct.toFixed(1) },
      { Сценарий: r.name, Метрика: "ARPU", Стойност: r.arpu.toFixed(2) },
    ]);
    downloadCsv("dogovaryai-scenarios.csv", toCsv(rows));
  };

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
      <div className="container py-8 space-y-8">
        <div className="flex items-center gap-3 flex-wrap">
          <Button asChild variant="ghost" size="sm"><Link to="/admin"><ArrowLeft className="h-4 w-4 mr-1" /> Admin</Link></Button>
          <h1 className="text-3xl font-bold flex items-center gap-2"><Coins className="h-7 w-7 text-emerald-500" /> Финансови сценарии</h1>
          <Button onClick={exportCsv} variant="outline" size="sm" className="ml-auto"><Download className="h-4 w-4 mr-1" /> CSV</Button>
        </div>

        {/* Scenario cards */}
        <div className="grid gap-6 lg:grid-cols-3">
          {results.map((r, i) => {
            const s = scenarios[i];
            return (
              <Card key={r.name} className="p-5 space-y-4 border-emerald-500/15">
                <div>
                  <h2 className="font-serif text-xl">{r.name}</h2>
                  <p className="text-xs text-muted-foreground">{s.active_users.toLocaleString("bg-BG")} активни потребители · utilization {Math.round(s.utilization * 100)}%</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-sm">
                  <Kpi label="MRR нето" value={fmtEur(r.mrr_net)} />
                  <Kpi label="ARR нето" value={fmtEur(r.arr_net)} />
                  <Kpi label="AI разход" value={fmtEur(r.ai_cost)} tone="muted" />
                  <Kpi label="Stripe" value={fmtEur(r.stripe_fees)} tone="muted" />
                  <Kpi label="Фиксирани" value={fmtEur(r.fixed_costs)} tone="muted" />
                  <Kpi label="Gross margin" value={`${r.gross_margin_pct.toFixed(0)}%`} />
                  <Kpi
                    label="Нето / месец"
                    value={fmtEur(r.net_profit)}
                    tone={r.net_profit >= 0 ? "good" : "bad"}
                    className="col-span-2 text-lg"
                  />
                  <Kpi label="ARPU" value={fmtEur2(r.arpu)} />
                  <Kpi label="Top-up бр." value={Math.round(r.topup_units).toString()} />
                </div>

                {/* Editable inputs */}
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground">Допускания ▾</summary>
                  <div className="mt-3 space-y-2">
                    <NumInput label="Активни юзъри" value={s.active_users} step={50}
                      onChange={(v) => updateScenario(i, { active_users: v })} />
                    <NumInput label="Utilization (0-1)" value={s.utilization} step={0.05} max={1}
                      onChange={(v) => updateScenario(i, { utilization: v })} />
                    <NumInput label="Top-up attach (0-1)" value={s.topup_attach} step={0.05} max={1}
                      onChange={(v) => updateScenario(i, { topup_attach: v })} />
                    <NumInput label="Фиксирани разходи €/мес" value={s.fixed_costs_eur} step={50}
                      onChange={(v) => updateScenario(i, { fixed_costs_eur: v })} />
                    <div className="pt-2 border-t border-border/50">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Mix (sum=1)</p>
                      {(Object.keys(PLANS) as PlanKey[]).map((k) => (
                        <NumInput key={k} label={PLANS[k].label} value={s.mix[k]} step={0.01} max={1}
                          onChange={(v) => updateMix(i, k, v)} />
                      ))}
                    </div>
                  </div>
                </details>

                {/* Per-plan breakdown */}
                <div className="text-xs">
                  <table className="w-full">
                    <thead className="text-muted-foreground">
                      <tr className="text-left"><th>План</th><th className="text-right">Юзъри</th><th className="text-right">Нето €</th><th className="text-right">AI €</th></tr>
                    </thead>
                    <tbody>
                      {r.rows.map((row) => (
                        <tr key={row.key} className="border-t border-border/40">
                          <td className="py-1">{row.label}</td>
                          <td className="text-right">{row.users}</td>
                          <td className="text-right">{fmtEur(row.net_revenue)}</td>
                          <td className="text-right text-muted-foreground">{fmtEur2(row.ai_cost)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Comparison chart */}
        <Card className="p-5">
          <h3 className="font-serif text-lg mb-4">Сравнение P&L</h3>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.2} />
                <XAxis dataKey="name" />
                <YAxis tickFormatter={(v) => `${v}€`} />
                <Tooltip formatter={(v: number) => fmtEur(v)} />
                <Legend />
                <Bar dataKey="Приходи" fill="#10b981" />
                <Bar dataKey="AI разход" fill="#f59e0b" />
                <Bar dataKey="Stripe такси" fill="#a78bfa" />
                <Bar dataKey="Фиксирани" fill="#94a3b8" />
                <Bar dataKey="Нето печалба" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Token pricing overrides */}
        <Card className="p-5">
          <h3 className="font-serif text-lg mb-3">Цени на AI модели (USD ≈ EUR / 1M токена)</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {Object.entries(prices).map(([k, p]) => (
              <div key={k} className="space-y-2">
                <p className="text-sm font-medium">{k}</p>
                <Label className="text-xs">Input / 1M</Label>
                <Input type="number" step={0.05} value={p.in_per_m}
                  onChange={(e) => setPrices({ ...prices, [k]: { ...p, in_per_m: Number(e.target.value) } })} />
                <Label className="text-xs">Output / 1M</Label>
                <Input type="number" step={0.05} value={p.out_per_m}
                  onChange={(e) => setPrices({ ...prices, [k]: { ...p, out_per_m: Number(e.target.value) } })} />
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Допускания: 1 op ≈ 4 600 input + 2 040 output токена (blended draft/analyze/template/assistant) + 0.2 OCR страници.
            VAT 20% inclusive, Stripe 2.9% + 0.30 €.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, tone = "default", className = "" }: { label: string; value: string; tone?: "default" | "good" | "bad" | "muted"; className?: string }) {
  const color = tone === "good" ? "text-emerald-500" : tone === "bad" ? "text-red-500" : tone === "muted" ? "text-muted-foreground" : "text-foreground";
  return (
    <div className={`rounded-md border border-border/40 bg-card/40 p-2 ${className}`}>
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</p>
      <p className={`font-mono font-semibold ${color}`}>{value}</p>
    </div>
  );
}

function NumInput({ label, value, onChange, step = 1, max }: { label: string; value: number; onChange: (v: number) => void; step?: number; max?: number }) {
  return (
    <label className="flex items-center justify-between gap-2">
      <span className="text-muted-foreground flex-1">{label}</span>
      <Input
        type="number"
        className="h-7 w-24 text-right"
        step={step}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
