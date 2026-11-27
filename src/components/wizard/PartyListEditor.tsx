import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, UserPlus } from "@/icons";

export type PartyType = "ФЛ" | "ЮЛ" | "ЕТ";
const TYPES: { id: PartyType; label: string; full: string }[] = [
  { id: "ФЛ", label: "ФЛ", full: "Физическо лице" },
  { id: "ЮЛ", label: "ЮЛ", full: "Юридическо лице" },
  { id: "ЕТ", label: "ЕТ", full: "ЕТ / Самоосигуряващо" },
];

export type PartyRow = { name: string; type: PartyType };

type Contact = { id: string; name: string; type?: string };

interface Props {
  rows: PartyRow[];
  onChange: (rows: PartyRow[]) => void;
  contacts?: Contact[];
  placeholder?: string;
  addLabel?: string;
}

const ANON_NAME = "(име не е посочено)";

export function serializeParties(rows: PartyRow[]): string {
  return rows
    .filter((r) => r.name.trim() || r.type)
    .map((r) => {
      const name = r.name.trim() || ANON_NAME;
      return `${name}${r.type ? ` — ${r.type}` : ""}`;
    })
    .join("\n");
}

export function parseParties(raw: string): PartyRow[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean)
    .map((line) => {
      const m = line.match(/^(.*?)\s+[—\-|]\s+(ФЛ|ЮЛ|ЕТ)\s*$/);
      if (m) {
        const rawName = m[1].trim();
        return { name: rawName === ANON_NAME ? "" : rawName, type: m[2] as PartyType };
      }
      return { name: line, type: "ЮЛ" as PartyType };
    });
}

export function PartyListEditor({ rows, onChange, contacts = [], placeholder, addLabel = "Добави страна" }: Props) {
  const initial: PartyRow[] = rows.length ? rows : [{ name: "", type: "ЮЛ" }];
  const [list, setList] = useState<PartyRow[]>(initial);
  const lastSerializedRef = useRef<string>(serializeParties(initial));

  // Sync from incoming `rows` only when the upstream serialized value differs
  // from what we last emitted — otherwise we'd wipe in-progress empty rows
  // (since serializeParties drops rows with empty `name`).
  useEffect(() => {
    const incoming = serializeParties(rows);
    if (incoming !== lastSerializedRef.current) {
      setList(rows.length ? rows : [{ name: "", type: "ЮЛ" }]);
      lastSerializedRef.current = incoming;
    }
  }, [rows]);

  const commit = (next: PartyRow[]) => {
    setList(next);
    const serialized = serializeParties(next);
    lastSerializedRef.current = serialized;
    onChange(next);
  };

  const update = (idx: number, patch: Partial<PartyRow>) =>
    commit(list.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  const add = () => commit([...list, { name: "", type: "ЮЛ" }]);
  const remove = (idx: number) => commit(list.filter((_, i) => i !== idx));

  const pickContact = (contactId: string) => {
    const c = contacts.find((x) => x.id === contactId);
    if (!c) return;
    const mapped: PartyType = c.type === "individual" ? "ФЛ" : "ЮЛ";
    const emptyIdx = list.findIndex((r) => !r.name.trim());
    if (emptyIdx >= 0) update(emptyIdx, { name: c.name, type: mapped });
    else commit([...list, { name: c.name, type: mapped }]);
  };

  return (
    <div className="space-y-2">
      <div className="rounded-lg border border-gold/20 bg-gold/5 p-2.5 text-[11px] leading-snug text-muted-foreground">
        <strong className="text-foreground">Не събираме лични данни.</strong> Изберете само вида на страната.
        Имена, ЕГН/ЕИК, адреси и др. ще попълните локално във вашия документ след сваляне —
        Договори.нет не съхранява и не изпраща тези данни.
      </div>
      {list.map((row, idx) => (
        <div key={idx} className="flex items-center justify-between gap-2 rounded-lg border border-border/50 bg-card/30 p-2.5">
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-muted-foreground">Страна {idx + 1}:</span>
            <div className="inline-flex gap-1 rounded-md border border-border/60 bg-card/40 p-0.5">
              {TYPES.map((t) => {
                const active = row.type === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => update(idx, { type: t.id })}
                    title={t.full}
                    className={
                      "rounded px-2.5 py-1 text-[11px] font-semibold transition-colors " +
                      (active
                        ? "bg-gold text-navy shadow-sm"
                        : "text-muted-foreground hover:text-foreground")
                    }
                  >
                    {t.label}
                  </button>
                );
              })}
            </div>
            <span className="hidden text-[10px] italic text-muted-foreground sm:inline">
              {TYPES.find((t) => t.id === row.type)?.full}
            </span>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            onClick={() => remove(idx)}
            disabled={list.length <= 1}
            className="h-8 w-8 text-muted-foreground hover:text-destructive disabled:opacity-30"
            aria-label="Премахни"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ))}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={add}
        className="h-8 border-dashed border-gold/40 text-xs text-gold hover:bg-gold/10 hover:text-gold"
      >
        <Plus className="mr-1 h-3.5 w-3.5" />
        {addLabel}
      </Button>
    </div>
  );
}
