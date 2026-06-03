/**
 * Renders a single QuestionNode from the graph engine. Pure, presentational.
 * Supports text/longtext/number/money/date/select/multiselect/boolean.
 * `party_list` is rendered as a simple "Name | Type" textarea — the legacy
 * PartyListEditor can be wired in later without touching the engine.
 */

import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { PartyListEditor, parseParties, serializeParties } from "./PartyListEditor";
import type { ResolvedQuestion } from "@/lib/questionGraph";


type Props = {
  q: ResolvedQuestion;
  value: unknown;
  onChange: (v: unknown) => void;
  invalid?: boolean;
};

export function GraphQuestionField({ q, value, onChange, invalid }: Props) {
  const id = `q-${q.id}`;
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

    case "select":
      return (
        <div className="space-y-1.5">
          {labelEl}
          <Select value={(value as string) ?? ""} onValueChange={onChange}>
            <SelectTrigger id={id} className={errorRing}>
              <SelectValue placeholder="Изберете…" />
            </SelectTrigger>
            <SelectContent>
              {q.options?.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {help}
        </div>
      );

    case "multiselect": {
      const arr = Array.isArray(value) ? (value as string[]) : [];
      const toggle = (v: string) => {
        if (arr.includes(v)) onChange(arr.filter((x) => x !== v));
        else onChange([...arr, v]);
      };
      return (
        <div className="space-y-1.5">
          {labelEl}
          <div className="grid gap-2 rounded-md border p-3">
            {q.options?.map((o) => (
              <label key={o.value} className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox checked={arr.includes(o.value)} onCheckedChange={() => toggle(o.value)} />
                <span>{o.label}</span>
              </label>
            ))}
          </div>
          {help}
        </div>
      );
    }

    case "boolean":
      return (
        <div className="flex items-start justify-between gap-3 rounded-md border p-3">
          <div className="space-y-0.5">
            {labelEl}
            {help}
          </div>
          <Switch checked={Boolean(value)} onCheckedChange={(v) => onChange(v)} />
        </div>
      );

    case "party_list":
      return (
        <div className="space-y-1.5">
          {labelEl}
          <Textarea
            id={id}
            value={(value as string) ?? ""}
            onChange={(e) => onChange(e.target.value)}
            placeholder={"Един ред на страна: Име | Тип (Физическо/Юридическо лице)"}
            rows={3}
            className={errorRing}
          />
          {help}
        </div>
      );

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
