import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import type { Scenario } from "./_shared";

export default function ScenariosTab() {
  const [list, setList] = useState<Scenario[]>([]);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Partial<Scenario> | null>(null);

  const load = async () => {
    setBusy(true);
    const { data } = await (supabase.from("ai_simulation_scenarios" as any) as any)
      .select("*").order("category", { ascending: true }).order("created_at", { ascending: false });
    setList((data ?? []) as Scenario[]);
    setBusy(false);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing?.title?.trim() || !editing?.scenario_text?.trim()) {
      toast.error("Заглавие и текст са задължителни");
      return;
    }
    const payload = {
      title: editing.title.trim(),
      category: (editing.category || "general").trim(),
      scenario_text: editing.scenario_text.trim(),
      expected_behavior: editing.expected_behavior?.trim() || null,
      tags: typeof editing.tags === "string"
        ? (editing.tags as unknown as string).split(",").map((t) => t.trim()).filter(Boolean)
        : (editing.tags ?? []),
      active: editing.active ?? true,
    };
    try {
      if (editing.id) {
        const { error } = await (supabase.from("ai_simulation_scenarios" as any) as any).update(payload).eq("id", editing.id);
        if (error) throw error;
      } else {
        const { data: { user: u } } = await supabase.auth.getUser();
        const { error } = await (supabase.from("ai_simulation_scenarios" as any) as any).insert({ ...payload, created_by: u?.id ?? null });
        if (error) throw error;
      }
      toast.success("Записано");
      setEditing(null);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    }
  };

  const remove = async (id: string) => {
    if (!confirm("Изтриване?")) return;
    const { error } = await (supabase.from("ai_simulation_scenarios" as any) as any).delete().eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Изтрит"); load(); }
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-2">
        <Button size="sm" onClick={() => setEditing({ active: true, category: "general", tags: [] })}>+ Нов сценарий</Button>
        <Button size="sm" variant="outline" onClick={load} disabled={busy}>{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Обнови"}</Button>
        <span className="ml-auto text-xs text-muted-foreground">Банка от тестови случаи за повтаряемост и регресия</span>
      </div>

      {editing && (
        <Card className="p-4 space-y-2 border-gold/40">
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="Заглавие" value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} />
            <Input placeholder="Категория (напр. canon_violations, employment, pii_handling)" value={editing.category ?? ""} onChange={(e) => setEditing({ ...editing, category: e.target.value })} />
          </div>
          <Textarea rows={3} placeholder="Текст на сценария — потребителско съобщение / контекст" value={editing.scenario_text ?? ""} onChange={(e) => setEditing({ ...editing, scenario_text: e.target.value })} />
          <Textarea rows={2} placeholder="Очаквано поведение от асистента (по избор)" value={editing.expected_behavior ?? ""} onChange={(e) => setEditing({ ...editing, expected_behavior: e.target.value })} />
          <Input placeholder="Тагове (запетая)" value={Array.isArray(editing.tags) ? editing.tags.join(", ") : (editing.tags ?? "")} onChange={(e) => setEditing({ ...editing, tags: e.target.value as any })} />
          <div className="flex items-center gap-2">
            <Switch checked={editing.active ?? true} onCheckedChange={(v) => setEditing({ ...editing, active: v })} />
            <Label className="text-xs">Активен</Label>
            <div className="ml-auto flex gap-2">
              <Button size="sm" variant="outline" onClick={() => setEditing(null)}>Отказ</Button>
              <Button size="sm" onClick={save}>Запази</Button>
            </div>
          </div>
        </Card>
      )}

      {list.length === 0 && <p className="text-sm text-muted-foreground">Няма сценарии.</p>}
      {list.map((s) => (
        <Card key={s.id} className={`p-3 ${s.active ? "" : "opacity-60"}`}>
          <div className="flex items-start justify-between gap-2">
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className="text-[10px]">{s.category}</Badge>
                <strong className="text-sm">{s.title}</strong>
                {s.tags?.map((t) => <Badge key={t} variant="secondary" className="text-[9px]">{t}</Badge>)}
              </div>
              <p className="mt-1 text-xs text-muted-foreground line-clamp-2">{s.scenario_text}</p>
              {s.expected_behavior && <p className="mt-0.5 text-[10px] text-blue-600 dark:text-blue-400 line-clamp-1">→ {s.expected_behavior}</p>}
            </div>
            <div className="flex gap-1 shrink-0">
              <Button size="sm" variant="outline" onClick={() => setEditing(s)}>Редакция</Button>
              <Button size="sm" variant="ghost" className="text-destructive" onClick={() => remove(s.id)}>Изтрий</Button>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
