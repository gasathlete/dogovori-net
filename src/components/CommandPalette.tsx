import { useEffect, useState, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { FileText, ArrowRight, Search, FolderOpen, Sparkles } from "lucide-react";
import { allTemplates, type TemplateEntry } from "@/lib/templateIndex";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isModK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k";
      const isFallback = (e.metaKey || e.ctrlKey) && e.key === "/";
      if (isModK || isFallback) {
        e.preventDefault();
        setOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", onKey);

    // Allow header / hero CTAs to open the palette programmatically.
    const onOpen = () => setOpen(true);
    window.addEventListener("dogovori:open-command", onOpen as EventListener);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("dogovori:open-command", onOpen as EventListener);
    };
  }, []);

  const templates = useMemo<TemplateEntry[]>(
    () => (open ? allTemplates().slice(0, 200) : []),
    [open],
  );

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Търси шаблон, документ или действие…" />
      <CommandList>
        <CommandEmpty>Няма съвпадения.</CommandEmpty>

        <CommandGroup heading="Действия">
          <CommandItem onSelect={() => go("/build")}>
            <Sparkles className="mr-2 h-4 w-4 text-gold" />
            Изготви документ (AI помощник)
          </CommandItem>
          <CommandItem onSelect={() => go("/catalog")}>
            <Search className="mr-2 h-4 w-4 text-gold" />
            Разгледай каталога
          </CommandItem>
          <CommandItem onSelect={() => go("/account")}>
            <FolderOpen className="mr-2 h-4 w-4 text-gold" />
            Моите документи
          </CommandItem>
          <CommandItem onSelect={() => go("/plans")}>
            <ArrowRight className="mr-2 h-4 w-4 text-gold" />
            Цени и абонаменти
          </CommandItem>
        </CommandGroup>

        {templates.length > 0 && (
          <>
            <CommandSeparator />
            <CommandGroup heading="Шаблони">
              {templates.map((t) => (
                <CommandItem
                  key={t.slug}
                  value={`${t.doc.name} ${t.category.title}`}
                  onSelect={() => go(`/shablon/${t.slug}`)}
                >
                  <FileText className="mr-2 h-4 w-4 text-muted-foreground" />
                  <span className="flex-1 truncate">{t.doc.name}</span>
                  <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                    {t.category.title}
                  </span>
                </CommandItem>
              ))}
            </CommandGroup>
          </>
        )}
      </CommandList>
    </CommandDialog>
  );
}
