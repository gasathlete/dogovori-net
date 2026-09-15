import { useNavigate } from "react-router-dom";
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
  Package,
} from "@/icons";
import { BrandMark, BrandLogo } from "@/components/BrandLogo";

const ITEMS: { id: ConsoleSection; label: string; icon: any }[] = [
  { id: "assistant", label: "DogovaryAI", icon: Bird },
  { id: "dashboard", label: "Табло", icon: LayoutDashboard },
  { id: "deals", label: "Сделки", icon: Briefcase },
  { id: "documents", label: "Документи", icon: FileText },
  { id: "uploaded", label: "Качени", icon: FileUp },
  { id: "templates", label: "Шаблони", icon: Library },
  { id: "kits", label: "Комплекти", icon: Package },
  { id: "clients", label: "Клиенти", icon: Users },
  { id: "analyses", label: "Анализи", icon: ShieldAlert },
  { id: "signing", label: "Подписи", icon: PenSquare },
];

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
        {collapsed ? <BrandMark decorative className="h-7 w-10" /> : <BrandLogo compact className="scale-90 origin-left" />}
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

      <nav className="relative flex-1 space-y-0.5 px-2 pb-2">
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
                "group relative flex w-full items-center gap-3 rounded-md px-2.5 py-2 text-sm font-medium transition-all duration-200",
                active
                  ? "bg-gold/10 text-gold"
                  : "text-muted-foreground hover:bg-muted/40 hover:text-foreground",
              )}
            >
              {/* Active gold rail */}
              {active && (
                <span
                  aria-hidden="true"
                  className="absolute -left-2 top-1.5 bottom-1.5 w-1 rounded-r-full bg-gold shadow-[0_0_12px_hsl(var(--gold)/0.6)] animate-fade-in"
                />
              )}
              {/* Hover glow */}
              <span
                aria-hidden="true"
                className={cn(
                  "pointer-events-none absolute inset-0 rounded-md opacity-0 transition-opacity duration-300",
                  active ? "" : "group-hover:opacity-100 bg-gradient-to-r from-gold/[0.04] to-transparent",
                )}
              />
              <Icon className={cn("relative h-4 w-4 shrink-0 transition-transform group-hover:scale-110", active && "text-gold")} />
              {!collapsed && <span className="relative truncate">{it.label}</span>}
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
