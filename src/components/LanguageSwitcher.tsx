// Compact BG/EN language switcher used in the header.
import { Languages } from "@/icons";
import { useState, useRef, useEffect } from "react";
import { useLocale } from "@/i18n/useLocale";
import { cn } from "@/lib/utils";

export function LanguageSwitcher({ className }: { className?: string }) {
  const { locale, changeLocale } = useLocale();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div ref={ref} className={cn("relative", className)}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Език / Language"
        className="inline-flex h-9 items-center gap-1.5 rounded-full border border-gold/30 bg-gold/[0.06] px-3 text-[11px] font-semibold uppercase tracking-[0.12em] text-gold transition-colors hover:bg-gold/10"
      >
        <Languages className="h-3.5 w-3.5" />
        {locale.toUpperCase()}
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-50 mt-2 w-32 overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-lg"
        >
          {(["bg", "en"] as const).map((l) => (
            <button
              key={l}
              role="menuitem"
              onClick={() => { changeLocale(l); setOpen(false); }}
              className={cn(
                "block w-full px-3 py-2 text-left text-sm hover:bg-accent",
                l === locale && "bg-accent/60 font-medium",
              )}
            >
              {l === "bg" ? "Български" : "English"}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
