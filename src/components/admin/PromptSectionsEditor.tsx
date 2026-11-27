import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { ChevronDown, ChevronRight, ArrowUp, ArrowDown, Trash2, Plus } from "@/icons";

export type PromptSection = {
  id?: string;
  section_key: string;
  title: string;
  content: string;
  order_idx: number;
  enabled: boolean;
};

interface Props {
  sections: PromptSection[];
  onChange: (next: PromptSection[]) => void;
}

const SUGGESTED_SECTIONS: { key: string; title: string }[] = [
  { key: "role", title: "РОЛЯ" },
  { key: "language", title: "ЕЗИК И СТИЛ" },
  { key: "law", title: "ПРИЛОЖИМО ПРАВО" },
  { key: "output", title: "ИЗХОДЕН ФОРМАТ" },
  { key: "structure", title: "СТРУКТУРА" },
  { key: "rules", title: "ЗАДЪЛЖИТЕЛНИ ПРАВИЛА" },
  { key: "risk", title: "РИСК АНАЛИЗ" },
  { key: "forbidden", title: "ЗАБРАНИ" },
  { key: "tone", title: "ТОН / ПРИМЕРИ" },
];

export function PromptSectionsEditor({ sections, onChange }: Props) {
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(sections.slice(0, 1).map((s) => s.section_key)));

  const toggleOpen = (key: string) => {
    const n = new Set(openIds);
    n.has(key) ? n.delete(key) : n.add(key);
    setOpenIds(n);
  };

  const update = (idx: number, patch: Partial<PromptSection>) => {
    const next = sections.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onChange(next);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= sections.length) return;
    const next = [...sections];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next.map((s, i) => ({ ...s, order_idx: i })));
  };

  const remove = (idx: number) => {
    if (!confirm("Изтриване на секцията?")) return;
    onChange(sections.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order_idx: i })));
  };

  const addSection = (preset?: { key: string; title: string }) => {
    const base = preset ?? { key: `section_${sections.length + 1}`, title: "НОВА СЕКЦИЯ" };
    // Avoid duplicate keys
    let key = base.key;
    let n = 2;
    while (sections.some((s) => s.section_key === key)) key = `${base.key}_${n++}`;
    onChange([
      ...sections,
      { section_key: key, title: base.title, content: "", order_idx: sections.length, enabled: true },
    ]);
    setOpenIds(new Set([...openIds, key]));
  };

  const usedKeys = new Set(sections.map((s) => s.section_key));
  const availablePresets = SUGGESTED_SECTIONS.filter((p) => !usedKeys.has(p.key));

  return (
    <div className="space-y-2">
      {sections.length === 0 && (
        <div className="rounded border border-dashed p-4 text-center text-sm text-muted-foreground">
          Все още няма секции. Добавете първа отдолу.
        </div>
      )}

      {sections.map((s, idx) => {
        const open = openIds.has(s.section_key);
        return (
          <div key={s.section_key + idx} className={`rounded-lg border ${s.enabled ? "" : "opacity-60"}`}>
            <div className="flex items-center gap-2 border-b bg-muted/30 px-2 py-1.5">
              <button
                type="button"
                onClick={() => toggleOpen(s.section_key)}
                className="flex flex-1 items-center gap-1.5 text-left"
              >
                {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                <span className="text-xs font-mono text-muted-foreground">{idx + 1}.</span>
                <span className="text-sm font-medium">{s.title || s.section_key}</span>
                <span className="text-xs text-muted-foreground">({s.content.length} симв.)</span>
              </button>
              <Switch checked={s.enabled} onCheckedChange={(v) => update(idx, { enabled: v })} />
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(idx, -1)} disabled={idx === 0}>
                <ArrowUp className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => move(idx, 1)} disabled={idx === sections.length - 1}>
                <ArrowDown className="h-3.5 w-3.5" />
              </Button>
              <Button size="icon" variant="ghost" className="h-7 w-7 text-destructive" onClick={() => remove(idx)}>
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>

            {open && (
              <div className="space-y-2 p-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input
                    placeholder="Заглавие на секцията"
                    value={s.title}
                    onChange={(e) => update(idx, { title: e.target.value })}
                  />
                  <Input
                    placeholder="ключ (за вътрешна употреба)"
                    value={s.section_key}
                    onChange={(e) => update(idx, { section_key: e.target.value })}
                    className="font-mono text-xs"
                  />
                </div>
                <Textarea
                  rows={Math.max(6, Math.min(20, s.content.split("\n").length + 1))}
                  value={s.content}
                  onChange={(e) => update(idx, { content: e.target.value })}
                  className="font-mono text-xs"
                  placeholder="Съдържание на секцията..."
                />
              </div>
            )}
          </div>
        );
      })}

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <span className="text-xs text-muted-foreground">Добави:</span>
        {availablePresets.map((p) => (
          <Button key={p.key} size="sm" variant="outline" onClick={() => addSection(p)}>
            <Plus className="mr-1 h-3 w-3" /> {p.title}
          </Button>
        ))}
        <Button size="sm" variant="ghost" onClick={() => addSection()}>
          <Plus className="mr-1 h-3 w-3" /> Друга
        </Button>
      </div>
    </div>
  );
}

export function assembleSections(sections: PromptSection[]): string {
  return sections
    .filter((s) => s.enabled && (s.content.trim().length > 0 || s.title.trim().length > 0))
    .map((s) => `# ${s.title}\n${s.content}`.trimEnd())
    .join("\n\n");
}
