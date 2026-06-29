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
import * as Icons from "lucide-react";
import {
  FileText,
  ArrowRight,
  Search,
  FolderOpen,
  Sparkles,
  Layers,
  BookOpen,
  Calculator as CalcIcon,
  CreditCard,
  Bell,
  Wrench,
  User as UserIcon,
  Briefcase,
} from "lucide-react";
import { allTemplates, type TemplateEntry } from "@/lib/templateIndex";
import { CALCULATORS } from "@/data/calculators";
import { supabase } from "@/integrations/supabase/client";

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

  // User-owned records: fetched on open. Lightweight (titles only).
  const [myDocs, setMyDocs] = useState<Array<{ id: string; title: string }>>([]);
  const [myContacts, setMyContacts] = useState<Array<{ id: string; name: string }>>([]);
  const [myDeals, setMyDeals] = useState<Array<{ id: string; title: string }>>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) return;
      const [docs, contacts, deals] = await Promise.all([
        supabase.from("saved_documents").select("id,title").order("updated_at", { ascending: false }).limit(25),
        supabase.from("contacts").select("id,name").is("deleted_at", null).order("updated_at", { ascending: false }).limit(25),
        supabase.from("deals").select("id,title").order("updated_at", { ascending: false }).limit(25),
      ]);
      if (cancelled) return;
      setMyDocs((docs.data ?? []) as any);
      setMyContacts((contacts.data ?? []) as any);
      setMyDeals((deals.data ?? []) as any);
    })();
    return () => { cancelled = true; };
  }, [open]);

  const go = (path: string) => {
    setOpen(false);
    navigate(path);
  };

  return (
    <CommandDialog open={open} onOpenChange={setOpen}>
      <CommandInput placeholder="Търси шаблон, инструмент, документ или действие…" />
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
          <CommandItem onSelect={() => go("/komplekti")}>
            <Layers className="mr-2 h-4 w-4 text-gold" />
            Комплекти документи
          </CommandItem>
          <CommandItem onSelect={() => go("/tools")}>
            <Wrench className="mr-2 h-4 w-4 text-gold" />
            Всички инструменти
          </CommandItem>
          <CommandItem onSelect={() => go("/blog")}>
            <BookOpen className="mr-2 h-4 w-4 text-gold" />
            Блог
          </CommandItem>
          <CommandItem onSelect={() => go("/account")}>
            <FolderOpen className="mr-2 h-4 w-4 text-gold" />
            Моите документи
          </CommandItem>
          <CommandItem onSelect={() => go("/account?tab=notifications")}>
            <Bell className="mr-2 h-4 w-4 text-gold" />
            Известия
          </CommandItem>
          <CommandItem onSelect={() => go("/account?tab=subscription")}>
            <CreditCard className="mr-2 h-4 w-4 text-gold" />
            Абонамент и плащания
          </CommandItem>
          <CommandItem onSelect={() => go("/plans")}>
            <ArrowRight className="mr-2 h-4 w-4 text-gold" />
            Цени и абонаменти
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Инструменти">
          {CALCULATORS.map((c) => {
            const Icon = (Icons as any)[c.icon] ?? CalcIcon;
            return (
              <CommandItem
                key={c.slug}
                value={`${c.shortTitle} ${c.title ?? ""} ${c.description ?? ""}`}
                onSelect={() => go(`/tools/${c.slug}`)}
              >
                <Icon className="mr-2 h-4 w-4 text-gold/80" />
                <span className="flex-1 truncate">{c.shortTitle}</span>
                <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground">
                  Калкулатор
                </span>
              </CommandItem>
            );
          })}
          <CommandItem value="всички инструменти калкулатори" onSelect={() => go("/tools")}>
            <Wrench className="mr-2 h-4 w-4 text-gold" />
            <span className="flex-1">Виж всички инструменти</span>
            <ArrowRight className="ml-2 h-3.5 w-3.5 text-gold" />
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

