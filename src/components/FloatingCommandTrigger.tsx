import { Search } from "lucide-react";

/**
 * Persistent floating ⌘K trigger (desktop only).
 * Dispatches the same event CommandPalette listens for.
 */
export function FloatingCommandTrigger() {
  const open = () => window.dispatchEvent(new CustomEvent("dogovori:open-command"));
  const isMac =
    typeof navigator !== "undefined" && /Mac|iPhone|iPad/.test(navigator.platform);

  return (
    <button
      type="button"
      onClick={open}
      aria-label="Бързо търсене (Ctrl/Cmd + K)"
      className="hidden md:inline-flex fixed bottom-6 left-6 z-30 items-center gap-2 rounded-full border border-gold/30 bg-background/85 px-4 py-2.5 text-[12px] font-medium text-foreground/80 shadow-soft backdrop-blur-md transition-all hover:border-gold/60 hover:text-gold hover:shadow-elegant"
    >
      <Search className="h-3.5 w-3.5 text-gold" />
      <span>Търсене</span>
      <kbd className="ml-1 rounded border border-border/60 bg-card/60 px-1.5 py-0.5 text-[10px] font-mono tracking-tight text-muted-foreground">
        {isMac ? "⌘K" : "Ctrl K"}
      </kbd>
    </button>
  );
}
