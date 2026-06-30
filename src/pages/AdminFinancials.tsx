import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { Slider } from "@/components/ui/slider";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { ArrowLeft, Coins, Loader2, Download, RotateCcw, TrendingUp } from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import {
  DEFAULT_MODEL_PRICES, DEFAULT_SCENARIOS, PLANS,
  type PlanKey, type ScenarioInput,
} from "@/lib/financials/assumptions";
import { computeScenario, fmtEur, fmtEur2, fmtPct } from "@/lib/financials/scenarios";
import { toCsv, downloadCsv } from "@/lib/csv";

const STORAGE_KEY = "admin-financials-v2";

type State = { scenarios: ScenarioInput[]; prices: typeof DEFAULT_MODEL_PRICES };

function loadState(): State {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {}
  return { scenarios: DEFAULT_SCENARIOS, prices: DEFAULT_MODEL_PRICES };
}

export default function AdminFinancials() {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [state, setState] = useState<State>(() => loadState());
  const { scenarios, prices } = state;

  useEffect(() => {
    if (loading) return;
    if (!user) { setAllowed(false); return; }
    supabase.rpc("is_staff", { _user_id: user.id }).then(({ data }) => setAllowed(Boolean(data)));
  }, [user, loading]);

  useEffect(() => {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {}
  }, [state]);

  const results = useMemo(() => scenarios.map((s) => computeScenario(s, prices)), [scenarios, prices]);

  const chartData = useMemo(() => results.map((r) => ({
    name: r.name,
    "MRR нето": Math.round(r.mrr_net),
    "AI разход": Math.round(r.ai_cost),
    Stripe: Math.round(r.stripe_fees),
    Маркетинг: Math.round(r.marketing_spend),
    Фиксирани: Math.round(r.fixed_costs),
    "Нето печалба": Math.round(r.net_profit),
  })), [results]);

  const updateScenario = (i: number, patch: Partial<ScenarioInput>) => {
    setState((prev) => ({ ...prev, scenarios: prev.scenarios.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) }));
  };

  const updatePaidMix = (i: number, key: keyof ScenarioInput["paid_mix"], val: number) => {
    setState((prev) => ({
      ...prev,
      scenarios: prev.scenarios.map((s, idx) => (idx === i ? { ...s, paid_mix: { ...s.paid_mix, [key]: val } } : s)),
    }));
  };

  const reset = () => {
    if (confirm("Възстановяване на default стойностите?")) {
      setState({ scenarios: DEFAULT_SCENARIOS, prices: DEFAULT_MODEL_PRICES });
    }
  };

  const exportCsv = () => {
    const rows = results.flatMap((r) => [
      ["visitors", r.monthly_visitors],
      ["new signups", r.new_signups],
      ["new paid", r.new_paid],
      ["paid conversion %", r.effective_paid_conversion_pct.toFixed(2)],
      ["visitor→paid %", r.visitor_to_paid_pct.toFixed(2)],
      ["total paid users", r.total_paid_users],
      ["MRR net €", r.mrr_net.toFixed(2)],
      ["ARR net €", r.arr_net.toFixed(2)],
      ["AI cost €", r.ai_cost.toFixed(2)],
      ["Stripe fees €", r.stripe_fees.toFixed(2)],
      ["Marketing €", r.marketing_spend.toFixed(2)],
      ["Fixed €", r.fixed_costs.toFixed(2)],
      ["Net profit €", r.net_profit.toFixed(2)],
      ["Gross margin %", r.gross_margin_pct.toFixed(1)],
      ["ARPU paid €", r.arpu_paid.toFixed(2)],
      ["LTV paid €", r.ltv_paid.toFixed(2)],
      ["LTV:CAC", r.ltv_cac_ratio.toFixed(2)],
      ["Payback months", isFinite(r.payback_months) ? r.payback_months.toFixed(1) : "n/a"],
    ].map(([m, v]) => ({ scenario: r.name, metric: String(m), value: String(v) })));
    downloadCsv("dogovaryai-scenarios.csv", toCsv(rows, [
      { key: "scenario", label: "Сценарий" },
      { key: "metric", label: "Метрика" },
      { key: "value", label: "Стойност" },
    ]));
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
          <Button onClick={reset} variant="ghost" size="sm" className="ml-auto"><RotateCcw className="h-4 w-4 mr-1" /> Reset</Button>
          <Button onClick={exportCsv} variant="outline" size="sm"><Download className="h-4 w-4 mr-1" /> CSV</Button>
        </div>

        <p className="text-sm text-muted-foreground -mt-4">
          Основен лост: <strong className="text-emerald-500">conversion rate</strong>. Промените се запазват локално в браузъра.
        </p>

        {/* Scenario cards */}
        <div className="grid gap-6 xl:grid-cols-3">
          {results.map((r, i) => {
            const s = scenarios[i];
            return (
              <Card key={r.name} className="p-5 space-y-4 border-emerald-500/20">
                <div>
                  <h2 className="font-serif text-xl flex items-center gap-2">{r.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {r.monthly_visitors.toLocaleString("bg-BG")} посетители → {r.new_signups} signup → {r.new_paid} платени
                  </p>
                </div>

                {/* PRIMARY LEVERS — sliders */}
                <div className="space-y-4 rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
                  <SliderRow
                    label="Visitor → Signup"
                    value={s.visitor_to_signup_pct}
                    onChange={(v) => updateScenario(i, { visitor_to_signup_pct: v })}
                    min={0} max={30} step={0.5} suffix="%"
                  />
                  <SliderRow
                    label="Signup → Paid (CRO)"
                    value={s.signup_to_paid_pct}
                    onChange={(v) => updateScenario(i, { signup_to_paid_pct: v })}
                    min={0} max={30} step={0.5} suffix="%"
                    highlight
                  />
                  <SliderRow
                    label="Месечен churn (платени)"
                    value={s.monthly_paid_churn_pct}
                    onChange={(v) => updateScenario(i, { monthly_paid_churn_pct: v })}
                    min={0} max={30} step={0.5} suffix="%"
                  />
                  <SliderRow
                    label="Utilization (ops)"
                    value={s.utilization * 100}
                    onChange={(v) => updateScenario(i, { utilization: v / 100 })}
                    min={0} max={100} step={5} suffix="%"
                  />
                </div>

                {/* KPI grid */}
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <Kpi label="MRR нето" value={fmtEur(r.mrr_net)} />
                  <Kpi label="ARR нето" value={fmtEur(r.arr_net)} />
                  <Kpi label="Платени юзъри" value={r.total_paid_users.toString()} />
                  <Kpi label="Visitor→Paid" value={fmtPct(r.visitor_to_paid_pct, 2)} />
                  <Kpi label="AI разход" value={fmtEur(r.ai_cost)} tone="muted" />
                  <Kpi label="Stripe" value={fmtEur(r.stripe_fees)} tone="muted" />
                  <Kpi label="Маркетинг (CAC)" value={fmtEur(r.marketing_spend)} tone="muted" />
                  <Kpi label="Фиксирани" value={fmtEur(r.fixed_costs)} tone="muted" />
                  <Kpi
                    label="Нето / месец"
                    value={fmtEur(r.net_profit)}
                    tone={r.net_profit >= 0 ? "good" : "bad"}
                    className="col-span-2 text-lg"
                  />
                  <Kpi label="Gross margin" value={fmtPct(r.gross_margin_pct, 0)} />
                  <Kpi label="ARPU (платен)" value={fmtEur2(r.arpu_paid)} />
                  <Kpi label="LTV (платен)" value={fmtEur(r.ltv_paid)} />
                  <Kpi
                    label="LTV : CAC"
                    value={`${r.ltv_cac_ratio.toFixed(1)}x`}
                    tone={r.ltv_cac_ratio >= 3 ? "good" : r.ltv_cac_ratio >= 1 ? "default" : "bad"}
                  />
                  <Kpi
                    label="Payback"
                    value={isFinite(r.payback_months) ? `${r.payback_months.toFixed(1)} мес` : "∞"}
                  />
                  <Kpi label="Top-up бр." value={Math.round(r.topup_units).toString()} />
                </div>

                {/* Secondary inputs */}
                <details className="text-xs">
                  <summary className="cursor-pointer text-muted-foreground hover:text-foreground flex items-center gap-1">
                    <TrendingUp className="h-3 w-3" /> Допускания (брой, CAC, mix, разходи) ▾
                  </summary>
                  <div className="mt-3 space-y-2">
                    <NumInput label="Месечни посетители" value={s.monthly_visitors} step={500}
                      onChange={(v) => updateScenario(i, { monthly_visitors: v })} />
                    <NumInput label="Базови free юзъри" value={s.existing_free_users} step={50}
                      onChange={(v) => updateScenario(i, { existing_free_users: v })} />
                    <NumInput label="Базови платени юзъри" value={s.existing_paid_users} step={10}
                      onChange={(v) => updateScenario(i, { existing_paid_users: v })} />
                    <NumInput label="CAC €" value={s.cac_eur} step={1}
                      onChange={(v) => updateScenario(i, { cac_eur: v })} />
                    <NumInput label="Top-up attach (0-1)" value={s.topup_attach} step={0.01} max={1}
                      onChange={(v) => updateScenario(i, { topup_attach: v })} />
                    <NumInput label="Фиксирани €/мес" value={s.fixed_costs_eur} step={25}
                      onChange={(v) => updateScenario(i, { fixed_costs_eur: v })} />
                    <div className="pt-2 border-t border-border/50">
                      <p className="text-[10px] uppercase tracking-wider text-muted-foreground mb-1">Mix на платените (sum=1)</p>
                      <NumInput label="Професионалист" value={s.paid_mix.prof} step={0.01} max={1}
                        onChange={(v) => updatePaidMix(i, "prof", v)} />
                      <NumInput label="Предприемач" value={s.paid_mix.entrepreneur} step={0.01} max={1}
                        onChange={(v) => updatePaidMix(i, "entrepreneur", v)} />
                      <NumInput label="Екип" value={s.paid_mix.team} step={0.01} max={1}
                        onChange={(v) => updatePaidMix(i, "team", v)} />
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
                <Bar dataKey="MRR нето" fill="#10b981" />
                <Bar dataKey="AI разход" fill="#f59e0b" />
                <Bar dataKey="Stripe" fill="#a78bfa" />
                <Bar dataKey="Маркетинг" fill="#ec4899" />
                <Bar dataKey="Фиксирани" fill="#94a3b8" />
                <Bar dataKey="Нето печалба" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        {/* Token pricing overrides */}
        <Card className="p-5">
          <h3 className="font-serif text-lg mb-3">Цени на AI модели (€ / 1M токена)</h3>
          <div className="grid gap-3 sm:grid-cols-3">
            {Object.entries(prices).map(([k, p]) => (
              <div key={k} className="space-y-2">
                <p className="text-sm font-medium">{k}</p>
                <Label className="text-xs">Input / 1M</Label>
                <Input type="number" step={0.05} value={p.in_per_m}
                  onChange={(e) => setState({ ...state, prices: { ...prices, [k]: { ...p, in_per_m: Number(e.target.value) } } })} />
                <Label className="text-xs">Output / 1M</Label>
                <Input type="number" step={0.05} value={p.out_per_m}
                  onChange={(e) => setState({ ...state, prices: { ...prices, [k]: { ...p, out_per_m: Number(e.target.value) } } })} />
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-muted-foreground">
            Допускания: 1 op ≈ 4 600 input + 2 040 output токена (blended draft/analyze/template/assistant) + 0.2 OCR страници.
            VAT 20% inclusive, Stripe 2.9% + 0.30 €. LTV = (ARPU × gross margin) / churn. Payback = CAC / (ARPU × gross margin).
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
      <Input type="number" className="h-7 w-24 text-right" step={step} max={max} value={value}
        onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function SliderRow({ label, value, onChange, min, max, step, suffix, highlight }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step: number; suffix?: string; highlight?: boolean;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between mb-1">
        <span className={`text-xs ${highlight ? "font-semibold text-emerald-500" : "text-foreground"}`}>{label}</span>
        <span className="font-mono text-sm font-semibold">{value.toFixed(value % 1 === 0 ? 0 : 1)}{suffix}</span>
      </div>
      <Slider value={[value]} onValueChange={(v) => onChange(v[0])} min={min} max={max} step={step} />
    </div>
  );
}
