import { useConsoleStore, type ConsoleSection } from "@/hooks/useConsoleStore";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  Briefcase,
  FileText,
  FileUp,
  Library,
  Users,
  ShieldAlert,
  PenSquare,
  ChevronLeft,
  ChevronRight,
  Bird,
} from "lucide-react";

const ITEMS: { id: ConsoleSection; label: string; icon: any }[] = [
  { id: "assistant", label: "DogovaryAI", icon: Bird },
  { id: "dashboard", label: "Табло", icon: LayoutDashboard },
  { id: "deals", label: "Сделки", icon: Briefcase },
  { id: "documents", label: "Документи", icon: FileText },
  { id: "uploaded", label: "Качени", icon: FileUp },
  { id: "templates", label: "Шаблони", icon: Library },
  { id: "clients", label: "Клиенти", icon: Users },
  { id: "analyses", label: "Анализи", icon: ShieldAlert },
  { id: "signing", label: "Подписи", icon: PenSquare },
];

export function ConsoleSidebar() {
  const { state, setSection, toggleSidebar, openTab } = useConsoleStore();
import { useNavigate } from "react-router-dom";

export function ConsoleSidebar() {
  const { state, setSection, toggleSidebar, openTab } = useConsoleStore();
  const navigate = useNavigate();
  const collapsed = state.sidebarCollapsed;

  const handleClick = (id: ConsoleSection) => {
    navigate(`/console/${id}`);
    setSection(id);
    if (id === "dashboard") {
      openTab({ kind: "dashboard", entityId: null, title: "Табло", id: "dashboard" });
    }
  };

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-border/60 bg-card/30 transition-[width] duration-200",
        collapsed ? "w-14" : "w-56",
      )}
    >
      <div className="flex items-center justify-between p-2">
        <span
          className={cn(
            "px-2 text-[11px] font-semibold uppercase tracking-widest text-muted-foreground",
            collapsed && "sr-only",
          )}
        >
          Workspace
        </span>
        <button
          type="button"
          onClick={toggleSidebar}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          aria-label={collapsed ? "Разшири" : "Свий"}
          title="⌘B"
        >
          {collapsed ? <ChevronRight className="h-4 w-4" /> : <ChevronLeft className="h-4 w-4" />}
        </button>
      </div>

      <nav className="flex-1 space-y-0.5 px-2 pb-2">
        {ITEMS.map((it) => {
          const Icon = it.icon;
          const active = state.section === it.id;
          return (
            <button
              key={it.id}
              type="button"
              onClick={() => handleClick(it.id)}
              title={collapsed ? it.label : undefined}
              className={cn(
                "flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-colors",
                active
                  ? "bg-gold/15 text-gold"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
            >
              <Icon className="h-4 w-4 shrink-0" />
              {!collapsed && <span className="truncate">{it.label}</span>}
            </button>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="border-t border-border/60 p-3 text-[10px] leading-relaxed text-muted-foreground/70">
          <kbd className="rounded bg-muted/40 px-1">⌘K</kbd> търсене ·{" "}
          <kbd className="rounded bg-muted/40 px-1">⌘W</kbd> затвори ·{" "}
          <kbd className="rounded bg-muted/40 px-1">⌘[</kbd>/<kbd className="rounded bg-muted/40 px-1">⌘]</kbd> навигация
        </div>
      )}
    </aside>
  );
}
