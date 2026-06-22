import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2, Play, Sparkles } from "lucide-react";
import type { Session } from "./_shared";

export default function HistoryTab() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [busy, setBusy] = useState(false);
  const [resumingId, setResumingId] = useState<string | null>(null);
  const [resumePhase, setResumePhase] = useState<string>("");
  const [extraTurns, setExtraTurns] = useState<Record<string, number>>({});
  const [activeModel, setActiveModel] = useState<string>("");
  const [promotingId, setPromotingId] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const loadActiveModel = async () => {
    const { data } = await supabase
      .from("ai_prompts")
      .select("model")
      .eq("function_name", "assistant-chat")
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle();
    setActiveModel((data?.model as string | null) || "");
  };

  const load = async () => {
    setBusy(true);
    const { data } = await supabase
      .from("ai_simulation_sessions")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
    setSessions((data ?? []) as Session[]);
    setBusy(false);
  };
  useEffect(() => { load(); loadActiveModel(); }, []);

  const promote = async (s: Session) => {
    if (!s.dogovary_model) { toast.error("Сесията няма записан модел."); return; }
    if (s.dogovary_model === activeModel) { toast.info("Този модел вече е в продукция."); return; }
    if (!confirm(`Сменям продукционния модел на DogovaryAI от "${activeModel || "(none)"}" на "${s.dogovary_model}". Промптът остава непроменен. Продължаване?`)) return;
    setPromotingId(s.id);
    try {
      const { error } = await supabase
        .from("ai_prompts")
        .update({ model: s.dogovary_model })
        .eq("function_name", "assistant-chat")
        .eq("is_active", true);
      if (error) throw error;
      toast.success(`Продукционният модел е сменен на ${s.dogovary_model}`);
      await loadActiveModel();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setPromotingId(null);
    }
  };

  const resume = async (s: Session) => {
    const addExtra = extraTurns[s.id] ?? 0;
    const newMax = Math.max(s.turn_count + 1, Math.min(20, s.max_turns + addExtra));
    setResumingId(s.id);
    setResumePhase("стартиране...");
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const resp = await fetch(`https://wkbxojefiovdczkwhved.supabase.co/functions/v1/simulation-run`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ resumeSessionId: s.id, maxTurns: newMax }),
        signal: ctrl.signal,
      });
      if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => "");
        toast.error(`Грешка: ${resp.status} ${text.slice(0, 200)}`);
        setResumingId(null);
        return;
      }
      const reader = resp.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const evt of events) {
          if (!evt.trim()) continue;
          const lines = evt.split("\n");
          let evtName = "message"; let dataStr = "";
          for (const l of lines) {
            if (l.startsWith("event: ")) evtName = l.slice(7).trim();
            else if (l.startsWith("data: ")) dataStr += l.slice(6);
          }
          let data: any = {};
          try { data = JSON.parse(dataStr); } catch { continue; }
          if (evtName === "phase") setResumePhase(`Ход ${data.turn + 1}: ${data.phase}`);
          else if (evtName === "turn_done" && !data.replay) setResumePhase(`Ход ${data.turn + 1} готов — score ${data.score}/10`);
          else if (evtName === "done") {
            toast.success(`Завършено. Среден score: ${data.avgScore}/10 · patch-ове: ${data.patchCount}`);
            setResumePhase("готово");
          } else if (evtName === "error") {
            toast.error(`Грешка: ${data.message}`);
          }
        }
      }
      await load();
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error((e as Error).message);
    } finally {
      setResumingId(null);
    }
  };

  const stopResume = () => { abortRef.current?.abort(); setResumingId(null); };

  return (
    <div className="mt-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <Button size="sm" variant="outline" onClick={() => { load(); loadActiveModel(); }} disabled={busy}>{busy ? <Loader2 className="h-3 w-3 animate-spin" /> : "Обнови"}</Button>
        {activeModel && <span className="text-xs text-muted-foreground">Продукционен модел на DogovaryAI: <strong>{activeModel}</strong></span>}
      </div>
      {sessions.length === 0 && <p className="text-sm text-muted-foreground">Няма стартирани симулации.</p>}
      {sessions.map((s) => {
        const canResume = (s.status === "running" || s.status === "failed") && s.turn_count < 20;
        const isResuming = resumingId === s.id;
        const canPromote = s.status === "completed" && s.dogovary_model && s.dogovary_model !== activeModel;
        const isPromoting = promotingId === s.id;
        return (
          <Card key={s.id} className="p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 text-xs flex-wrap">
                  <Badge variant={s.status === "completed" ? "default" : s.status === "failed" ? "destructive" : "secondary"}>{s.status}</Badge>
                  <span className="text-muted-foreground">{new Date(s.created_at).toLocaleString("bg-BG")}</span>
                  <span className="text-muted-foreground">•</span>
                  <Badge variant="outline" className="text-[10px]">judge: {s.lawyer_model}</Badge>
                  <Badge variant="outline" className="text-[10px]">bot: {s.dogovary_model || "—"}</Badge>
                  <span className="text-muted-foreground">•</span>
                  <span>{s.turn_count}/{s.max_turns} ходa</span>
                  {s.avg_score !== null && <Badge variant="outline">avg {s.avg_score}/10</Badge>}
                </div>
                {s.scenario && <div className="mt-1 truncate text-xs text-muted-foreground">{s.scenario}</div>}
                {s.error_message && <div className="mt-1 text-xs text-destructive">{s.error_message}</div>}
                {isResuming && <div className="mt-2 text-xs text-gold">⟳ {resumePhase}</div>}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {canPromote && (
                  <Button size="sm" variant="outline" onClick={() => promote(s)} disabled={isPromoting || Boolean(resumingId)} title="Направи този модел продукционен за DogovaryAI">
                    {isPromoting ? <Loader2 className="h-3 w-3 animate-spin" /> : <Sparkles className="mr-1 h-3 w-3" />} В продукция
                  </Button>
                )}
                {canResume && (
                  !isResuming ? (
                    <>
                      <Input
                        type="number"
                        min={0}
                        max={20 - s.turn_count}
                        value={extraTurns[s.id] ?? 0}
                        onChange={(e) => setExtraTurns((p) => ({ ...p, [s.id]: Math.max(0, Math.min(20 - s.turn_count, parseInt(e.target.value, 10) || 0)) }))}
                        className="h-8 w-16 text-xs"
                        title="Допълнителни ходове над оригиналните"
                      />
                      <Button size="sm" variant="outline" onClick={() => resume(s)} disabled={Boolean(resumingId)}>
                        <Play className="mr-1 h-3 w-3" /> Продължи
                      </Button>
                    </>
                  ) : (
                    <Button size="sm" variant="destructive" onClick={stopResume}>Спри</Button>
                  )
                )}
              </div>
            </div>
          </Card>
        );
      })}
    </div>
  );
}
