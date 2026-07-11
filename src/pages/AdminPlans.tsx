/**
 * /admin/plans — CMS for plans, features and comparison rows.
 * Saving any row triggers a DB function that rewrites the
 * "АКТУАЛНИ ПЛАНОВЕ И ЦЕНИ (auto)" section in every active AI prompt.
 */
import { useEffect, useState } from "react";
import { Loader2, Plus, Save, Trash2, ArrowLeft } from "@/icons";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import {
  usePlansAdmin,
  type PlanRow,
  type PlanFeatureRow,
  type PlanComparisonRow,
  type PlanId,
} from "@/hooks/usePlans";

export default function AdminPlans() {
  const { data, isLoading, error, refetch } = usePlansAdmin();
  const qc = useQueryClient();

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ["plans"] });
    refetch();
  };

  return (
    <>
      <Header />
      <main className="mx-auto max-w-6xl px-4 py-10">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <Link to="/admin/ai-training" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-gold">
              <ArrowLeft className="h-3 w-3" /> Админ панел
            </Link>
            <h1 className="font-serif text-3xl text-foreground">Планове и цени (CMS)</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Всяка промяна тук автоматично актуализира публичната страница /plans и AI master prompt-а.
            </p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-20"><Loader2 className="h-6 w-6 animate-spin" /></div>
        ) : error ? (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 text-sm text-destructive">
            Неуспешно зареждане на плановете: {(error as Error).message}
          </div>
        ) : !data ? (
          <div className="rounded-lg border p-5 text-sm text-muted-foreground">Няма намерени данни за планове.</div>
        ) : (
          <Tabs defaultValue="plans">
            <TabsList>
              <TabsTrigger value="plans">Планове ({data.plans.length})</TabsTrigger>
              <TabsTrigger value="features">Функции ({data.features.length})</TabsTrigger>
              <TabsTrigger value="comparison">Сравнителна таблица ({data.comparison.length})</TabsTrigger>
            </TabsList>

            <TabsContent value="plans" className="space-y-4">
              {data.plans.map((p) => (
                <PlanEditor key={p.id} plan={p} onChanged={invalidate} />
              ))}
            </TabsContent>

            <TabsContent value="features">
              <FeaturesEditor
                plans={data.plans}
                features={data.features}
                onChanged={invalidate}
              />
            </TabsContent>

            <TabsContent value="comparison">
              <ComparisonEditor rows={data.comparison} onChanged={invalidate} />
            </TabsContent>
          </Tabs>
        )}
      </main>
      <Footer />
    </>
  );
}

/* ---------------- Plan editor ---------------- */

