import { useConsoleStore, type ConsoleTab } from "@/hooks/useConsoleStore";
import { cn } from "@/lib/utils";
import {
  X,
  Pin,
  PinOff,
  MoreHorizontal,
  LayoutDashboard,
  Briefcase,
  FileText,
  FileUp,
  Library,
  Users,
  ShieldAlert,
  Wand2,
  PenSquare,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const ICONS = {
  dashboard: LayoutDashboard,
  deal: Briefcase,
  document: FileText,
  uploaded: FileUp,
  template: Library,
  client: Users,
  analysis: ShieldAlert,
  wizard: Wand2,
  signing: PenSquare,
} as const;

function TabPill({ tab }: { tab: ConsoleTab }) {
  const { state, activate, close, togglePin, closeOthers } = useConsoleStore();
  const active = state.activeId === tab.id;
  const Icon = ICONS[tab.kind] ?? FileText;

  return (
    <div
      className={cn(
        "group relative flex h-9 max-w-[200px] shrink-0 items-center gap-2 rounded-t-md border border-b-0 px-3 text-[12.5px] transition-all",
        active
          ? "border-border/60 bg-background text-foreground"
          : "border-transparent bg-muted/30 text-muted-foreground hover:bg-muted/50 hover:text-foreground",
      )}
    >
      <button
        type="button"
        onClick={() => activate(tab.id)}
        className="flex min-w-0 items-center gap-1.5"
      >
        <Icon className={cn("h-3.5 w-3.5 shrink-0", active && "text-gold")} />
        {tab.pinned && <Pin className="h-3 w-3 shrink-0 text-gold" />}
        <span className="truncate">{tab.title}</span>
        {tab.dirty && (
          <span
            aria-hidden="true"
            className="ml-1 h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-gold"
          />
        )}
      </button>

      {!tab.pinned && tab.kind !== "dashboard" && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            close(tab.id);
          }}
          aria-label="Затвори"
          className="ml-0.5 inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground/80 transition-colors hover:bg-destructive/15 hover:text-destructive"
        >
          <X className="h-3 w-3" />
        </button>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Действия"
            className="inline-flex h-5 w-5 items-center justify-center rounded text-muted-foreground/60 opacity-0 hover:bg-muted hover:text-foreground group-hover:opacity-100"
          >
            <MoreHorizontal className="h-3 w-3" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-44">
          <DropdownMenuItem onClick={() => togglePin(tab.id)}>
            {tab.pinned ? (
              <>
                <PinOff className="mr-2 h-4 w-4" /> Откачи
              </>
            ) : (
              <>
                <Pin className="mr-2 h-4 w-4" /> Закачи
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => closeOthers(tab.id)}>
            Затвори останалите
          </DropdownMenuItem>
          {!tab.pinned && tab.kind !== "dashboard" && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => close(tab.id)} className="text-destructive">
                <X className="mr-2 h-4 w-4" /> Затвори
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

export function ConsoleTabBar() {
  const { state, closeAll, reopenLast } = useConsoleStore();

  return (
    <div className="flex h-10 items-end gap-1 overflow-x-auto border-b border-border/60 bg-card/20 px-2">
      {state.tabs.map((t) => (
        <TabPill key={t.id} tab={t} />
      ))}
      <div className="ml-auto flex shrink-0 items-center gap-1 pb-1">
        {state.closed.length > 0 && (
          <button
            type="button"
            onClick={reopenLast}
            className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
            title="⌘⇧T"
          >
            ↶ Възстанови
          </button>
        )}
        {state.tabs.some((t) => !t.pinned) && (
          <button
            type="button"
            onClick={closeAll}
            className="rounded px-2 py-1 text-[11px] text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          >
            Затвори всички
          </button>
        )}
      </div>
    </div>
  );
}
