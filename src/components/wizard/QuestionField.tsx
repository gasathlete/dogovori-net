import { useMemo, useState, useEffect } from "react";
import type { Question } from "@/data/sectors";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, ShieldCheck } from "@/icons";
import { getFieldHint } from "@/lib/fieldHints";
import { FieldHint } from "@/components/wizard/FieldHint";


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

/**
 * Парсва списък с типове на допълнителни страни. Поддържа два формата:
 * - нов: един тип на ред (напр. „Юридическо лице“)
 * - стар (backward compat): „Име | Тип“ — от него взимаме само типа, името се игнорира,
 *   защото на тази стъпка не събираме лични данни.
 */
export function parseExtraPartyTypes(raw: string): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split("\n")
    .map((line) => {
      const parts = line.split("|").map((s) => s.trim());
      const candidate = parts.length > 1 ? parts[parts.length - 1] : parts[0];
      return candidate || "";
    })
    .filter((t) => t.length > 0 || true) // запазваме и празни редове, за да не „скача“ броят
    .map((t) => (TYPE_OPTIONS.includes(t) ? t : (t || "")));
}

function serializeExtraTypes(types: string[]): string {
  return types.join("\n");
}

/** Извлича чистото име на ролята от label „Възложителя е:“ → „Възложителя“. */
function roleFromLabel(label: string): string {
  return label.replace(/\s*е:\s*$/i, "").trim();
}

