import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Card } from "@/components/ui/card";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Bot, Scale, Play, Check, X, Sparkles } from "lucide-react";
import { AdminMFAGuard } from "@/components/admin/AdminMFAGuard";

const MODEL_OPTIONS = [
  { value: "google/gemini-2.5-pro", label: "Gemini 2.5 Pro" },
  { value: "google/gemini-3.1-pro-preview", label: "Gemini 3.1 Pro (preview)" },
  { value: "google/gemini-3-flash-preview", label: "Gemini 3 Flash (бърз/евтин)" },
  { value: "google/gemini-3.5-flash", label: "Gemini 3.5 Flash" },
  { value: "openai/gpt-5.2", label: "GPT-5.2" },
  { value: "openai/gpt-5.4", label: "GPT-5.4" },
  { value: "openai/gpt-5.4-pro", label: "GPT-5.4 Pro" },
  { value: "openai/gpt-5.5", label: "GPT-5.5" },
  { value: "openai/gpt-5.5-pro", label: "GPT-5.5 Pro" },
];
const LAWYER_MODELS = MODEL_OPTIONS;

const RUBRIC = ["legal_accuracy", "tool_usage", "canon_compliance", "clarity", "usefulness"] as const;
const RUBRIC_LABELS: Record<string, string> = {
  legal_accuracy: "Право",
  tool_usage: "Tools",
  canon_compliance: "Канон",
  clarity: "Език",
  usefulness: "Полза",
};

type TurnEvent = {
  turn: number;
  userMessage?: string;
  dogovaryResponse?: string;
  tools?: Array<{ name: string; args: any }>;
  score?: number;
  verdict?: string;
  issues?: any[];
  phase?: string;
  breakdown?: Record<string, number>;
};

type Session = {
  id: string;
  scenario: string | null;
  lawyer_model: string;
  dogovary_model: string | null;
  status: string;
  max_turns: number;
  turn_count: number;
  avg_score: number | null;
  created_at: string;
  completed_at: string | null;
  error_message: string | null;
};

type Scenario = {
  id: string;
  title: string;
  category: string;
  scenario_text: string;
  expected_behavior: string | null;
  tags: string[];
  active: boolean;
};


type Patch = {
  id: string;
  session_id: string;
  section_key: string;
  section_title: string | null;
  patch_description: string;
  patch_content: string;
  current_content: string | null;
  status: "pending" | "applied" | "rejected";
  applied_prompt_id: string | null;
  created_at: string;
};

export default function AdminAiSimulation() {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { setAllowed(false); return; }
    supabase.rpc("is_staff", { _user_id: user.id }).then(({ data }) => setAllowed(Boolean(data)));
  }, [user, loading]);

  if (loading || allowed === null) {
    return <div className="flex min-h-dvh items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  }
  if (!allowed) {
    return (
      <div className="min-h-dvh">
        <Header />
        <div className="container py-20 text-center">
          <h1 className="mb-2 text-2xl font-bold">Достъп отказан</h1>
          <Button asChild variant="outline"><Link to="/">Към начало</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <AdminMFAGuard>
      <div className="min-h-dvh">
        <Header />
        <div className="container py-8">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h1 className="flex items-center gap-2 font-serif text-2xl font-bold">
                <Sparkles className="h-6 w-6 text-gold" /> AI симулация — самообучение на DogovaryAI
              </h1>
              <p className="text-sm text-muted-foreground">
                Адвокат-AI задава въпроси на DogovaryAI, оценява отговорите и предлага автоматични патчове за активния промпт.
              </p>
            </div>
            <Button asChild variant="outline" size="sm"><Link to="/admin"><ArrowLeft className="mr-1 h-3 w-3" /> Към админ</Link></Button>
          </div>

          <Tabs defaultValue="run">
            <TabsList>
              <TabsTrigger value="run">Нова симулация</TabsTrigger>
              <TabsTrigger value="history">История</TabsTrigger>
              <TabsTrigger value="patches">Patch-ове</TabsTrigger>
              <TabsTrigger value="scenarios">Сценарии</TabsTrigger>
              <TabsTrigger value="settings">Настройки & Cost</TabsTrigger>
            </TabsList>
            <TabsContent value="run"><RunTab /></TabsContent>
            <TabsContent value="history"><HistoryTab /></TabsContent>
            <TabsContent value="patches"><PatchesTab /></TabsContent>
            <TabsContent value="scenarios"><ScenariosTab /></TabsContent>
            <TabsContent value="settings"><SettingsTab /></TabsContent>
          </Tabs>
        </div>
      </div>
    </AdminMFAGuard>
  );
}

function RunTab() {
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

  // Load active prompt model so default DogovaryAI model matches production
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

function HistoryTab() {
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



function PatchesTab() {
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
                <Button size="sm" variant="outline" onClick={() => applyPatch(p)} disabled={busy}><Check className="h-3 w-3 mr-1" /> Бързо</Button>
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

function ScenariosTab() {
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
