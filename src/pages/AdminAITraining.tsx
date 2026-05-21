import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Header } from "@/components/Header";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Loader2, Save, Plus, Trash2, Brain } from "lucide-react";

const AI_FUNCTIONS = [
  { id: "generate-contract", label: "Генериране на договор" },
  { id: "analyze-contract", label: "Анализ на договор" },
  { id: "assistant-chat", label: "AI асистент (чат)" },
  { id: "apply-corrections", label: "Прилагане на корекции" },
  { id: "build-custom-contract", label: "Изготвяне по бланка" },
  { id: "correct-uploaded", label: "Корекция на качен договор" },
  { id: "suggest-followup-questions", label: "Уточняващи въпроси (wizard)" },
];

type Prompt = { id: string; function_name: string; version: number; content: string; is_active: boolean; notes: string | null; created_at: string };
type Rule = { id: string; function_name: string; rule_text: string; severity: "must" | "should"; active: boolean };
type Example = { id: string; function_name: string; category: string; title: string; input_context: string; expected_output: string; weight: number; active: boolean };

export default function AdminAITraining() {
  const { user, loading } = useAuth();
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [fn, setFn] = useState(AI_FUNCTIONS[0].id);

  useEffect(() => {
    if (loading) return;
    if (!user) { setAllowed(false); return; }
    supabase.rpc("is_staff", { _user_id: user.id }).then(({ data }) => setAllowed(Boolean(data)));
  }, [user, loading]);

  if (loading || allowed === null) {
    return <div className="flex min-h-screen items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-gold" /></div>;
  }
  if (!allowed) {
    return (
      <div className="min-h-screen">
        <Header />
        <div className="container py-20 text-center">
          <h1 className="mb-2 text-2xl font-bold">Достъп отказан</h1>
          <Button asChild variant="outline"><Link to="/">Към начало</Link></Button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <Header />
      <div className="container py-8">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h1 className="flex items-center gap-2 font-serif text-2xl font-bold"><Brain className="h-6 w-6 text-gold" /> AI обучение</h1>
            <p className="text-sm text-muted-foreground">Преглед и редакция на системни промптове, правила и примери за всяка AI функция.</p>
          </div>
          <Button asChild variant="outline" size="sm"><Link to="/admin"><ArrowLeft className="mr-1 h-3 w-3" /> Към админ</Link></Button>
        </div>

        <div className="mb-4">
          <Label>AI функция</Label>
          <Select value={fn} onValueChange={setFn}>
            <SelectTrigger className="max-w-md"><SelectValue /></SelectTrigger>
            <SelectContent>{AI_FUNCTIONS.map((f) => <SelectItem key={f.id} value={f.id}>{f.label}</SelectItem>)}</SelectContent>
          </Select>
        </div>

        <Tabs defaultValue="prompts">
          <TabsList>
            <TabsTrigger value="prompts">Промптове</TabsTrigger>
            <TabsTrigger value="rules">Правила</TabsTrigger>
            <TabsTrigger value="examples">Few-shot примери</TabsTrigger>
          </TabsList>
          <TabsContent value="prompts"><PromptsTab functionName={fn} /></TabsContent>
          <TabsContent value="rules"><RulesTab functionName={fn} /></TabsContent>
          <TabsContent value="examples"><ExamplesTab functionName={fn} /></TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

function PromptsTab({ functionName }: { functionName: string }) {
  const [rows, setRows] = useState<Prompt[]>([]);
  const [draft, setDraft] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    const { data } = await supabase.from("ai_prompts").select("*").eq("function_name", functionName).order("version", { ascending: false });
    setRows((data ?? []) as Prompt[]);
    const active = (data ?? []).find((r: any) => r.is_active);
    setDraft(active?.content ?? "");
    setNotes("");
  };
  useEffect(() => { load(); }, [functionName]);

  const saveNewVersion = async () => {
    if (!draft.trim()) { toast.error("Промптът е празен"); return; }
    setBusy(true);
    const nextVersion = (rows[0]?.version ?? 0) + 1;
    const { data: { user: u } } = await supabase.auth.getUser();
    const { error } = await supabase.from("ai_prompts").insert({
      function_name: functionName, version: nextVersion, content: draft, notes: notes || null, is_active: false, created_by: u?.id ?? null,
    });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success(`v${nextVersion} запазена`);
    load();
  };

  const activate = async (id: string) => {
    setBusy(true);
    await supabase.from("ai_prompts").update({ is_active: false }).eq("function_name", functionName);
    const { error } = await supabase.from("ai_prompts").update({ is_active: true }).eq("id", id);
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Активирана");
    load();
  };

  return (
    <div className="mt-4 space-y-4">
      <div className="rounded-lg border p-4">
        <div className="mb-2 flex items-center justify-between">
          <Label>Системен промпт (нова версия)</Label>
          <span className="text-xs text-muted-foreground">{draft.length} символа</span>
        </div>
        <Textarea rows={14} value={draft} onChange={(e) => setDraft(e.target.value)} className="font-mono text-xs" placeholder="Въведете системния промпт..." />
        <Input className="mt-2" placeholder="Бележки за тази версия (по избор)" value={notes} onChange={(e) => setNotes(e.target.value)} />
        <Button onClick={saveNewVersion} disabled={busy} className="mt-2 bg-gradient-gold text-navy">
          {busy ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Save className="mr-1 h-4 w-4" />} Запази нова версия
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">Запазената версия не се активира автоматично — натиснете „Активирай" в списъка отдолу.</p>
      </div>

      <div className="rounded-lg border">
        <div className="border-b bg-muted/40 px-3 py-2 text-xs font-medium uppercase tracking-wider">Версии</div>
        {rows.length === 0 && <div className="p-4 text-sm text-muted-foreground">Все още няма запазени промптове. Запазете първа версия отгоре.</div>}
        {rows.map((r) => (
          <div key={r.id} className="flex items-start justify-between gap-3 border-b p-3 text-sm last:border-b-0">
            <div className="min-w-0 flex-1">
              <div className="mb-1 flex items-center gap-2">
                <Badge variant={r.is_active ? "default" : "outline"}>v{r.version}{r.is_active && " · активна"}</Badge>
                <span className="text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("bg-BG")}</span>
              </div>
              {r.notes && <p className="mb-1 text-xs italic text-muted-foreground">{r.notes}</p>}
              <pre className="max-h-20 overflow-y-auto whitespace-pre-wrap text-[11px] text-muted-foreground">{r.content.slice(0, 300)}{r.content.length > 300 && "..."}</pre>
            </div>
            <div className="flex flex-col gap-1">
              <Button size="sm" variant="outline" onClick={() => setDraft(r.content)}>Зареди</Button>
              {!r.is_active && <Button size="sm" onClick={() => activate(r.id)} disabled={busy}>Активирай</Button>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function RulesTab({ functionName }: { functionName: string }) {
  const [rows, setRows] = useState<Rule[]>([]);
  const [text, setText] = useState("");
  const [severity, setSeverity] = useState<"must" | "should">("must");

  const load = async () => {
    const { data } = await supabase.from("ai_rules").select("*").eq("function_name", functionName).order("created_at", { ascending: false });
    setRows((data ?? []) as Rule[]);
  };
  useEffect(() => { load(); }, [functionName]);

  const add = async () => {
    if (!text.trim()) return;
    const { error } = await supabase.from("ai_rules").insert({ function_name: functionName, rule_text: text, severity, active: true });
    if (error) { toast.error(error.message); return; }
    setText("");
    load();
  };

  const toggle = async (r: Rule) => {
    await supabase.from("ai_rules").update({ active: !r.active }).eq("id", r.id);
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Изтриване?")) return;
    await supabase.from("ai_rules").delete().eq("id", id);
    load();
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="rounded-lg border p-3">
        <div className="flex gap-2">
          <Select value={severity} onValueChange={(v) => setSeverity(v as "must" | "should")}>
            <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="must">MUST</SelectItem>
              <SelectItem value="should">SHOULD</SelectItem>
            </SelectContent>
          </Select>
          <Input placeholder="Правило (напр. „винаги добавяй раздел Контакти")" value={text} onChange={(e) => setText(e.target.value)} />
          <Button onClick={add}><Plus className="mr-1 h-3 w-3" /> Добави</Button>
        </div>
      </div>
      <div className="rounded-lg border">
        {rows.length === 0 && <div className="p-4 text-sm text-muted-foreground">Няма правила.</div>}
        {rows.map((r) => (
          <div key={r.id} className="flex items-center gap-2 border-b p-3 text-sm last:border-b-0">
            <Badge variant={r.severity === "must" ? "default" : "outline"}>{r.severity.toUpperCase()}</Badge>
            <span className={`flex-1 ${!r.active && "line-through text-muted-foreground"}`}>{r.rule_text}</span>
            <Button size="sm" variant="ghost" onClick={() => toggle(r)}>{r.active ? "Деакт." : "Акт."}</Button>
            <Button size="sm" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-3 w-3" /></Button>
          </div>
        ))}
      </div>
    </div>
  );
}

function ExamplesTab({ functionName }: { functionName: string }) {
  const [rows, setRows] = useState<Example[]>([]);
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("general");
  const [input, setInput] = useState("");
  const [output, setOutput] = useState("");

  const load = async () => {
    const { data } = await supabase.from("ai_training_examples").select("*").eq("function_name", functionName).order("weight", { ascending: false });
    setRows((data ?? []) as Example[]);
  };
  useEffect(() => { load(); }, [functionName]);

  const add = async () => {
    if (!title.trim() || !input.trim() || !output.trim()) { toast.error("Попълнете всички полета"); return; }
    const { error } = await supabase.from("ai_training_examples").insert({
      function_name: functionName, category, title, input_context: input, expected_output: output, weight: 1, active: true,
    });
    if (error) { toast.error(error.message); return; }
    setTitle(""); setInput(""); setOutput("");
    load();
  };

  const remove = async (id: string) => {
    if (!confirm("Изтриване?")) return;
    await supabase.from("ai_training_examples").delete().eq("id", id);
    load();
  };

  return (
    <div className="mt-4 space-y-3">
      <div className="space-y-2 rounded-lg border p-3">
        <div className="grid grid-cols-2 gap-2">
          <Input placeholder="Заглавие" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input placeholder="Категория (напр. naem, prodajba, general)" value={category} onChange={(e) => setCategory(e.target.value)} />
        </div>
        <Textarea rows={3} placeholder="Входен контекст (какво е подадено)" value={input} onChange={(e) => setInput(e.target.value)} />
        <Textarea rows={5} placeholder="Очакван изход (примерен правилен отговор)" value={output} onChange={(e) => setOutput(e.target.value)} />
        <Button onClick={add}><Plus className="mr-1 h-3 w-3" /> Добави пример</Button>
      </div>
      <div className="rounded-lg border">
        {rows.length === 0 && <div className="p-4 text-sm text-muted-foreground">Няма примери.</div>}
        {rows.map((r) => (
          <div key={r.id} className="border-b p-3 text-sm last:border-b-0">
            <div className="mb-1 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Badge variant="outline">{r.category}</Badge>
                <span className="font-medium">{r.title}</span>
              </div>
              <Button size="sm" variant="ghost" onClick={() => remove(r.id)}><Trash2 className="h-3 w-3" /></Button>
            </div>
            <details className="text-xs text-muted-foreground">
              <summary className="cursor-pointer">Покажи вход/изход</summary>
              <div className="mt-1 space-y-1">
                <div><strong>Вход:</strong> <pre className="whitespace-pre-wrap">{r.input_context}</pre></div>
                <div><strong>Изход:</strong> <pre className="whitespace-pre-wrap">{r.expected_output}</pre></div>
              </div>
            </details>
          </div>
        ))}
      </div>
    </div>
  );
}
