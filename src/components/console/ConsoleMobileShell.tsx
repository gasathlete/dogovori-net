import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useConsoleStore, type ConsoleSection, type ConsoleTab } from "@/hooks/useConsoleStore";
import { ConsoleListColumn } from "./ConsoleListColumn";
import { ConsoleCanvas } from "./ConsoleCanvas";
import { AssistantChat } from "@/components/AssistantChat";
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  FileUp,
  Library,
  Users,
  ShieldAlert,
  PenSquare,
  Bird,
  Package,
  ChevronRight,
  X,
  Pin,
  PinOff,
  MoreHorizontal,
  Wand2,
} from "@/icons";
import { cn } from "@/lib/utils";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";

type Panel = "nav" | "list" | "work";

const NAV_ITEMS: { id: ConsoleSection; label: string; icon: any; desc: string }[] = [
  { id: "assistant", label: "DogovaryAI", icon: Bird, desc: "AI асистент" },
  { id: "dashboard", label: "Табло", icon: LayoutDashboard, desc: "Обобщен преглед" },
  { id: "deals", label: "Сделки", icon: Briefcase, desc: "Активни преговори" },
  { id: "documents", label: "Документи", icon: FileText, desc: "Запазени договори" },
  { id: "uploaded", label: "Качени", icon: FileUp, desc: "PDF и DOCX" },
  { id: "templates", label: "Шаблони", icon: Library, desc: "Каталог" },
  { id: "kits", label: "Комплекти", icon: Package, desc: "Пакети документи" },
  { id: "clients", label: "Клиенти", icon: Users, desc: "Контакти" },
  { id: "analyses", label: "Анализи", icon: ShieldAlert, desc: "Риск оценки" },
  { id: "signing", label: "Подписи", icon: PenSquare, desc: "Е-подпис" },
];

const TAB_ICONS: Record<string, any> = {
  dashboard: LayoutDashboard,
  deal: Briefcase,
  document: FileText,
  uploaded: FileUp,
  template: Library,
  client: Users,
  analysis: ShieldAlert,
  wizard: Wand2,
  signing: PenSquare,
  kit: Package,
};

