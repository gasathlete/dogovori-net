import { useEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Trash2, UserPlus } from "lucide-react";

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
      {list.map((row, idx) => (
        <div key={idx} className="space-y-1.5 rounded-lg border border-border/50 bg-card/30 p-2.5">
          <Input
            value={row.name}
            onChange={(e) => update(idx, { name: e.target.value })}
            placeholder={placeholder ?? "Име / Фирма, ЕИК… (по избор)"}
            className="h-9 bg-input/60 text-sm"
          />
          <p className="-mt-1 text-[10px] text-muted-foreground">
            Може да оставите празно — но изберете тип по-долу.
          </p>
          <div className="flex items-center justify-between gap-2">
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
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-1.5">
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
        {contacts.length > 0 ? (
          <Select onValueChange={pickContact}>
            <SelectTrigger className="h-8 w-auto gap-1 bg-input/60 px-2 text-xs">
              <UserPlus className="h-3.5 w-3.5 text-gold" />
              <SelectValue placeholder="От контрагенти" />
            </SelectTrigger>
            <SelectContent>
              {contacts.map((c) => (
                <SelectItem key={c.id} value={c.id}>
                  {c.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <a
            href={`/account?tab=contacts&redirect=${encodeURIComponent(typeof window !== "undefined" ? window.location.pathname + window.location.search : "")}`}
            className="inline-flex h-8 items-center gap-1 rounded-md border border-dashed border-gold/40 px-2 text-xs text-gold hover:bg-gold/10"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Добави контрагент
          </a>
        )}
      </div>
    </div>
  );
}
