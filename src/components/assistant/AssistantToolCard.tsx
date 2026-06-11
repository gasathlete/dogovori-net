import { useState } from "react";
import { Link } from "react-router-dom";
import { FileText, ExternalLink, Wand2, Upload, ArrowRight, HelpCircle, ListChecks, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export type ToolEvent =
  | { kind: "tool_result"; id: string; name: string; args: any; result: any }
  | { kind: "tool_call"; id: string; name: string; args: any; status?: "pending" | "done" };

interface Props {
  event: ToolEvent;
  onSendMessage?: (text: string) => void;
}

export function AssistantToolCard({ event, onSendMessage }: Props) {
  if (event.kind === "tool_result" && event.name === "search_templates") {
    const results: Array<{ slug: string; name: string; purpose: string; category: string }> = event.result?.results ?? [];
    if (results.length === 0) {
      return (
        <Card title="Търсене на шаблони">
          <p className="text-xs text-muted-foreground mb-2">Няма подходящи резултати за „{event.args?.query}".</p>
          {onSendMessage && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 text-xs border-gold/40 text-gold hover:bg-gold/10"
              onClick={() => onSendMessage("Създай ми такъв договор от нула — започни с пълномощно/изясняване на липсващите данни.")}
            >
              Създай от нула
            </Button>
          )}
        </Card>
      );
    }
    return (
      <Card title={`Намерени шаблони (${results.length})`} icon={<FileText className="h-3.5 w-3.5 text-gold" />}>
        <ul className="space-y-1.5">
          {results.map((r) => (
            <li key={r.slug}>
              <Link
                to={`/shablon/${r.slug}`}
                className="group flex items-start justify-between gap-2 rounded-md border border-border/60 bg-background/50 px-2.5 py-1.5 text-xs transition-colors hover:border-gold/40"
              >
                <div className="min-w-0">
                  <div className="truncate font-medium text-foreground">{r.name}</div>
                  {r.purpose && <div className="truncate text-[10px] text-muted-foreground">{r.purpose}</div>}
                </div>
                <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground transition-colors group-hover:text-gold" />
              </Link>
            </li>
          ))}
        </ul>
      </Card>
    );
  }

  if (event.kind === "tool_call") {
    if (event.name === "navigate") {
      return (
        <Card title="Навигация" icon={<ArrowRight className="h-3.5 w-3.5 text-gold" />}>
          <p className="text-xs text-foreground">
            {event.args?.reason ? `${event.args.reason} → ` : "Отварям "}
            <code className="rounded bg-card/60 px-1 py-0.5 text-[10px] text-gold">{event.args?.path}</code>
          </p>
        </Card>
      );
    }
    if (event.name === "open_template") {
      return (
        <Card title="Отварям шаблон" icon={<FileText className="h-3.5 w-3.5 text-gold" />}>
          <p className="text-xs text-foreground">
            Шаблон: <code className="rounded bg-card/60 px-1 py-0.5 text-[10px] text-gold">{event.args?.slug}</code>
          </p>
        </Card>
      );
    }
    if (event.name === "prefill_build_contract") {
      const a = event.args ?? {};
      return (
        <Card title="Стартирам wizard за договор" icon={<Wand2 className="h-3.5 w-3.5 text-gold" />}>
          <ul className="space-y-0.5 text-xs text-foreground">
            {a.name && <li>• <strong>Заглавие:</strong> {a.name}</li>}
            {a.documentType && <li>• <strong>Тип:</strong> {a.documentType}</li>}
            {a.partiesA && <li>• <strong>Страна А:</strong> {a.partiesA}</li>}
            {a.partiesB && <li>• <strong>Страна Б:</strong> {a.partiesB}</li>}
            {a.subject && <li>• <strong>Предмет:</strong> {a.subject}</li>}
            {a.bilingual && <li>• Двуезичен (BG/EN)</li>}
          </ul>
          <p className="mt-1.5 text-[10px] text-muted-foreground">Прегледайте и редактирайте във wizard-а.</p>
        </Card>
      );
    }
    if (event.name === "open_upload_analyzer") {
      return (
        <Card title="Отварям анализатор" icon={<Upload className="h-3.5 w-3.5 text-gold" />}>
          <p className="text-xs text-foreground">Качете PDF или DOCX за анализ.</p>
        </Card>
      );
    }
    if (event.name === "ask_clarification") {
      return <ClarificationCard args={event.args} onSendMessage={onSendMessage} />;
    }
    if (event.name === "propose_contract_outline") {
      return <OutlineCard args={event.args} onSendMessage={onSendMessage} />;
    }
  }

  return null;
}

