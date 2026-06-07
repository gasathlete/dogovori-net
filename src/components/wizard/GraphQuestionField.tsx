/**
 * Renders a single QuestionNode from the graph engine. Pure, presentational.
 * Supports text/longtext/number/money/date/select/multiselect/boolean.
 * Select & multiselect questions automatically expose a "Друго" custom
 * free-text entry alongside their predefined options.
 */

import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

const CUSTOM_SENTINEL = "__custom__";
import { PartyListEditor, parseParties, serializeParties } from "./PartyListEditor";
import type { ResolvedQuestion } from "@/lib/questionGraph";


type Props = {
  q: ResolvedQuestion;
  value: unknown;
  onChange: (v: unknown) => void;
  invalid?: boolean;
  contacts?: Array<{ id: string; name: string; type?: string }>;
};

export function GraphQuestionField({ q, value, onChange, invalid, contacts }: Props) {
  const id = `q-${q.id}`;
  const suggestion = q.default != null && q.default !== "" ? String(q.default) : "";
  const placeholderText = suggestion ? `Препоръчано: ${suggestion}` : undefined;
  const labelEl = (
    <Label htmlFor={id} className="flex items-baseline gap-1 text-sm font-medium">
      <span>{q.label}</span>
      {q.required && <span className="text-destructive">*</span>}
    </Label>
  );
  const help = q.help ? (
    <p className="mt-1 text-xs text-muted-foreground">{q.help}</p>
  ) : null;
  const errorRing = invalid ? "border-destructive ring-1 ring-destructive" : "";

  switch (q.field_type) {
    case "text":
    case "money":
      return (
        <div className="space-y-1.5">
          {labelEl}
          <Input
            id={id}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className={errorRing}
            inputMode={q.field_type === "money" ? "decimal" : undefined}
            placeholder={placeholderText}
          />
          {help}
        </div>
      );

    case "number":
      return (
        <div className="space-y-1.5">
          {labelEl}
          <Input
            id={id}
            type="number"
            value={value == null ? "" : String(value)}
            onChange={(e) => {
              const v = e.target.value;
              onChange(v === "" ? undefined : Number(v));
            }}
            className={errorRing}
            placeholder={placeholderText}
          />
          {help}
        </div>
      );

    case "longtext":
      return (
        <div className="space-y-1.5">
          {labelEl}
          <Textarea
            id={id}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            rows={4}
            className={errorRing}
          />
          {help}
        </div>
      );

    case "date":
      return (
        <div className="space-y-1.5">
          {labelEl}
          <Input
            id={id}
            type="date"
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            className={errorRing}
          />
          {help}
        </div>
      );

    case "select": {
      const knownValues = new Set((q.options ?? []).map((o) => o.value));
      const currentStr = (value as string) ?? "";
      const isCustom = currentStr !== "" && !knownValues.has(currentStr);
      const [customMode, setCustomMode] = useState<boolean>(isCustom);
      useEffect(() => { if (isCustom) setCustomMode(true); }, [isCustom]);
      const selectValue = customMode ? CUSTOM_SENTINEL : currentStr;
      return (
        <div className="space-y-1.5">
          {labelEl}
          <Select
            value={selectValue}
            onValueChange={(v) => {
              if (v === CUSTOM_SENTINEL) {
                setCustomMode(true);
                onChange("");
              } else {
                setCustomMode(false);
                onChange(v);
              }
            }}
          >
            <SelectTrigger id={id} className={errorRing}>
              <SelectValue placeholder="Изберете…" />
            </SelectTrigger>
            <SelectContent>
              {q.options?.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
              <SelectItem value={CUSTOM_SENTINEL}>Друго (свободен текст)…</SelectItem>
            </SelectContent>
          </Select>
          {customMode && (
            <Input
              value={isCustom ? currentStr : ""}
              onChange={(e) => onChange(e.target.value)}
              placeholder="Въведете собствен отговор"
              className={errorRing}
            />
          )}
          {help}
        </div>
      );
    }

    case "multiselect": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      const knownValues = new Set((q.options ?? []).map((o) => o.value));
      const customValues = arr.filter((v) => !knownValues.has(v));
      const customText = customValues[0] ?? "";
      const [customMode, setCustomMode] = useState<boolean>(customValues.length > 0);
      useEffect(() => { if (customValues.length > 0) setCustomMode(true); }, [customValues.length]);
      const toggle = (v: string) => {
        if (arr.includes(v)) onChange(arr.filter((x) => x !== v));
        else onChange([...arr, v]);
      };
      const updateCustom = (text: string) => {
        const cleaned = arr.filter((v) => knownValues.has(v));
        if (text.trim()) onChange([...cleaned, text]);
        else onChange(cleaned);
      };
      return (
        <div className="space-y-1.5">
          {labelEl}
          <div className={`grid gap-2 rounded-md border p-3 ${invalid ? "border-destructive" : ""}`}>
            {q.options?.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox checked={arr.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
                <span>{o.label}</span>
              </label>
            ))}
            <label className="flex cursor-pointer items-start gap-2 text-sm">
              <Checkbox
                checked={customMode}
                onCheckedChange={(c) => {
                  const next = !!c;
                  setCustomMode(next);
                  if (!next) updateCustom("");
                }}
              />
              <span>Друго (свободен текст)…</span>
            </label>
            {customMode && (
              <Input
                value={customText}
                onChange={(e) => updateCustom(e.target.value)}
                placeholder="Въведете собствен отговор"
                className="mt-1"
              />
            )}
          </div>
          {help}
        </div>
      );
    }

    case "boolean": {
      const isYes = value === true;
      const isNo = value === false;
      return (
        <div className={`space-y-2 rounded-md border p-3 ${invalid ? "border-destructive" : ""}`}>
          <div className="space-y-0.5">
            {labelEl}
            {help}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onChange(true)}
              className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                isYes
                  ? "border-gold bg-gold/10 text-foreground"
                  : "border-border bg-card/40 text-muted-foreground hover:border-gold/50 hover:text-foreground"
              }`}
              aria-pressed={isYes}
            >
              Да
            </button>
            <button
              type="button"
              onClick={() => onChange(false)}
              className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors ${
                isNo
                  ? "border-gold bg-gold/10 text-foreground"
                  : "border-border bg-card/40 text-muted-foreground hover:border-gold/50 hover:text-foreground"
              }`}
              aria-pressed={isNo}
            >
              Не
            </button>
          </div>
        </div>
      );
    }

    case "party_list": {
      const rows = parseParties((value as string) ?? "");
      return (
        <div className="space-y-1.5">
          {labelEl}
          <PartyListEditor
            rows={rows}
            onChange={(next) => onChange(serializeParties(next))}
            addLabel={`Добави ${q.label.toLowerCase()}`}
            contacts={contacts}
          />
          {help}
        </div>
      );
    }


    case "signature":
      return (
        <div className="space-y-1.5">
          {labelEl}
          <Input
            id={id}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder="Подпис (име на подписващия)"
            className={errorRing}
          />
          {help}
        </div>
      );

    default:
      return null;
  }
}
