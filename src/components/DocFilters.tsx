import { useEffect, useMemo, useState } from "react";
import { Tag as TagIcon, Bookmark, BookmarkPlus, Search, X, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toast } from "sonner";

export type DocFilterState = {
  search: string;
  tags: string[];
};

export type SavedView = {
  id: string;
  name: string;
  state: DocFilterState;
};

const STORAGE_KEY = "dgv:saved-doc-views:v1";

export function loadSavedViews(): SavedView[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as SavedView[]) : [];
  } catch { return []; }
}

function persist(views: SavedView[]) {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(views));
}

export function DocFiltersBar({
  state, onChange, allTags,
}: {
  state: DocFilterState;
  onChange: (next: DocFilterState) => void;
  allTags: string[];
}) {
  const [views, setViews] = useState<SavedView[]>(loadSavedViews);
  const [saveOpen, setSaveOpen] = useState(false);
  const [name, setName] = useState("");

  const saveView = () => {
    const v: SavedView = { id: crypto.randomUUID(), name: name.trim() || "Без име", state };
    const next = [...views, v];
    setViews(next);
    persist(next);
    setName("");
    setSaveOpen(false);
    toast.success("Изгледът е запазен");
  };

  const removeView = (id: string) => {
    const next = views.filter((v) => v.id !== id);
    setViews(next);
    persist(next);
  };

  const toggleTag = (tag: string) => {
    const has = state.tags.includes(tag);
    onChange({ ...state, tags: has ? state.tags.filter((t) => t !== tag) : [...state.tags, tag] });
  };

  const active = state.search.trim() !== "" || state.tags.length > 0;

  return (
    <div className="mb-4 rounded-xl border border-border/60 bg-card/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={state.search}
            onChange={(e) => onChange({ ...state, search: e.target.value })}
            placeholder="Търсене по заглавие или етикет…"
            className="h-9 pl-7 text-sm"
          />
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-9 gap-1.5">
              <Bookmark className="h-3.5 w-3.5" /> Изгледи {views.length > 0 && <span className="text-[10px] text-muted-foreground">({views.length})</span>}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel>Бързи изгледи</DropdownMenuLabel>
            {views.length === 0 && (
              <div className="px-2 py-3 text-xs text-muted-foreground">Все още няма запазени.</div>
            )}
            {views.map((v) => (
              <DropdownMenuItem key={v.id} className="flex items-center justify-between gap-2" onSelect={(e) => { e.preventDefault(); onChange(v.state); }}>
                <span className="truncate text-xs">{v.name}</span>
                <button onClick={(e) => { e.stopPropagation(); removeView(v.id); }} className="text-muted-foreground hover:text-destructive">
                  <X className="h-3 w-3" />
                </button>
              </DropdownMenuItem>
            ))}
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={(e) => { e.preventDefault(); setSaveOpen(true); }} disabled={!active}>
              <BookmarkPlus className="mr-2 h-3.5 w-3.5" /> Запази текущия изглед
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        {active && (
          <Button variant="ghost" size="sm" className="h-9" onClick={() => onChange({ search: "", tags: [] })}>
            <X className="mr-1 h-3 w-3" /> Изчисти
          </Button>
        )}
      </div>

      {allTags.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 pr-1 text-[11px] uppercase tracking-wider text-muted-foreground">
            <TagIcon className="h-3 w-3" /> Етикети:
          </span>
          {allTags.map((t) => {
            const on = state.tags.includes(t);
            return (
              <button
                key={t}
                onClick={() => toggleTag(t)}
                className={`rounded-full border px-2 py-0.5 text-[11px] transition-colors ${
                  on
                    ? "border-gold bg-gold/15 text-gold"
                    : "border-border/60 bg-card/60 text-muted-foreground hover:border-gold/40 hover:text-foreground"
                }`}
              >
                #{t}
              </button>
            );
          })}
        </div>
      )}

      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>Запазване на изглед</DialogTitle></DialogHeader>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder='напр. „Активни договори с Иван"' maxLength={60} autoFocus />
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveOpen(false)}>Отказ</Button>
            <Button onClick={saveView}>Запази</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export function DocTagsEditor({
  value, onChange,
}: {
  value: string[];
  onChange: (next: string[]) => void;
}) {
  const [input, setInput] = useState("");
  const add = () => {
    const t = input.trim().toLowerCase().replace(/[#\s]+/g, "-").slice(0, 30);
    if (!t) return;
    if (value.includes(t)) { setInput(""); return; }
    onChange([...value, t]);
    setInput("");
  };
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {value.length === 0 && <span className="text-xs text-muted-foreground">Без етикети</span>}
        {value.map((t) => (
          <span key={t} className="inline-flex items-center gap-1 rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[11px] text-gold">
            #{t}
            <button onClick={() => onChange(value.filter((x) => x !== t))} aria-label="Премахни">
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-2">
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); add(); } }}
          placeholder="нов етикет"
          maxLength={30}
          className="h-8 text-xs"
        />
        <Button size="sm" variant="outline" className="h-8" onClick={add}>+ Добави</Button>
      </div>
    </div>
  );
}
