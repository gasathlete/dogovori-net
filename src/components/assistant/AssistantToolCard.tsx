import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { FileText, ExternalLink, Wand2, Upload, ArrowRight, HelpCircle, ListChecks, Check, FileEdit } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  buildPrefillParams,
  mergeAssistantAnswers,
  updateAssistantDraft,
  useAssistantDraft,
  type DraftAnswer,
} from "./assistantDraftStore";

export type ToolEvent =
  | { kind: "tool_result"; id: string; name: string; args: any; result: any }
  | { kind: "tool_call"; id: string; name: string; args: any; status?: "pending" | "done" };

interface Props {
  event: ToolEvent;
  onSendMessage?: (text: string) => void;
}

export function AssistantToolCard({ event, onSendMessage }: Props) {
  if (event.kind === "tool_result" && event.name === "search_templates") {
    const results: Array<{ slug: string; name: string; purpose: string; category: string; documentType?: string }> = event.result?.results ?? [];
    if (results.length === 0) {
      return (
        <Card title="Търсене на шаблони">
          <p className="text-xs text-muted-foreground mb-2">Няма точно съвпадение за „{event.args?.query}". Мога да го изградя от нула.</p>
          {onSendMessage && (
            <Button
              size="sm"
              className="h-7 text-xs bg-gold text-navy hover:bg-gold/90"
              onClick={() => onSendMessage("Изгради ми такъв документ от нула — задай ми само критичните въпроси и продължи към план на клаузите.")}
            >
              Започни изграждане
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
      const path = String(event.args?.path ?? "");
      const abs = path.startsWith("/") ? `https://dogovori.net${path}` : path;
      return (
        <Card title="Навигация" icon={<ArrowRight className="h-3.5 w-3.5 text-gold" />}>
          <p className="text-xs text-foreground">
            {event.args?.reason ? `${event.args.reason} → ` : "Отварям "}
            <code className="rounded bg-card/60 px-1 py-0.5 text-[10px] text-gold">{path}</code>
          </p>
          {path && <ExternalDogovoriLink href={abs} label="Отвори в dogovori.net" />}
        </Card>
      );
    }
    if (event.name === "open_template") {
      const slug = String(event.args?.slug ?? "");
      const abs = `https://dogovori.net/shablon/${slug}`;
      return (
        <Card title="Отварям шаблон" icon={<FileText className="h-3.5 w-3.5 text-gold" />}>
          <p className="text-xs text-foreground">
            Шаблон: <code className="rounded bg-card/60 px-1 py-0.5 text-[10px] text-gold">{slug}</code>
          </p>
          {slug && <ExternalDogovoriLink href={abs} label={`Отвори „${slug}" в dogovori.net`} />}
        </Card>
      );
    }
    if (event.name === "prefill_build_contract") {
      const a = event.args ?? {};
      const params = new URLSearchParams();
      if (a.documentType) params.set("documentType", String(a.documentType));
      if (a.name) params.set("name", String(a.name));
      if (a.bilingual) params.set("bilingual", "1");
      const abs = `https://dogovori.net/build${params.toString() ? `?${params.toString()}` : ""}`;
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
          <ExternalDogovoriLink href={abs} label="Изготви документа в dogovori.net" />
        </Card>
      );
    }
    if (event.name === "open_upload_analyzer") {
      return (
        <Card title="Отварям анализатор" icon={<Upload className="h-3.5 w-3.5 text-gold" />}>
          <p className="text-xs text-foreground">Качете PDF или DOCX за анализ.</p>
          <ExternalDogovoriLink href="https://dogovori.net/analyze" label="Отвори анализатора в dogovori.net" />
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

function ExternalDogovoriLink({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="mt-2 inline-flex items-center gap-1 rounded-md border border-gold/40 bg-gold/10 px-2 py-1 text-[11px] font-medium text-foreground transition-colors hover:border-gold hover:bg-gold/20"
    >
      <ExternalLink className="h-3 w-3 text-gold" />
      {label}
    </a>
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
  const draft = useAssistantDraft();
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const init: Record<string, string> = {};
    for (const q of questions) {
      const existing = draft.answers[q.id];
      if (existing?.value) init[q.id] = existing.value;
    }
    return init;
  });
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = () => {
    const filled = questions
      .map((q) => ({ q, v: answers[q.id]?.trim() }))
      .filter((x) => x.v);
    if (filled.length === 0) return;

    // Persist answers into the shared draft store so OutlineCard + Live Draft
    // pick them up immediately, without waiting for the next model turn.
    const patch: Record<string, DraftAnswer> = {};
    for (const { q, v } of filled) patch[q.id] = { label: q.label, value: v! };
    mergeAssistantAnswers(patch);

    setSubmitted(true);
    const lines = filled.map(({ q, v }) => `- ${q.label}: ${v}`);
    onSendMessage?.(
      `Ето отговорите ми:\n${lines.join("\n")}\n\nПродължи директно с план на клаузите (propose_contract_outline) — без повече въпроси.`,
    );
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
        {submitted ? "Записано — продължавам с плана" : "Изпрати и продължи"}
      </Button>

      {/* Live draft preview reflecting current answers across all cards. */}
      <LiveDraftPreview />
    </Card>
  );
}

function OutlineCard({ args, onSendMessage }: { args: any; onSendMessage?: (text: string) => void }) {
  const title: string = args?.title ?? "Договор";
  const clauses: Array<{ heading: string; summary: string }> = Array.isArray(args?.clauses) ? args.clauses : [];
  const slug: string | undefined = args?.basedOnTemplateSlug;
  const documentType: string | undefined = args?.documentType;
  const prefill = args?.prefill ?? {};
  const navigate = useNavigate();
  const [confirmed, setConfirmed] = useState(false);

  // Push outline + prefill into the shared draft so the Live Draft preview
  // and the final "Финализирай" navigation are wired to the same state.
  useEffect(() => {
    updateAssistantDraft({
      title,
      documentType: documentType ?? null,
      basedOnTemplateSlug: slug ?? null,
      partiesA: prefill?.partiesA ?? undefined,
      partiesB: prefill?.partiesB ?? undefined,
      subject: prefill?.subject ?? undefined,
      bilingual: !!prefill?.bilingual,
      clauses,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleConfirm = () => {
    setConfirmed(true);
    const params = buildPrefillParams({
      name: title,
      documentType,
      partiesA: prefill?.partiesA,
      partiesB: prefill?.partiesB,
      subject: prefill?.subject,
      bilingual: prefill?.bilingual,
    });
    // Direct navigation — no extra model round-trip.
    setTimeout(() => navigate(`/build?${params.toString()}`), 200);
  };

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

      <LiveDraftPreview />

      <div className="mt-3 flex flex-wrap gap-1.5">
        <Button
          size="sm"
          disabled={confirmed}
          onClick={handleConfirm}
          className="h-7 bg-gold text-navy hover:bg-gold/90 text-xs"
        >
          <Check className="mr-1 h-3 w-3" /> Финализирай и попълни
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={confirmed}
          onClick={() => onSendMessage?.("Промени структурата: добави/премахни клаузи и предложи нов план.")}
          className="h-7 border-gold/40 text-xs"
        >
          Промени клаузите
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

/**
 * Compact, always-up-to-date snapshot of the contract being assembled.
 * Reads from the shared draft store so it stays consistent between
 * `ask_clarification` answers and `propose_contract_outline` clauses.
 */
function LiveDraftPreview() {
  const draft = useAssistantDraft();
  const answerEntries = Object.entries(draft.answers);
  const hasContent =
    !!draft.title ||
    !!draft.partiesA ||
    !!draft.partiesB ||
    !!draft.subject ||
    draft.clauses.length > 0 ||
    answerEntries.length > 0;

  if (!hasContent) return null;

  return (
    <div className="mt-3 rounded-md border border-gold/20 bg-background/40 p-2">
      <div className="mb-1.5 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wide text-gold">
        <FileEdit className="h-3 w-3" />
        <span>Live Draft — текущ преглед</span>
      </div>
      <div className="space-y-1 text-xs text-foreground">
        {draft.title && <div><span className="text-muted-foreground">Документ:</span> <strong>{draft.title}</strong></div>}
        {draft.partiesA && <div><span className="text-muted-foreground">Страна А:</span> {draft.partiesA}</div>}
        {draft.partiesB && <div><span className="text-muted-foreground">Страна Б:</span> {draft.partiesB}</div>}
        {draft.subject && <div><span className="text-muted-foreground">Предмет:</span> {draft.subject}</div>}
        {answerEntries.length > 0 && (
          <ul className="mt-1 space-y-0.5">
            {answerEntries.map(([id, a]) => (
              <li key={id} className="text-[11px]">
                <span className="text-muted-foreground">{a.label}:</span> {a.value}
              </li>
            ))}
          </ul>
        )}
        {draft.clauses.length > 0 && (
          <div className="mt-1.5 text-[10px] text-muted-foreground">
            {draft.clauses.length} клаузи готови за финализиране
          </div>
        )}
      </div>
    </div>
  );
}
