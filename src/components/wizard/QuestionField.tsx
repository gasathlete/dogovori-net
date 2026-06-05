import { useMemo, useState, useEffect } from "react";
import type { Question } from "@/data/sectors";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, UserPlus } from "lucide-react";

type Contact = { id: string; name: string; type?: string };

type Props = {
  q: Question;
  value: string;
  onChange: (v: string) => void;
  answers?: Record<string, string>;
  onAnswerChange?: (id: string, v: string) => void;
  compact?: boolean;
  contacts?: Contact[];
  invalid?: boolean;
};

const TYPE_OPTIONS = ["Юридическо лице", "Физическо лице", "ЕТ / Самоосигуряващо се"];

/** Парсва party_X_extra текст във формат „Име | Тип“ на ред. */
function parseExtras(raw: string): Array<{ name: string; type: string }> {
  if (!raw?.trim()) return [];
  return raw.split("\n").map((line) => {
    const [name = "", type = ""] = line.split("|").map((s) => s.trim());
    return { name, type };
  });
}

function serializeExtras(rows: Array<{ name: string; type: string }>): string {
  if (rows.length === 0) return "";
  return rows.map((r) => `${r.name} | ${r.type}`).join("\n");
}

/** Извлича чистото име на ролята от label „Наименование на Възложителя“ → „Възложителя“. */
function roleFromLabel(label: string): string {
  return label.replace(/^Наименование на\s+/i, "").trim();
}

function PartyBlock({
  role,
  nameId,
  typeId,
  extraId,
  answers,
  onAnswerChange,
  contacts,
}: {
  role: string;
  nameId: string;
  typeId: string;
  extraId: string;
  answers: Record<string, string>;
  onAnswerChange: (id: string, v: string) => void;
  contacts: Contact[];
}) {
  const extras = useMemo(() => parseExtras(answers[extraId] ?? ""), [answers, extraId]);

  const updateExtras = (next: Array<{ name: string; type: string }>) => {
    onAnswerChange(extraId, serializeExtras(next));
  };

  const addExtra = () => updateExtras([...extras, { name: "", type: "" }]);
  const removeExtra = (idx: number) => updateExtras(extras.filter((_, i) => i !== idx));
  const setExtra = (idx: number, patch: Partial<{ name: string; type: string }>) =>
    updateExtras(extras.map((r, i) => (i === idx ? { ...r, ...patch } : r)));

  const pickContact = (contactId: string) => {
    const c = contacts.find((x) => x.id === contactId);
    if (!c) return;
    onAnswerChange(nameId, c.name);
    if (c.type) {
      const mapped = c.type === "individual" ? "Физическо лице" : "Юридическо лице";
      onAnswerChange(typeId, mapped);
    }
  };

  return (
    <div className="space-y-4 rounded-lg border border-border/50 bg-card/30 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">{role}</div>
        {contacts.length > 0 && (
          <div className="flex items-center gap-2">
            <Select onValueChange={pickContact}>
              <SelectTrigger className="h-9 w-auto min-w-[200px] bg-input/60 text-xs">
                <UserPlus className="mr-1.5 h-3.5 w-3.5 text-gold" />
                <SelectValue placeholder="Избери от контрагенти" />
              </SelectTrigger>
              <SelectContent>
                {contacts.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">Наименование</Label>
        <Input
          value={answers[nameId] ?? ""}
          onChange={(e) => onAnswerChange(nameId, e.target.value)}
          placeholder="ЕООД „Пример“ / Иван Иванов"
          className="bg-input/60 text-base"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">Тип</Label>
        <div className="grid gap-2 sm:grid-cols-3">
          {TYPE_OPTIONS.map((opt) => {
            const selected = answers[typeId] === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onAnswerChange(typeId, opt)}
                className={`rounded-lg border p-2.5 text-left text-xs transition-all ${
                  selected
                    ? "border-gold bg-gold/10 text-foreground shadow-soft"
                    : "border-border bg-card/40 text-muted-foreground hover:border-gold/50 hover:text-foreground"
                }`}
              >
                {opt}
              </button>
            );
          })}
        </div>
      </div>

      {extras.length > 0 && (
        <div className="space-y-2 border-t border-border/40 pt-3">
          <Label className="text-xs font-medium text-muted-foreground">
            Допълнителни {role.toLowerCase()}
          </Label>
          {extras.map((row, idx) => (
            <div key={idx} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_auto_auto]">
              <Input
                value={row.name}
                onChange={(e) => setExtra(idx, { name: e.target.value })}
                placeholder="Име / фирма"
                className="bg-input/60 text-sm"
              />
              <Select value={row.type} onValueChange={(v) => setExtra(idx, { type: v })}>
                <SelectTrigger className="h-10 w-full bg-input/60 text-xs sm:w-[180px]">
                  <SelectValue placeholder="Тип" />
                </SelectTrigger>
                <SelectContent>
                  {TYPE_OPTIONS.map((opt) => (
                    <SelectItem key={opt} value={opt}>
                      {opt}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeExtra(idx)}
                className="h-10 w-10 text-muted-foreground hover:text-destructive"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}
        </div>
      )}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={addExtra}
        className="border-dashed border-gold/40 text-gold hover:bg-gold/10 hover:text-gold"
      >
        <Plus className="mr-1.5 h-3.5 w-3.5" />
        Добави {role}
      </Button>
    </div>
  );
}

export function QuestionField(props: Props) {
  const { q, value, onChange, answers = {}, onAnswerChange, compact = false, contacts = [] } = props;

  // Специален custom рендер за групата „Страни по договора“ — с „+ Добави“ и контрагенти.
  if (q.type === "group" && q.id === "group_parties" && q.fields && q.fields.length >= 4) {
    const aField = q.fields.find((f) => f.id === "party_a_name");
    const bField = q.fields.find((f) => f.id === "party_b_name");
    const roleA = aField ? roleFromLabel(aField.label) : "Страна А";
    const roleB = bField ? roleFromLabel(bField.label) : "Страна Б";
    return (
      <div className="space-y-5">
        <div>
          <Label className="font-serif text-lg leading-snug text-foreground">
            {q.label}
            {q.required && <span className="ml-1 text-gold">*</span>}
          </Label>
          {q.help && <p className="mt-1 text-xs text-muted-foreground">{q.help}</p>}
        </div>
        <PartyBlock
          role={roleA}
          nameId="party_a_name"
          typeId="party_a_type"
          extraId="party_a_extra"
          answers={answers}
          onAnswerChange={onAnswerChange ?? (() => {})}
          contacts={contacts}
        />
        <PartyBlock
          role={roleB}
          nameId="party_b_name"
          typeId="party_b_type"
          extraId="party_b_extra"
          answers={answers}
          onAnswerChange={onAnswerChange ?? (() => {})}
          contacts={contacts}
        />
      </div>
    );
  }

  // Групиран въпрос — стандартен рендер.
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
                contacts={contacts}
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
