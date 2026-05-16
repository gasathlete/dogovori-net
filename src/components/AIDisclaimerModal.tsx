import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bird, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { hasAIDisclaimerLocal, setAIDisclaimerLocal, recordConsents } from "@/lib/consents";

/**
 * Discrete bottom-right toast shown once per user/browser when entering
 * an AI-generation flow. Checking the box accepts and dismisses immediately.
 */
export function AIDisclaimerModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!hasAIDisclaimerLocal()) {
      // Small delay so it doesn't pop up the instant the page mounts.
      const t = setTimeout(() => setOpen(true), 400);
      return () => clearTimeout(t);
    }
  }, []);

  const accept = () => {
    setAIDisclaimerLocal();
    setOpen(false);
    recordConsents([{ consent_type: "ai_disclaimer", granted: true }]).catch(() => undefined);
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-label="Информация за изкуствен интелект"
      className="fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))] animate-in fade-in slide-in-from-bottom-4"
    >
      <div className="relative rounded-lg border border-gold/30 bg-card/95 p-4 shadow-soft backdrop-blur-md">
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Затвори"
          className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-gold">
          <Bird className="h-3 w-3" /> Информация за изкуствен интелект
        </div>

        <p className="pr-4 text-xs leading-relaxed text-foreground/90">
          Генерираните документи са образци, създадени с моделиран по българското
          законодателство изкуствен интелект и не представляват правен съвет.{" "}
          <Link to="/terms" className="text-gold underline-offset-2 hover:underline">
            Условия
          </Link>
          .
        </p>

        <button
          type="button"
          onClick={accept}
          className="mt-3 flex w-full items-center gap-2 rounded-md border border-border/60 bg-background/40 p-2 text-left transition-colors hover:bg-background/70"
        >
          <Checkbox
            checked={false}
            className="pointer-events-none mt-0.5"
            tabIndex={-1}
          />
          <span className="text-[11px] leading-snug text-foreground">
            Разбирам и приемам.
          </span>
        </button>
      </div>
    </div>
  );
}