function Card({ title, icon, children }: { title: string; icon?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="my-2 rounded-lg border border-gold/30 bg-gold/5 p-2.5">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
        {icon}
        <span>{title}</span>
      </div>
      {children}
    </div>
  );
}

interface ClarificationQuestion {
  id: string;
  label: string;
  type: "text" | "choice" | "number" | "date";
  placeholder?: string;
  options?: string[];
  required?: boolean;
}

function ClarificationCard({ args, onSendMessage }: { args: any; onSendMessage?: (text: string) => void }) {
  const contextSummary: string = args?.contextSummary ?? "";
  const questions: ClarificationQuestion[] = Array.isArray(args?.questions) ? args.questions : [];
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    if (!onSendMessage) return;
    const lines = questions
      .map((q) => {
        const v = answers[q.id]?.trim();
        if (!v) return null;
        return `- ${q.label}: ${v}`;
      })
      .filter(Boolean);
    if (lines.length === 0) return;
    setSubmitted(true);
    onSendMessage(`Ето отговорите ми:\n${lines.join("\n")}`);
  };

  return (
    <Card title="Уточняващи въпроси" icon={<HelpCircle className="h-3.5 w-3.5 text-gold" />}>
      {contextSummary && <p className="mb-2 text-xs text-muted-foreground">{contextSummary}</p>}
      <div className="space-y-2.5">
        {questions.map((q) => (
          <div key={q.id}>
            <Label className="text-xs">{q.label}{q.required && <span className="text-destructive"> *</span>}</Label>
            {q.type === "choice" && q.options ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {q.options.map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    disabled={submitted}
                    onClick={() => setAnswers((a) => ({ ...a, [q.id]: opt }))}
                    className={`rounded-full border px-2.5 py-1 text-[11px] transition-colors ${
                      answers[q.id] === opt
                        ? "border-gold bg-gold/15 text-foreground"
                        : "border-border/60 bg-background/40 text-muted-foreground hover:border-gold/40"
                    }`}
                  >
                    {opt}
                  </button>
                ))}
              </div>
            ) : (
              <Input
                type={q.type === "number" ? "number" : q.type === "date" ? "date" : "text"}
                value={answers[q.id] ?? ""}
                onChange={(e) => setAnswers((a) => ({ ...a, [q.id]: e.target.value }))}
                placeholder={q.placeholder ?? ""}
                disabled={submitted}
                className="mt-1 h-8 text-xs"
              />
            )}
          </div>
        ))}
      </div>
      <Button
        size="sm"
        onClick={handleSubmit}
        disabled={submitted}
        className="mt-3 h-7 bg-gold text-navy hover:bg-gold/90 text-xs"
      >
        {submitted ? "Изпратено" : "Изпрати отговорите"}
      </Button>
    </Card>
  );
}

function OutlineCard({ args, onSendMessage }: { args: any; onSendMessage?: (text: string) => void }) {
  const title: string = args?.title ?? "Договор";
  const clauses: Array<{ heading: string; summary: string }> = Array.isArray(args?.clauses) ? args.clauses : [];
  const slug: string | undefined = args?.basedOnTemplateSlug;
  const [confirmed, setConfirmed] = useState(false);

  return (
    <Card title="План на договора" icon={<ListChecks className="h-3.5 w-3.5 text-gold" />}>
      <p className="mb-2 text-xs font-semibold text-foreground">{title}</p>
      <ol className="space-y-1 text-xs text-foreground">
        {clauses.map((c, i) => (
          <li key={i} className="rounded-md border border-border/60 bg-background/40 px-2 py-1.5">
            <div className="font-medium">{i + 1}. {c.heading}</div>
            {c.summary && <div className="text-[10px] text-muted-foreground">{c.summary}</div>}
          </li>
        ))}
      </ol>
      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button
          size="sm"
          disabled={confirmed}
          onClick={() => {
            setConfirmed(true);
            onSendMessage?.("Потвърждавам плана — попълни договора във wizard-а с тези клаузи.");
          }}
          className="h-7 bg-gold text-navy hover:bg-gold/90 text-xs"
        >
          <Check className="mr-1 h-3 w-3" /> Потвърди и попълни
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={confirmed}
          onClick={() => onSendMessage?.("Промени структурата на договора — добави/премахни клаузи.")}
          className="h-7 border-gold/40 text-xs"
        >
          Промени
        </Button>
        {slug && (
          <Link
            to={`/shablon/${slug}`}
            className="inline-flex h-7 items-center rounded-md border border-border/60 px-2.5 text-xs text-muted-foreground transition-colors hover:border-gold/40 hover:text-foreground"
          >
            Виж шаблона
          </Link>
        )}
      </div>
    </Card>
  );
}
