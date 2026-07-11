import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "@/icons";
import type { Settings, CostRow } from "./_shared";

export default function SettingsTab() {
  const [s, setS] = useState<Settings | null>(null);
  const [busy, setBusy] = useState(false);
  const [costs, setCosts] = useState<CostRow[]>([]);
  const [range, setRange] = useState<"24h" | "7d" | "30d">("7d");
  const [activeUsers, setActiveUsers] = useState<number>(0);

  const loadSettings = async () => {
    const { data } = await (supabase.from("ai_simulation_settings" as any) as any)
      .select("*").eq("id", true).maybeSingle();
    if (data) setS(data as Settings);
  };

  const loadCosts = async () => {
    const since = new Date();
    if (range === "24h") since.setHours(since.getHours() - 24);
    else if (range === "7d") since.setDate(since.getDate() - 7);
    else since.setDate(since.getDate() - 30);
    const { data } = await supabase
      .from("ai_usage")
      .select("model, tokens_in, tokens_out, cost_eur, user_id")
      .gte("created_at", since.toISOString());
    const agg = new Map<string, CostRow>();
    const users = new Set<string>();
    for (const r of (data ?? []) as any[]) {
      const m = r.model || "(unknown)";
      const cur = agg.get(m) || { model: m, calls: 0, tokens_in: 0, tokens_out: 0, cost_eur: 0 };
      cur.calls += 1;
      cur.tokens_in += r.tokens_in || 0;
      cur.tokens_out += r.tokens_out || 0;
      cur.cost_eur += Number(r.cost_eur || 0);
      agg.set(m, cur);
      if (r.user_id) users.add(r.user_id);
    }
    setCosts(Array.from(agg.values()).sort((a, b) => b.cost_eur - a.cost_eur));
    setActiveUsers(users.size);
  };

  useEffect(() => { loadSettings(); }, []);
  useEffect(() => { loadCosts(); }, [range]);

  const save = async () => {
    if (!s) return;
    setBusy(true);
    try {
      const { data: { user: u } } = await supabase.auth.getUser();
      const { error } = await (supabase.from("ai_simulation_settings" as any) as any).update({
        rubric_min_uplift_pct: s.rubric_min_uplift_pct,
        max_cost_multiplier: s.max_cost_multiplier,
        router_long_turns_threshold: s.router_long_turns_threshold,
        router_enabled: s.router_enabled,
        model_prices: s.model_prices,
        updated_at: new Date().toISOString(),
        updated_by: u?.id ?? null,
      }).eq("id", true);
      if (error) throw error;
      toast.success("Настройките са записани");
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  const totalCost = costs.reduce((a, b) => a + b.cost_eur, 0);
  const projected30d = range === "24h" ? totalCost * 30 : range === "7d" ? totalCost * (30 / 7) : totalCost;

  if (!s) return <div className="mt-4 text-sm text-muted-foreground"><Loader2 className="inline h-3 w-3 animate-spin" /> Зареждане...</div>;

  const modelKeys = Object.keys(s.model_prices ?? {}).sort();

  return (
    <div className="mt-4 space-y-4">
      <Card className="p-4 space-y-3">
        <h3 className="font-semibold text-sm">🎯 Rubric праг за оправдан upgrade</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label className="text-xs">Мин. подобрение (%)</Label>
            <Input type="number" step="0.5" value={s.rubric_min_uplift_pct} onChange={(e) => setS({ ...s, rubric_min_uplift_pct: Number(e.target.value) })} />
            <p className="text-[10px] text-muted-foreground mt-1">При по-силен (по-скъп) модел искаме поне X% по-висока оценка.</p>
          </div>
          <div>
            <Label className="text-xs">Макс. cost multiplier</Label>
            <Input type="number" step="0.1" value={s.max_cost_multiplier} onChange={(e) => setS({ ...s, max_cost_multiplier: Number(e.target.value) })} />
            <p className="text-[10px] text-muted-foreground mt-1">Upgrade оправдан само ако цена/повикване ≤ X× baseline.</p>
          </div>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="font-semibold text-sm">⚡ Авто-routing (cost saver)</h3>
        <div className="flex items-center gap-2">
          <Switch checked={s.router_enabled} onCheckedChange={(v) => setS({ ...s, router_enabled: v })} />
          <Label className="text-xs">Включи интелигентен routing</Label>
        </div>
        <div>
          <Label className="text-xs">Праг за дълъг диалог (брой потребителски съобщения)</Label>
          <Input type="number" min={1} value={s.router_long_turns_threshold} onChange={(e) => setS({ ...s, router_long_turns_threshold: Number(e.target.value) })} className="max-w-32" />
          <p className="text-[10px] text-muted-foreground mt-1">
            Правила: <strong>flash по подразбиране</strong> → ескалация към <strong>pro</strong>, когато risk_level=high <em>или</em> диалогът надхвърля прага. Entrepreneur план остава винаги pro.
          </p>
        </div>
      </Card>

      <Card className="p-4 space-y-3">
        <h3 className="font-semibold text-sm">💶 Ценоразпис (EUR / 1k токена)</h3>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b text-muted-foreground"><th className="text-left p-1">Model</th><th className="text-right p-1">Input</th><th className="text-right p-1">Output</th></tr></thead>
            <tbody>
              {modelKeys.map((m) => (
                <tr key={m} className="border-b">
                  <td className="p-1 font-mono text-[10px]">{m}</td>
                  <td className="p-1 text-right">
                    <Input type="number" step="0.000001" value={s.model_prices[m].in} onChange={(e) => setS({ ...s, model_prices: { ...s.model_prices, [m]: { ...s.model_prices[m], in: Number(e.target.value) } } })} className="h-7 w-28 text-right text-[11px]" />
                  </td>
                  <td className="p-1 text-right">
                    <Input type="number" step="0.000001" value={s.model_prices[m].out} onChange={(e) => setS({ ...s, model_prices: { ...s.model_prices, [m]: { ...s.model_prices[m], out: Number(e.target.value) } } })} className="h-7 w-28 text-right text-[11px]" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="flex gap-2">
        <Button onClick={save} disabled={busy} className="bg-gold text-gold-foreground hover:bg-gold/90">
          {busy ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null} Запази настройки
        </Button>
      </div>

      <Card className="p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-semibold text-sm">📊 Реално потребление</h3>
          <Select value={range} onValueChange={(v) => setRange(v as any)}>
            <SelectTrigger className="w-32 h-8"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="24h">24 часа</SelectItem>
              <SelectItem value="7d">7 дни</SelectItem>
              <SelectItem value="30d">30 дни</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="rounded border p-2">
            <div className="text-[10px] text-muted-foreground">Период</div>
            <div className="text-sm font-semibold">{totalCost.toFixed(4)} €</div>
          </div>
          <div className="rounded border p-2">
            <div className="text-[10px] text-muted-foreground">Прогноза 30 дни</div>
            <div className="text-sm font-semibold">{projected30d.toFixed(2)} €</div>
          </div>
          <div className="rounded border p-2">
            <div className="text-[10px] text-muted-foreground">Активни потребители</div>
            <div className="text-sm font-semibold">{activeUsers}</div>
          </div>
          <div className="rounded border p-2">
            <div className="text-[10px] text-muted-foreground">Avg cost/user</div>
            <div className="text-sm font-semibold">{activeUsers > 0 ? (totalCost / activeUsers).toFixed(4) : "—"} €</div>
          </div>
        </div>
        <div className="overflow-auto">
          <table className="w-full text-xs">
            <thead><tr className="border-b text-muted-foreground"><th className="text-left p-1">Model</th><th className="text-right p-1">Calls</th><th className="text-right p-1">Tokens in</th><th className="text-right p-1">Tokens out</th><th className="text-right p-1">Cost €</th><th className="text-right p-1">% от total</th></tr></thead>
            <tbody>
              {costs.map((r) => (
                <tr key={r.model} className="border-b">
                  <td className="p-1 font-mono text-[10px]">{r.model}</td>
                  <td className="p-1 text-right">{r.calls}</td>
                  <td className="p-1 text-right">{r.tokens_in.toLocaleString()}</td>
                  <td className="p-1 text-right">{r.tokens_out.toLocaleString()}</td>
                  <td className="p-1 text-right">{r.cost_eur.toFixed(4)}</td>
                  <td className="p-1 text-right">{totalCost > 0 ? ((r.cost_eur / totalCost) * 100).toFixed(1) : 0}%</td>
                </tr>
              ))}
              {costs.length === 0 && <tr><td colSpan={6} className="p-3 text-center text-muted-foreground">Няма данни за периода. Cost се записва при ново assistant-chat повикване след тази миграция.</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
