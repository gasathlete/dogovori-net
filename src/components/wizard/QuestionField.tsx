import type { Question } from "@/data/sectors";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

type Props = {
  q: Question;
  value: string;
  onChange: (v: string) => void;
  /** За group режим — пълните отговори, нужни за showIf на подвъпросите. */
  answers?: Record<string, string>;
  /** За group режим — сетва стойност на конкретен подвъпрос. */
  onAnswerChange?: (id: string, v: string) => void;
  /** Когато е true, подвъпросът се рендерира компактно (без големия едър Label отгоре). */
  compact?: boolean;
};

export function QuestionField(props: Props) {
  const { q, value, onChange, answers = {}, onAnswerChange, compact = false } = props;

  // Групиран въпрос — рендерира всички подвъпроси в една карта.
  if (q.type === "group" && q.fields && q.fields.length > 0) {
    const visibleFields = q.fields.filter((f) => !f.showIf || f.showIf(answers));
    return (
      <div className="space-y-5">
        <div>
          <Label className="font-serif text-lg leading-snug text-foreground">
            {q.label}
            {q.required && <span className="ml-1 text-gold">*</span>}
          </Label>
          {q.help && <p className="mt-1 text-xs text-muted-foreground">{q.help}</p>}
        </div>
        <div className="space-y-5 rounded-lg border border-border/50 bg-card/30 p-4 md:p-5">
          {visibleFields.map((f, idx) => (
            <div key={f.id} className={idx > 0 ? "border-t border-border/40 pt-5" : ""}>
              <QuestionField
                q={f}
                value={answers[f.id] ?? ""}
                onChange={(v) => onAnswerChange?.(f.id, v)}
                answers={answers}
                onAnswerChange={onAnswerChange}
                compact
              />
            </div>
          ))}
        </div>
      </div>
    );
  }

  const labelEl = compact ? (
    <Label className="text-sm font-medium text-foreground">
      {q.label}
      {q.required && <span className="ml-1 text-gold">*</span>}
    </Label>
  ) : (
    <Label className="font-serif text-lg leading-snug text-foreground">
      {q.label}
      {q.required && <span className="ml-1 text-gold">*</span>}
    </Label>
  );

  return (
    <div className="space-y-3">
      <div>
        {labelEl}
        {q.help && <p className="mt-1 text-xs text-muted-foreground">{q.help}</p>}
      </div>

      {q.type === "text" && (
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={q.placeholder}
          className="bg-input/60 text-base"
        />
      )}
      {q.type === "number" && (
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={q.placeholder}
          className="bg-input/60 text-base"
        />
      )}
      {q.type === "date" && (
        <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} className="bg-input/60" />
      )}
      {q.type === "textarea" && (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={q.placeholder}
          rows={compact ? 3 : 4}
          className="bg-input/60 text-base"
        />
      )}
      {(q.type === "radio" || q.type === "select") && (
        <div className={compact && (q.options?.length ?? 0) > 3 ? "grid gap-2 sm:grid-cols-2" : "space-y-2"}>
          {q.options?.map((opt) => {
            const selected = value === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(opt)}
                className={`w-full rounded-lg border text-left transition-all ${compact ? "p-3" : "p-4"} ${
                  selected
                    ? "border-gold bg-gold/10 text-foreground shadow-soft"
                    : "border-border bg-card/40 text-muted-foreground hover:border-gold/50 hover:bg-gold/5 hover:text-foreground"
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                      selected ? "border-gold bg-gold" : "border-border"
                    }`}
                  >
                    {selected && <div className="h-1.5 w-1.5 rounded-full bg-navy" />}
                  </div>
                  <span className="text-sm font-medium">{opt}</span>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