export function ConsoleMobileShell() {
  const { state, setSection, activate, close, togglePin } = useConsoleStore();
  const navigate = useNavigate();
  const [panel, setPanel] = useState<Panel>("nav");
  const [tabsOpen, setTabsOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement | null>(null);
  const scrollDebounce = useRef<number | null>(null);
  const isAssistant = state.section === "assistant";

  const prevSection = useRef(state.section);
  const prevActive = useRef(state.activeId);

  // Section change → jump to list panel
  useEffect(() => {
    if (prevSection.current !== state.section) {
      prevSection.current = state.section;
      setPanel("list");
    }
  }, [state.section]);

  // Active tab change → jump to work panel
  useEffect(() => {
    if (prevActive.current !== state.activeId && state.activeId) {
      prevActive.current = state.activeId;
      setPanel("work");
    }
  }, [state.activeId]);

  // Sync horizontal scroll position to panel state
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el) return;
    const idx = panel === "nav" ? 0 : panel === "list" ? 1 : 2;
    const target = idx * el.clientWidth;
    if (Math.abs(el.scrollLeft - target) > 2) {
      el.scrollTo({ left: target, behavior: "smooth" });
    }
  }, [panel]);

  const onScroll = () => {
    const el = scrollerRef.current;
    if (!el) return;
    if (scrollDebounce.current) window.clearTimeout(scrollDebounce.current);
    scrollDebounce.current = window.setTimeout(() => {
      const idx = Math.round(el.scrollLeft / el.clientWidth);
      const next: Panel = idx === 0 ? "nav" : idx === 1 ? "list" : "work";
      setPanel((prev) => (prev === next ? prev : next));
    }, 60);
  };

  const handleNav = (id: ConsoleSection) => {
    navigate(`/console/${id}`);
    setSection(id);
    setPanel("list");
  };

  const activeTab = state.tabs.find((t) => t.id === state.activeId) ?? null;
  const dirtyCount = state.tabs.filter((t) => t.dirty).length;

  return (
    <div className="flex h-full min-h-0 flex-1 flex-col overflow-hidden">
      <div
        ref={scrollerRef}
        onScroll={onScroll}
        className="flex flex-1 snap-x snap-mandatory overflow-x-auto overflow-y-hidden [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {/* Panel 1 — Nav */}
        <section
          aria-label="Раздели"
          className="relative w-screen shrink-0 snap-start overflow-y-auto bg-background"
        >
          <div className="border-b border-border/60 px-4 py-3">
            <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
              Работно пространство
            </h2>
          </div>
          <nav className="flex flex-col gap-0.5 p-2">
            {NAV_ITEMS.map((it) => {
              const Icon = it.icon;
              const active = state.section === it.id;
              return (
                <button
                  key={it.id}
                  type="button"
                  onClick={() => handleNav(it.id)}
                  className={cn(
                    "flex min-h-[56px] w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors",
                    active
                      ? "bg-gold/10 text-foreground"
                      : "text-foreground/85 hover:bg-muted/40 active:bg-muted/50",
                  )}
                  aria-current={active ? "page" : undefined}
                >
                  <span
                    className={cn(
                      "flex h-10 w-10 shrink-0 items-center justify-center rounded-md",
                      active
                        ? "bg-gold/20 text-gold"
                        : "bg-muted/40 text-muted-foreground",
                    )}
                  >
                    <Icon className="h-4.5 w-4.5" />
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col">
                    <span className="truncate text-[14px] font-medium leading-tight">
                      {it.label}
                    </span>
                    <span className="truncate text-[11px] text-muted-foreground">
                      {it.desc}
                    </span>
                  </span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              );
            })}
          </nav>
        </section>

        {/* Panel 2 — List */}
        <section
          aria-label="Списък"
          className="w-screen shrink-0 snap-start overflow-hidden bg-background"
        >
          {isAssistant ? (
            <div className="flex h-full flex-col p-2">
              <AssistantChat embedded />
            </div>
          ) : (
            <ConsoleListColumn />
          )}
        </section>

        {/* Panel 3 — Work */}
        <section
          aria-label="Работа"
          className="flex w-screen shrink-0 snap-start flex-col overflow-hidden bg-background"
        >
          <MobileTabDock
            active={activeTab}
            count={state.tabs.length}
            onOpen={() => setTabsOpen(true)}
          />
          <div className="flex-1 overflow-hidden">
            {activeTab ? (
              <ConsoleCanvas />
            ) : (
              <div className="flex h-full flex-col items-center justify-center gap-2 p-6 text-center">
                <p className="text-sm font-medium text-foreground">
                  Няма отворен таб
                </p>
                <p className="text-xs text-muted-foreground">
                  Изберете елемент от „Списък" за да отворите работно поле.
                </p>
                <button
                  type="button"
                  onClick={() => setPanel("list")}
                  className="mt-2 min-h-[44px] rounded-md border border-gold/40 bg-gold/10 px-4 py-2 text-xs font-semibold text-gold"
                >
                  Към списък
                </button>
              </div>
            )}
          </div>
        </section>
      </div>

      {/* Bottom segmented control */}
      <div
        className="grid shrink-0 grid-cols-3 border-t border-border/60 bg-card/95 backdrop-blur"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        {(["nav", "list", "work"] as Panel[]).map((p) => {
          const activeP = panel === p;
          const label = p === "nav" ? "Раздели" : p === "list" ? "Списък" : "Работа";
          return (
            <button
              key={p}
              type="button"
              onClick={() => setPanel(p)}
              aria-pressed={activeP}
              className={cn(
                "relative flex min-h-[48px] items-center justify-center gap-1.5 text-[12px] font-medium transition-colors",
                activeP ? "text-gold" : "text-muted-foreground",
              )}
            >
              <span>{label}</span>
              {p === "work" && dirtyCount > 0 && (
                <span className="inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-gold px-1 text-[10px] font-bold text-navy">
                  {dirtyCount}
                </span>
              )}
              <span
                aria-hidden
                className={cn(
                  "absolute inset-x-6 top-0 h-0.5 rounded-b bg-gold transition-opacity",
                  activeP ? "opacity-100" : "opacity-0",
                )}
              />
            </button>
          );
        })}
      </div>

      {/* Tabs bottom sheet */}
      <Sheet open={tabsOpen} onOpenChange={setTabsOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[75dvh] rounded-t-2xl p-0"
        >
          <SheetHeader className="border-b border-border/60 p-4 text-left">
            <SheetTitle className="text-sm">
              Отворени табове ({state.tabs.length})
            </SheetTitle>
          </SheetHeader>
          <ul className="max-h-[calc(75dvh-72px)] divide-y divide-border/40 overflow-y-auto">
            {state.tabs.map((t) => {
              const Icon = TAB_ICONS[t.kind] ?? FileText;
              const isActive = t.id === state.activeId;
              return (
                <li key={t.id} className="flex items-center gap-1 px-2 py-1">
                  <button
                    type="button"
                    onClick={() => {
                      activate(t.id);
                      setTabsOpen(false);
                      setPanel("work");
                    }}
                    className={cn(
                      "flex min-h-[48px] flex-1 items-center gap-2 rounded-md px-2 text-left",
                      isActive ? "bg-gold/10" : "hover:bg-muted/40",
                    )}
                  >
                    <Icon
                      className={cn(
                        "h-4 w-4 shrink-0",
                        isActive ? "text-gold" : "text-muted-foreground",
                      )}
                    />
                    {t.pinned && (
                      <Pin className="h-3 w-3 shrink-0 text-gold" aria-hidden />
                    )}
                    <span className="truncate text-[13px] text-foreground">
                      {t.title}
                    </span>
                    {t.dirty && (
                      <span
                        className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold"
                        aria-hidden
                      />
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => togglePin(t.id)}
                    aria-label={t.pinned ? "Откачи" : "Закачи"}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40"
                  >
                    {t.pinned ? (
                      <PinOff className="h-4 w-4" />
                    ) : (
                      <Pin className="h-4 w-4" />
                    )}
                  </button>
                  {!t.pinned && t.kind !== "dashboard" && (
                    <button
                      type="button"
                      onClick={() => close(t.id)}
                      aria-label="Затвори"
                      className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-destructive/15 hover:text-destructive"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </div>
  );
}

function MobileTabDock({
  active,
  count,
  onOpen,
}: {
  active: ConsoleTab | null;
  count: number;
  onOpen: () => void;
}) {
  const Icon = active ? TAB_ICONS[active.kind] ?? FileText : FileText;
  return (
    <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border/60 bg-card/40 px-2">
      <button
        type="button"
        onClick={onOpen}
        className="flex min-h-[40px] flex-1 items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2 text-left"
      >
        <Icon className="h-4 w-4 shrink-0 text-gold" />
        <span className="truncate text-[13px] font-medium text-foreground">
          {active?.title ?? "Няма активен таб"}
        </span>
        {active?.dirty && (
          <span
            className="h-1.5 w-1.5 shrink-0 rounded-full bg-gold"
            aria-hidden
          />
        )}
        <span className="ml-auto shrink-0 rounded-full bg-muted/50 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {count}
        </span>
      </button>
      <button
        type="button"
        onClick={onOpen}
        aria-label="Всички табове"
        className="inline-flex h-10 w-10 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40"
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>
    </div>
  );
}
