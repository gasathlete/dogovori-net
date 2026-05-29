import { useMemo } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, UserPlus } from "lucide-react";

export type PartyType = "ФЛ" | "ЮЛ" | "ЕТ";
const TYPES: PartyType[] = ["ФЛ", "ЮЛ", "ЕТ"];

export type PartyRow = { name: string; type: PartyType };

type Contact = { id: string; name: string; type?: string };

interface Props {
  rows: PartyRow[];
  onChange: (rows: PartyRow[]) => void;
  contacts?: Contact[];
  placeholder?: string;
  addLabel?: string;
}

/** Сериализира редовете към текст — по един на ред, във формат „Име — Тип“. */
export function serializeParties(rows: PartyRow[]): string {
  return rows
    .filter((r) => r.name.trim())
    .map((r) => `${r.name.trim()}${r.type ? ` — ${r.type}` : ""}`)
    .join("\n");
}

/** Парсва редове от текст. Приема и стария формат (само име). */
export function parseParties(raw: string): PartyRow[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.*?)\s+[—\-|]\s+(ФЛ|ЮЛ|ЕТ)\s*$/);
      if (m) return { name: m[1].trim(), type: m[2] as PartyType };
      return { name: line, type: "ЮЛ" as PartyType };
    });
}

export function PartyListEditor({ rows, onChange, contacts = [], placeholder, addLabel = "Добави страна" }: Props) {
  const list = useMemo<PartyRow[]>(() => (rows.length ? rows : [{ name: "", type: "ЮЛ" }]), [rows]);

  const update = (idx: number, patch: Partial<PartyRow>) =>
    onChange(list.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const add = () => onChange([...list, { name: "", type: "ЮЛ" }]);
  const remove = (idx: number) => onChange(list.filter((_, i) => i !== idx));

  const pickContact = (idx: number, contactId: string) => {
    const c = contacts.find((x) => x.id === contactId);
    if (!c) return;
    const mapped: PartyType = c.type === "individual" ? "ФЛ" : "ЮЛ";
    update(idx, { name: c.name, type: mapped });
  };

  return (
    <div className="space-y-2">
      {list.map((row, idx) => (
        <div
          key={idx}
          className="grid grid-cols-1 gap-2 rounded-lg border border-border/50 bg-card/30 p-2.5 sm:grid-cols-[1fr_120px_auto]"
        >
          <Input
            value={row.name}
            onChange={(e) => update(idx, { name: e.target.value })}
            placeholder={placeholder ?? "Име / Фирма, ЕИК…"}
            className="bg-input/60 text-sm"
          />
          <Select value={row.type} onValueChange={(v) => update(idx, { type: v as PartyType })}>
            <SelectTrigger className="h-10 bg-input/60 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {TYPES.map((t) => (
                <SelectItem key={t} value={t}>
                  {t === "ФЛ" ? "Физическо лице (ФЛ)" : t === "ЮЛ" ? "Юридическо лице (ЮЛ)" : "ЕТ / Самоосигуряващо (ЕТ)"}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => remove(idx)}
            disabled={list.length <= 1}
            className="h-10 w-10 text-muted-foreground hover:text-destructive disabled:opacity-30"
            aria-label="Премахни"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={add}
          className="border-dashed border-gold/40 text-gold hover:bg-gold/10 hover:text-gold"
        >
          <Plus className="mr-1.5 h-3.5 w-3.5" />
          {addLabel}
        </Button>
        {contacts.length > 0 && (
          <Select onValueChange={(v) => pickContact(list.length - 1, v)}>
            <SelectTrigger className="h-9 w-auto min-w-[210px] bg-input/60 text-xs">
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
        )}
      </div>
    </div>
  );
}
