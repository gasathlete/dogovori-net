import type { Question } from "@/data/sectors";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

export function QuestionField({
  q,
  value,
  onChange,
}: {
  q: Question;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div>
        <Label className="font-serif text-lg leading-snug text-foreground">
          {q.label}
          {q.required && <span className="ml-1 text-gold">*</span>}
        </Label>
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
          rows={4}
          className="bg-input/60 text-base"
        />
      )}
      {(q.type === "radio" || q.type === "select") && (
        <div className="space-y-2">
          {q.options?.map((opt) => {
            const selected = value === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onChange(opt)}
                className={`w-full rounded-lg border p-4 text-left transition-all ${
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