function PlanEditor({ plan, onChanged }: { plan: PlanRow; onChanged: () => void }) {
  const [draft, setDraft] = useState<PlanRow>(plan);
  const [saving, setSaving] = useState(false);

  useEffect(() => setDraft(plan), [plan]);

  const save = async () => {
    setSaving(true);
    const { error } = await supabase
      .from("plans")
      .update({
        name: draft.name,
        tagline: draft.tagline,
        monthly_price: draft.monthly_price,
        yearly_price: draft.yearly_price,
        monthly_suffix: draft.monthly_suffix,
        yearly_suffix: draft.yearly_suffix,
        yearly_note: draft.yearly_note,
        ops_cap_monthly: draft.ops_cap_monthly,
        seat_min: draft.seat_min,
        highlight: draft.highlight,
        badge: draft.badge,
        sort_order: draft.sort_order,
        active: draft.active,
      })
      .eq("id", draft.id);
    setSaving(false);
    if (error) toast.error(error.message);
    else {
      toast.success(`Запазено: ${draft.name} (AI prompt-ът е обновен)`);
      onChanged();
    }
  };

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <code className="rounded bg-muted px-2 py-0.5 text-xs">{draft.id}</code>
          <Input
            className="w-72 font-serif text-lg"
            value={draft.name}
            onChange={(e) => setDraft({ ...draft, name: e.target.value })}
          />
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch
              checked={draft.active}
              onCheckedChange={(v) => setDraft({ ...draft, active: v })}
            />
            <Label className="text-xs">Активен</Label>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={draft.highlight}
              onCheckedChange={(v) => setDraft({ ...draft, highlight: v })}
            />
            <Label className="text-xs">Хайлайт</Label>
          </div>
          <Button size="sm" onClick={save} disabled={saving}>
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            <span className="ml-1">Запази</span>
          </Button>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Field label="Tagline">
          <Input
            value={draft.tagline ?? ""}
            onChange={(e) => setDraft({ ...draft, tagline: e.target.value || null })}
          />
        </Field>
        <Field label="Месечна цена (€)">
          <Input
            type="number"
            step="0.01"
            value={draft.monthly_price ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, monthly_price: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
        </Field>
        <Field label="Месечен суфикс">
          <Input
            value={draft.monthly_suffix ?? ""}
            onChange={(e) => setDraft({ ...draft, monthly_suffix: e.target.value || null })}
          />
        </Field>
        <Field label="Годишна цена (€)">
          <Input
            type="number"
            step="0.01"
            value={draft.yearly_price ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, yearly_price: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
        </Field>
        <Field label="Годишен суфикс">
          <Input
            value={draft.yearly_suffix ?? ""}
            onChange={(e) => setDraft({ ...draft, yearly_suffix: e.target.value || null })}
          />
        </Field>
        <Field label="Бележка към годишен">
          <Input
            value={draft.yearly_note ?? ""}
            onChange={(e) => setDraft({ ...draft, yearly_note: e.target.value || null })}
          />
        </Field>
        <Field label="Операции / месец">
          <Input
            type="number"
            value={draft.ops_cap_monthly ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, ops_cap_monthly: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
        </Field>
        <Field label="Минимум места">
          <Input
            type="number"
            value={draft.seat_min ?? ""}
            onChange={(e) =>
              setDraft({ ...draft, seat_min: e.target.value === "" ? null : Number(e.target.value) })
            }
          />
        </Field>
        <Field label="Badge (Най-премиум…)">
          <Input
            value={draft.badge ?? ""}
            onChange={(e) => setDraft({ ...draft, badge: e.target.value || null })}
          />
        </Field>
        <Field label="Sort">
          <Input
            type="number"
            value={draft.sort_order}
            onChange={(e) => setDraft({ ...draft, sort_order: Number(e.target.value) })}
          />
        </Field>
      </div>
    </Card>
  );
}

/* ---------------- Features ---------------- */

function FeaturesEditor({
  plans,
  features,
  onChanged,
}: {
  plans: PlanRow[];
  features: PlanFeatureRow[];
  onChanged: () => void;
}) {
  return (
    <div className="space-y-6">
      {plans.map((plan) => (
        <PlanFeatures key={plan.id} plan={plan} features={features.filter((f) => f.plan_id === plan.id)} onChanged={onChanged} />
      ))}
    </div>
  );
}

function PlanFeatures({
  plan,
  features,
  onChanged,
}: {
  plan: PlanRow;
  features: PlanFeatureRow[];
  onChanged: () => void;
}) {
  const [newFeat, setNewFeat] = useState("");
  const add = async () => {
    if (!newFeat.trim()) return;
    const { error } = await supabase.from("plan_features").insert({
      plan_id: plan.id as PlanId,
      feature: newFeat.trim(),
      sort_order: features.length,
    });
    if (error) toast.error(error.message);
    else {
      setNewFeat("");
      toast.success("Добавено");
      onChanged();
    }
  };
  const update = async (id: string, patch: Partial<PlanFeatureRow>) => {
    const { error } = await supabase.from("plan_features").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else onChanged();
  };
  const remove = async (id: string) => {
    if (!confirm("Изтриване на функцията?")) return;
    const { error } = await supabase.from("plan_features").delete().eq("id", id);
    if (error) toast.error(error.message);
    else {
      toast.success("Изтрито");
      onChanged();
    }
  };
  return (
    <Card className="p-5">
      <h3 className="mb-3 font-serif text-lg">
        {plan.name} <code className="ml-2 rounded bg-muted px-2 py-0.5 text-xs">{plan.id}</code>
      </h3>
      <div className="space-y-2">
        {features
          .sort((a, b) => a.sort_order - b.sort_order)
          .map((f) => (
            <div key={f.id} className="flex items-center gap-2">
              <Input
                className="flex-1"
                value={f.feature}
                onBlur={(e) => e.target.value !== f.feature && update(f.id, { feature: e.target.value })}
                onChange={(e) => {
                  // local-only — actual save on blur
                  f.feature = e.target.value;
                }}
              />
              <Input
                type="number"
                className="w-16"
                value={f.sort_order}
                onChange={(e) => update(f.id, { sort_order: Number(e.target.value) })}
              />
              <Switch checked={f.active} onCheckedChange={(v) => update(f.id, { active: v })} />
              <Button size="sm" variant="ghost" onClick={() => remove(f.id)}>
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        <div className="flex gap-2 pt-2">
          <Input
            placeholder="Нова функция…"
            value={newFeat}
            onChange={(e) => setNewFeat(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
          />
          <Button size="sm" onClick={add}><Plus className="h-3 w-3" /> Добави</Button>
        </div>
      </div>
    </Card>
  );
}

/* ---------------- Comparison ---------------- */

function ComparisonEditor({ rows, onChanged }: { rows: PlanComparisonRow[]; onChanged: () => void }) {
  const [newLabel, setNewLabel] = useState("");
  const add = async () => {
    if (!newLabel.trim()) return;
    const { error } = await supabase
      .from("plan_comparison_rows")
      .insert({ label: newLabel.trim(), sort_order: rows.length });
    if (error) toast.error(error.message);
    else {
      setNewLabel("");
      onChanged();
    }
  };
  const update = async (id: string, patch: Partial<PlanComparisonRow>) => {
    const { error } = await supabase.from("plan_comparison_rows").update(patch).eq("id", id);
    if (error) toast.error(error.message);
    else onChanged();
  };
  const remove = async (id: string) => {
    if (!confirm("Изтриване?")) return;
    const { error } = await supabase.from("plan_comparison_rows").delete().eq("id", id);
    if (error) toast.error(error.message);
    else onChanged();
  };
  return (
    <Card className="p-5">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[800px] text-xs">
          <thead>
            <tr className="border-b text-left">
              <th className="p-2">Възможност</th>
              <th className="p-2">Безплатен</th>
              <th className="p-2">Професионалист</th>
              <th className="p-2">Предприемач</th>
              <th className="p-2">Екип</th>
              <th className="p-2 w-16">Sort</th>
              <th className="p-2 w-12"></th>
              <th className="p-2 w-12"></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b">
                <td className="p-1"><CellInput value={r.label} onSave={(v) => update(r.id, { label: v })} /></td>
                <td className="p-1"><CellInput value={r.free_value} onSave={(v) => update(r.id, { free_value: v })} /></td>
                <td className="p-1"><CellInput value={r.professional_value} onSave={(v) => update(r.id, { professional_value: v })} /></td>
                <td className="p-1"><CellInput value={r.entrepreneur_value} onSave={(v) => update(r.id, { entrepreneur_value: v })} /></td>
                <td className="p-1"><CellInput value={r.team_value} onSave={(v) => update(r.id, { team_value: v })} /></td>
                <td className="p-1">
                  <Input
                    type="number"
                    className="w-16"
                    defaultValue={r.sort_order}
                    onBlur={(e) => Number(e.target.value) !== r.sort_order && update(r.id, { sort_order: Number(e.target.value) })}
                  />
                </td>
                <td className="p-1">
                  <Switch checked={r.active} onCheckedChange={(v) => update(r.id, { active: v })} />
                </td>
                <td className="p-1">
                  <Button size="sm" variant="ghost" onClick={() => remove(r.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-4 flex gap-2">
        <Input
          placeholder="Нов ред (възможност)…"
          value={newLabel}
          onChange={(e) => setNewLabel(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
        />
        <Button onClick={add} size="sm"><Plus className="h-3 w-3" /> Добави</Button>
      </div>
    </Card>
  );
}

function CellInput({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return (
    <Input
      value={v}
      onChange={(e) => setV(e.target.value)}
      onBlur={() => v !== value && onSave(v)}
    />
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <Label className="mb-1 block text-xs uppercase tracking-wider text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
