import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Bot, Scale, Play } from "@/icons";
import {
  MODEL_OPTIONS,
  LAWYER_MODELS,
  RUBRIC,
  RUBRIC_LABELS,
  type TurnEvent,
  type Scenario,
} from "./_shared";

export default function RunTab() {
  const [scenario, setScenario] = useState("");
  const [scenarioId, setScenarioId] = useState<string>("");
  const [bank, setBank] = useState<Scenario[]>([]);
  const [lawyerModel, setLawyerModel] = useState("google/gemini-2.5-pro");
  const [dogovaryModel, setDogovaryModel] = useState<string>("");
  const [activeModel, setActiveModel] = useState<string>("");
  const [sameModel, setSameModel] = useState(false);
  const [maxTurns, setMaxTurns] = useState(5);
  const [withTools, setWithTools] = useState(true);
  const [running, setRunning] = useState(false);
  const [turns, setTurns] = useState<TurnEvent[]>([]);
  const [phase, setPhase] = useState<string>("");
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [doneInfo, setDoneInfo] = useState<{ avgScore: number | null; patchCount: number } | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    (supabase.from("ai_simulation_scenarios" as any) as any)
      .select("id, title, category, scenario_text, expected_behavior, tags, active")
      .eq("active", true)
      .order("category", { ascending: true })
      .then(({ data }: { data: any }) => setBank((data ?? []) as Scenario[]));
  }, []);

  useEffect(() => {
    supabase
      .from("ai_prompts")
      .select("model")
      .eq("function_name", "assistant-chat")
      .eq("is_active", true)
      .order("version", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        const m = (data?.model as string | null) || "google/gemini-3-flash-preview";
        setActiveModel(m);
        setDogovaryModel(m);
      });
  }, []);

  const effectiveDogovaryModel = sameModel ? lawyerModel : dogovaryModel;

  const updateTurn = (turn: number, patch: Partial<TurnEvent>) => {
    setTurns((prev) => {
      const idx = prev.findIndex((t) => t.turn === turn);
      if (idx === -1) return [...prev, { turn, ...patch }];
      const next = [...prev];
      next[idx] = { ...next[idx], ...patch };
      return next;
    });
  };

  const start = async () => {
    setTurns([]);
    setPhase("стартиране...");
    setSessionId(null);
    setDoneInfo(null);
    setRunning(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const { data: sess } = await supabase.auth.getSession();
      const token = sess.session?.access_token;
      const url = `https://wkbxojefiovdczkwhved.supabase.co/functions/v1/simulation-run`;
      const resp = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ scenario, scenarioId: scenarioId || undefined, lawyerModel, dogovaryModel: effectiveDogovaryModel, maxTurns, withTools }),
        signal: ctrl.signal,
      });
      if (!resp.ok || !resp.body) {
        const text = await resp.text().catch(() => "");
        toast.error(`Грешка: ${resp.status} ${text.slice(0, 200)}`);
        setRunning(false);
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
          let evtName = "message";
          let dataStr = "";
          for (const l of lines) {
            if (l.startsWith("event: ")) evtName = l.slice(7).trim();
            else if (l.startsWith("data: ")) dataStr += l.slice(6);
          }
          let data: any = {};
          try { data = JSON.parse(dataStr); } catch { continue; }

          if (evtName === "session") setSessionId(data.sessionId);
          else if (evtName === "phase") setPhase(`Ход ${data.turn + 1}: ${data.phase}`);
          else if (evtName === "user_message") updateTurn(data.turn, { userMessage: data.text });
          else if (evtName === "dogovary_response") updateTurn(data.turn, { dogovaryResponse: data.text, tools: data.tools });
          else if (evtName === "turn_done") updateTurn(data.turn, { score: data.score, verdict: data.verdict, issues: data.issues, breakdown: data.breakdown });
          else if (evtName === "done") {
            setDoneInfo({ avgScore: data.avgScore, patchCount: data.patchCount });
            setPhase(`готово — ${data.patchCount} patch-а създадени`);
            toast.success(`Симулацията завърши. Среден score: ${data.avgScore}/10, patch-ове: ${data.patchCount}`);
          } else if (evtName === "error") {
            toast.error(`Грешка: ${data.message}`);
          }
        }
      }
    } catch (e) {
      if ((e as Error).name !== "AbortError") toast.error((e as Error).message);
    } finally {
      setRunning(false);
    }
  };

  const stop = () => {
    abortRef.current?.abort();
    setRunning(false);
    toast.info("Спряно (DB session остава)");
  };

  return (
    <div className="mt-4 space-y-4">
      <Card className="p-4 space-y-3">
        <div>
          <Label>Сценарий от банката (по избор)</Label>
          <Select value={scenarioId || "__none__"} onValueChange={(v) => {
            const id = v === "__none__" ? "" : v;
            setScenarioId(id);
            const found = bank.find((b) => b.id === id);
            if (found) setScenario(found.scenario_text + (found.expected_behavior ? `\n[Очаквано]: ${found.expected_behavior}` : ""));
          }} disabled={running}>
            <SelectTrigger><SelectValue placeholder="-- свободен сценарий --" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__">-- свободен / random --</SelectItem>
              {bank.map((s) => <SelectItem key={s.id} value={s.id}>[{s.category}] {s.title}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label>Свободен сценарий (или редакция на избрания)</Label>
          <Textarea
            rows={3}
            value={scenario}
            onChange={(e) => setScenario(e.target.value)}
            placeholder="Напр. 'Малък бизнес иска трудов договор за счетоводител на 4 часа, в няколко града, с конкурентна клауза.'"
            disabled={running}
          />
          <p className="mt-1 text-[10px] text-muted-foreground">Ако оставите празно и без избор от банката, адвокатът сам ще измисля разнообразни тестови сценарии.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <Label>Модел на адвоката (judge)</Label>
            <Select value={lawyerModel} onValueChange={setLawyerModel} disabled={running}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LAWYER_MODELS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="flex items-center gap-2">
              Модел на DogovaryAI
              {activeModel && <span className="text-[10px] text-muted-foreground">(продукция: {activeModel})</span>}
            </Label>
            <Select value={effectiveDogovaryModel} onValueChange={setDogovaryModel} disabled={running || sameModel}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {MODEL_OPTIONS.map((m) => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <div>
            <Label>Брой ходове</Label>
            <Input type="number" min={1} max={20} value={maxTurns} onChange={(e) => setMaxTurns(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))} disabled={running} />
          </div>
          <div className="flex items-end gap-2">
            <Switch checked={withTools} onCheckedChange={setWithTools} disabled={running} />
            <Label className="text-xs">Включи tools</Label>
          </div>
          <div className="flex items-end gap-2">
            <Switch checked={sameModel} onCheckedChange={setSameModel} disabled={running} />
            <Label className="text-xs">DogovaryAI = адвокат (A/B)</Label>
          </div>
        </div>

        <div className="flex gap-2">
          {!running ? (
            <Button onClick={start} className="bg-gold text-gold-foreground hover:bg-gold/90">
              <Play className="mr-1 h-4 w-4" /> Старт симулация
            </Button>
          ) : (
            <Button onClick={stop} variant="destructive">Спри</Button>
          )}
          {phase && <span className="text-xs text-muted-foreground self-center">{phase}</span>}
        </div>
        {doneInfo && (
          <div className="rounded border border-gold/30 bg-gold/5 p-3 text-sm">
            ✅ Завършено. Среден score: <strong>{doneInfo.avgScore}/10</strong> · Patch-ове: <strong>{doneInfo.patchCount}</strong>
            {sessionId && <Link to={`#patches`} className="ml-2 text-gold underline">→ Прегледай patch-овете</Link>}
          </div>
        )}
      </Card>

      <div className="space-y-3">
        {turns.map((t) => (
          <Card key={t.turn} className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold">Ход {t.turn + 1}</h3>
              {typeof t.score === "number" && (
                <Badge variant={t.score >= 8 ? "default" : t.score >= 5 ? "secondary" : "destructive"}>
                  {t.score}/10
                </Badge>
              )}
            </div>
            {t.userMessage && (
              <div className="rounded border bg-muted/30 p-2 text-xs">
                <div className="mb-1 flex items-center gap-1 font-semibold text-muted-foreground"><Scale className="h-3 w-3" /> Адвокат → потребител</div>
                <div className="whitespace-pre-wrap">{t.userMessage}</div>
              </div>
            )}
            {t.dogovaryResponse && (
              <div className="rounded border border-gold/20 bg-gold/5 p-2 text-xs">
                <div className="mb-1 flex items-center gap-1 font-semibold text-muted-foreground"><Bot className="h-3 w-3" /> DogovaryAI</div>
                <div className="whitespace-pre-wrap">{t.dogovaryResponse}</div>
                {t.tools && t.tools.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1">
                    {t.tools.map((tl, i) => (
                      <Badge key={i} variant="outline" className="text-[10px]">{tl.name}</Badge>
                    ))}
                  </div>
                )}
              </div>
            )}
            {t.verdict && (
              <div className="rounded border border-blue-500/20 bg-blue-500/5 p-2 text-xs">
                <div className="mb-1 font-semibold text-muted-foreground">Присъда на адвоката</div>
                {t.breakdown && (
                  <div className="mb-2 flex flex-wrap gap-1">
                    {RUBRIC.map((d) => {
                      const v = t.breakdown![d];
                      if (typeof v !== "number") return null;
                      const color = v >= 8 ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : v >= 5 ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "bg-red-500/20 text-red-700 dark:text-red-300";
                      return <span key={d} className={`rounded px-1.5 py-0.5 text-[10px] font-mono ${color}`}>{RUBRIC_LABELS[d]}: {v}</span>;
                    })}
                  </div>
                )}
                <div className="whitespace-pre-wrap">{t.verdict}</div>
                {Array.isArray(t.issues) && t.issues.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {t.issues.map((iss: any, i: number) => (
                      <div key={i} className="text-[10px]">
                        <Badge variant="outline" className="mr-1">{iss.section_key}</Badge>
                        {iss.dimension && <Badge variant="secondary" className="mr-1 text-[9px]">{iss.dimension}</Badge>}
                        <span className="text-muted-foreground">{iss.finding}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
