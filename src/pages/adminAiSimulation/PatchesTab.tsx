import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Check, X, Sparkles } from "@/icons";
import type { Patch } from "./_shared";

export default function PatchesTab() {
  const [patches, setPatches] = useState<Patch[]>([]);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<"pending" | "all">("pending");

  const load = async () => {
    setBusy(true);
    let q = supabase.from("ai_simulation_patches").select("*").order("created_at", { ascending: false }).limit(100);
    if (filter === "pending") q = q.eq("status", "pending");
    const { data } = await q;
    setPatches((data ?? []) as Patch[]);
    setBusy(false);
  };
  useEffect(() => { load(); }, [filter]);

  const buildDraft = async (p: Patch) => {
    const { data: active } = await supabase
      .from("ai_prompts").select("*").eq("function_name", "assistant-chat").eq("is_active", true)
      .order("version", { ascending: false }).limit(1).maybeSingle();
    if (!active) throw new Error("Няма активен промпт");
    const { data: existingSections } = await supabase
      .from("ai_prompt_sections").select("*").eq("prompt_id", active.id).order("order_idx", { ascending: true });
    const sections = (existingSections ?? []).map((s: any) => ({
      section_key: s.section_key, title: s.title, content: s.content, order_idx: s.order_idx, enabled: s.enabled,
    }));
    const idx = sections.findIndex((s) => s.section_key === p.section_key);
    if (idx >= 0) {
      sections[idx].content = p.patch_content;
      if (p.section_title) sections[idx].title = p.section_title;
    } else {
      sections.push({ section_key: p.section_key, title: p.section_title || p.section_key, content: p.patch_content, order_idx: sections.length, enabled: true });
    }
    const { data: latest } = await supabase
      .from("ai_prompts").select("version").eq("function_name", "assistant-chat")
      .order("version", { ascending: false }).limit(1).maybeSingle();
    const nextVersion = ((latest?.version ?? 0) as number) + 1;
    const assembled = sections.filter((s) => s.enabled).map((s) => s.title ? `# ${s.title}\n${s.content}` : s.content).join("\n\n");
    const { data: { user: u } } = await supabase.auth.getUser();
    const { data: inserted, error: iErr } = await supabase.from("ai_prompts").insert({
      function_name: "assistant-chat", version: nextVersion, content: assembled,
      notes: `Авто-patch от симулация ${p.session_id.slice(0, 8)} → секция ${p.section_key}`,
      is_active: false, created_by: u?.id ?? null, model: active.model, premium_model: active.premium_model,
    }).select("id").single();
    if (iErr || !inserted) throw iErr ?? new Error("insert_failed");
    const sectionRows = sections.map((s, i) => ({
      prompt_id: inserted.id, section_key: s.section_key, title: s.title, content: s.content, order_idx: i, enabled: s.enabled,
    }));
    await supabase.from("ai_prompt_sections").insert(sectionRows);
    return { draftId: inserted.id as string, nextVersion, userId: u?.id ?? null };
  };

  const applyPatch = async (p: Patch) => {
    if (!confirm(`Прилагане на patch към секция "${p.section_key}". Това ще създаде нов draft в AI обучение. Продължаване?`)) return;
    setBusy(true);
    try {
      const { draftId, nextVersion, userId } = await buildDraft(p);
      await supabase.from("ai_simulation_patches").update({
        status: "applied", applied_prompt_id: draftId, decided_by: userId, decided_at: new Date().toISOString(),
      }).eq("id", p.id);
      toast.success(`v${nextVersion} draft създаден. Активирай го в "AI обучение".`);
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  const applyWithRegression = async (p: Patch) => {
    if (!confirm(`Прилагане с регресия: създавам draft + пускам 3 сценария от банката. Ако драфтът регресира спрямо текущия промпт — патчът се отбелязва като 'rejected'. Продължаване?`)) return;
    setBusy(true);
    try {
      const { draftId, nextVersion, userId } = await buildDraft(p);
      toast.info(`Draft v${nextVersion} създаден. Пускам регресия...`);
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const resp = await fetch(`https://wkbxojefiovdczkwhved.supabase.co/functions/v1/simulation-regression`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ candidatePromptId: draftId, sampleSize: 3, thresholdDelta: -0.5 }),
      });
      const result = await resp.json();
      if (!resp.ok) throw new Error(result?.error || `regression failed (${resp.status})`);
      const passed = Boolean(result.passed);
      const delta = result.delta;
      const uplift = result.uplift_pct;
      const justified = result.upgrade_justified;
      await (supabase.from("ai_simulation_patches" as any) as any).update({
        status: passed ? "applied" : "rejected",
        applied_prompt_id: passed ? draftId : null,
        decided_by: userId, decided_at: new Date().toISOString(),
        regression_result: result, regression_passed: passed,
      }).eq("id", p.id);
      const justifiedStr = justified === null ? "" : justified ? " · 🟢 upgrade оправдан" : " · 🔴 upgrade НЕ е оправдан";
      if (passed) {
        toast.success(`✅ Регресия мина (Δ=${delta}, +${uplift ?? 0}%)${justifiedStr}. Draft v${nextVersion} готов.`);
      } else {
        toast.error(`❌ Регресия провалена (Δ=${delta}, +${uplift ?? 0}%)${justifiedStr}. Patch отхвърлен.`);
      }
      load();
    } catch (e) {
      toast.error((e as Error).message);
    } finally { setBusy(false); }
  };

  const reject = async (p: Patch) => {
    const { data: { user: u } } = await supabase.auth.getUser();
    await supabase.from("ai_simulation_patches").update({
      status: "rejected",
      decided_by: u?.id ?? null,
      decided_at: new Date().toISOString(),
    }).eq("id", p.id);
    toast.success("Отхвърлен");
    load();
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center gap-2">
        <Select value={filter} onValueChange={(v) => setFilter(v as any)}>
          <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="pending">Очакващи</SelectItem>
            <SelectItem value="all">Всички</SelectItem>
          </SelectContent>
        </Select>
        <Button size="sm" variant="outline" onClick={load} disabled={busy}>{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Обнови"}</Button>
        <Button size="sm" variant="ghost" asChild className="ml-auto"><Link to="/admin/ai-training">→ AI обучение</Link></Button>
      </div>

      {patches.length === 0 && <p className="text-sm text-muted-foreground">Няма patch-ове.</p>}
      {patches.map((p) => (
        <Card key={p.id} className="p-4 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline">{p.section_key}</Badge>
              {p.section_title && <span className="text-xs text-muted-foreground">{p.section_title}</span>}
              <Badge variant={p.status === "applied" ? "default" : p.status === "rejected" ? "destructive" : "secondary"}>{p.status}</Badge>
            </div>
            {p.status === "pending" && (
              <div className="flex gap-1">
                <Button size="sm" onClick={() => applyWithRegression(p)} disabled={busy} className="bg-gold text-gold-foreground hover:bg-gold/90" title="Създай draft + автоматична регресия по 3 сценария">
                  <Sparkles className="h-3 w-3 mr-1" /> С регресия
                </Button>
                <Button size="sm" variant="outline" onClick={() => applyPatch(p)} disabled={busy}><Check className="h-3 w-3 mr-1 text-success" /> Бързо</Button>
                <Button size="sm" variant="outline" onClick={() => reject(p)}><X className="h-3 w-3 mr-1" /> Отхвърли</Button>
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">{p.patch_description}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase text-muted-foreground">Текущо</div>
              <pre className="max-h-60 overflow-auto rounded border bg-muted/30 p-2 text-[10px] whitespace-pre-wrap">{p.current_content ?? "(нова секция)"}</pre>
            </div>
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase text-gold">Предложено</div>
              <pre className="max-h-60 overflow-auto rounded border border-gold/30 bg-gold/5 p-2 text-[10px] whitespace-pre-wrap">{p.patch_content}</pre>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