function PartyBlock({
  role,
  typeId,
  extraId,
  answers,
  onAnswerChange,
}: {
  role: string;
  typeId: string;
  extraId: string;
  answers: Record<string, string>;
  onAnswerChange: (id: string, v: string) => void;
}) {
  const extras = useMemo(() => parseExtraPartyTypes(answers[extraId] ?? ""), [answers, extraId]);

  const updateExtras = (next: string[]) => {
    onAnswerChange(extraId, serializeExtraTypes(next));
  };

  const addExtra = () => updateExtras([...extras, ""]);
  const removeExtra = (idx: number) => updateExtras(extras.filter((_, i) => i !== idx));
  const setExtra = (idx: number, type: string) =>
    updateExtras(extras.map((r, i) => (i === idx ? type : r)));

  return (
    <div className="space-y-4 rounded-lg border border-border/50 bg-card/30 p-4 md:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-sm font-semibold text-foreground">{role}</div>
        <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5 text-gold" />
          Не събираме имена или ЕГН
        </div>
      </div>

      <div className="space-y-2">
        <Label className="text-xs font-medium text-muted-foreground">Правно-организационна форма</Label>
        <div className="grid gap-2 sm:grid-cols-3">
          {TYPE_OPTIONS.map((opt) => {
            const selected = answers[typeId] === opt;
            return (
              <button
                key={opt}
                type="button"
                onClick={() => onAnswerChange(typeId, opt)}
                aria-pressed={selected}
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
            Допълнителни {role.toLowerCase()} — само форма
          </Label>
          {extras.map((type, idx) => (
            <div key={idx} className="grid grid-cols-[1fr_auto] gap-2">
              <Select value={type} onValueChange={(v) => setExtra(idx, v)}>
                <SelectTrigger className="h-10 w-full bg-input/60 text-xs">
                  <SelectValue placeholder="Изберете форма" />
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
        Добави още един {role.toLowerCase()}
      </Button>
    </div>
  );
}

function ChoiceField({
  options,
  value,
  onChange,
  compact,
  invalid,
  invalidRing,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  compact: boolean;
  invalid: boolean;
  invalidRing: string;
}) {
  const isKnown = options.includes(value);
  const isCustom = !!value && !isKnown;
  const [customMode, setCustomMode] = useState<boolean>(isCustom);
  useEffect(() => { if (isCustom) setCustomMode(true); }, [isCustom]);
  const tiles: Array<{ key: string; label: string; selected: boolean; onClick: () => void }> = [
    ...options.map((opt) => ({
      key: opt,
      label: opt,
      selected: !customMode && value === opt,
      onClick: () => { setCustomMode(false); onChange(opt); },
    })),
    {
      key: "__custom__",
      label: "Друго (свободен текст)…",
      selected: customMode,
      onClick: () => { setCustomMode(true); onChange(isCustom ? value : ""); },
    },
  ];
  return (
    <div className="space-y-2">
      <div className={`${compact && tiles.length > 3 ? "grid gap-2 sm:grid-cols-2" : "space-y-2"} ${invalid ? "rounded-lg ring-1 ring-destructive p-1" : ""}`}>
        {tiles.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={t.onClick}
            className={`w-full rounded-lg border text-left transition-all ${compact ? "p-3" : "p-4"} ${
              t.selected
                ? "border-gold bg-gold/10 text-foreground shadow-soft"
                : "border-border bg-card/40 text-muted-foreground hover:border-gold/50 hover:bg-gold/5 hover:text-foreground"
            }`}
          >
            <div className="flex items-start gap-3">
              <div
                className={`mt-0.5 flex h-5 w-5 flex-shrink-0 items-center justify-center rounded-full border-2 ${
                  t.selected ? "border-gold bg-gold" : "border-border"
                }`}
              >
                {t.selected && <div className="h-1.5 w-1.5 rounded-full bg-navy" />}
              </div>
              <span className="text-sm font-medium">{t.label}</span>
            </div>
          </button>
        ))}
      </div>
      {customMode && (
        <Input
          value={isCustom ? value : ""}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Въведете собствен отговор"
          className={`bg-input/60 text-base ${invalidRing}`}
        />
      )}
    </div>
  );
}


/**
 * Група от полета. Задължителните се показват веднага, а незадължителните са
 * зад аккордеон „Допълнителни детайли“, за да намалим първоначалното
 * попълване (по-малко полета на екран).
 */
function GroupFields({
  q,
  answers,
  onAnswerChange,
  contacts,
}: {
  q: Question;
  answers: Record<string, string>;
  onAnswerChange?: (id: string, v: string) => void;
  contacts: Contact[];
}) {
  const visibleFields = (q.fields ?? []).filter((f) => !f.showIf || f.showIf(answers));
  const requiredFields = visibleFields.filter((f) => f.required);
  const optionalFields = visibleFields.filter((f) => !f.required);
  const hasOptionalValue = optionalFields.some((f) => !!answers[f.id]?.trim());
  const [showOptional, setShowOptional] = useState(hasOptionalValue);
  // Ако няма нито едно задължително поле, не крием всичко.
  const primary = requiredFields.length > 0 ? requiredFields : visibleFields;
  const secondary = requiredFields.length > 0 ? optionalFields : [];

  const renderField = (f: Question, idx: number) => (
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
  );

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
        {primary.map(renderField)}

        {secondary.length > 0 && (
          <div className="border-t border-border/40 pt-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowOptional((v) => !v)}
              aria-expanded={showOptional}
              className="h-8 px-2 text-xs text-muted-foreground hover:text-gold"
            >
              {showOptional ? "Скрий допълнителните детайли" : `Допълнителни детайли (${secondary.length}) — по избор`}
            </Button>
            {showOptional && (
              <div className="mt-4 space-y-5">{secondary.map(renderField)}</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function QuestionField(props: Props) {
  const { q, value, onChange, answers = {}, onAnswerChange, compact = false, contacts = [], invalid = false } = props;
  const invalidRing = invalid ? "border-destructive ring-1 ring-destructive" : "";

  // Специален custom рендер за групи от страни — само правно-организационна форма (без имена / ЕГН),
  // с възможност за добавяне на повече от една страна във всяка роля.
  // Поддържа както класическите party_a_type/party_b_type полета, така и
  // произволни party-полета, идващи от graph-адаптера (field.type === "party").
  if (q.type === "group" && (q.id === "group_parties" || q.id.startsWith("group_parties_")) && q.fields && q.fields.length >= 1) {
    // Всички полета в такава група се третират като страни; „_extra“ полетата се
    // управляват вътрешно от PartyBlock, така че ги филтрираме тук.
    const partyFields = q.fields.filter((f) => !f.id.endsWith("_extra"));
    return (
      <div className="space-y-5">
        <div>
          <Label className="font-serif text-lg leading-snug text-foreground">
            {q.label}
            {q.required && <span className="ml-1 text-gold">*</span>}
          </Label>
          {q.help && <p className="mt-1 text-xs text-muted-foreground">{q.help}</p>}
        </div>
        {partyFields.map((f) => {
          const role = roleFromLabel(f.label);
          const extraId = f.id.endsWith("_type") ? f.id.replace(/_type$/, "_extra") : `${f.id}_extra`;
          return (
            <PartyBlock
              key={f.id}
              role={role}
              typeId={f.id}
              extraId={extraId}
              answers={answers}
              onAnswerChange={onAnswerChange ?? (() => {})}
            />
          );
        })}
      </div>
    );
  }

  // Групиран въпрос — стандартен рендер (задължителни полета видими,
  // незадължителните — скрити зад „Допълнителни детайли“).
  if (q.type === "group" && q.fields && q.fields.length > 0) {
    return (
      <GroupFields
        q={q}
        answers={answers}
        onAnswerChange={onAnswerChange}
        contacts={contacts}
      />
    );
  }


  const legalHint = getFieldHint(q.id, q.label);
  const labelEl = compact ? (
    <Label className="text-sm font-medium text-foreground">
      {q.label}
      {q.required && <span className="ml-1 text-gold">*</span>}
      {legalHint && <FieldHint hint={legalHint} />}
    </Label>
  ) : (
    <Label className="font-serif text-lg leading-snug text-foreground">
      {q.label}
      {q.required && <span className="ml-1 text-gold">*</span>}
      {legalHint && <FieldHint hint={legalHint} />}
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
          className={`bg-input/60 text-base ${invalidRing}`}
        />
      )}
      {q.type === "number" && (
        <Input
          type="number"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={q.placeholder}
          className={`bg-input/60 text-base ${invalidRing}`}
        />
      )}
      {q.type === "date" && (
        <Input type="date" value={value} onChange={(e) => onChange(e.target.value)} className={`bg-input/60 ${invalidRing}`} />
      )}
      {q.type === "textarea" && (
        <Textarea
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={q.placeholder}
          rows={compact ? 3 : 4}
          className={`bg-input/60 text-base ${invalidRing}`}
        />
      )}
      {(q.type === "radio" || q.type === "select") && (
        <ChoiceField
          options={q.options ?? []}
          value={value}
          onChange={onChange}
          compact={compact}
          invalid={invalid}
          invalidRing={invalidRing}
        />
      )}
    </div>
  );
}
