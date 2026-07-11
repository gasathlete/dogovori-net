import { useConsoleStore } from "@/hooks/useConsoleStore";
import { useIsPro } from "@/hooks/useIsPro";
import { Sparkles, Keyboard } from "@/icons";

export function ConsoleFooter() {
  const { state } = useConsoleStore();
  const { isPro, isTeam, freeQuota } = useIsPro();
  const paid = isPro || isTeam;
  const dirtyCount = state.tabs.filter((t) => t.dirty).length;

  return (
    <footer className="flex h-7 shrink-0 items-center justify-between border-t border-border/60 bg-card/30 px-3 text-[11px] text-muted-foreground">
      <div className="flex items-center gap-3">
        <span>
          {state.tabs.length} {state.tabs.length === 1 ? "таб" : "таба"}
        </span>
        {dirtyCount > 0 && (
          <span className="inline-flex items-center gap-1 text-gold">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-gold" />
            {dirtyCount} незапазен{dirtyCount === 1 ? "" : "и"}
          </span>
        )}
        {!paid && (
          <span>
            Операции: {freeQuota.opsUsed}/{freeQuota.opsCap}
          </span>
        )}
        {paid && (
          <span className="inline-flex items-center gap-1 text-gold">
            <Sparkles className="h-3 w-3" /> {isTeam ? "Екип" : "Предприемач"}
          </span>
        )}
      </div>
      <div className="hidden items-center gap-3 md:flex">
        <span className="inline-flex items-center gap-1.5">
          <Keyboard className="h-3 w-3" />
          <kbd className="rounded border border-border/60 bg-muted/40 px-1">⌘B</kbd> панел
        </span>
        <span>
          <kbd className="rounded border border-border/60 bg-muted/40 px-1">⌘[</kbd>{" "}
          <kbd className="rounded border border-border/60 bg-muted/40 px-1">⌘]</kbd> табове
        </span>
        <span>
          <kbd className="rounded border border-border/60 bg-muted/40 px-1">⌘W</kbd> затвори
        </span>
      </div>
    </footer>
  );
}
