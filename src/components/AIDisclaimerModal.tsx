import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bird, X } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { recordConsents } from "@/lib/consents";
import { hasAIDisclaimerSession, setAIDisclaimerSession } from "@/lib/aiDisclaimerGate";

/**
 * Global session-scoped AI disclaimer.
 * - Opens when any download flow dispatches "ai-disclaimer:request"
 *   (see lib/aiDisclaimerGate).
 * - On accept, sets session flag and replies with "ai-disclaimer:resolved"
 *   so the download can proceed.
 * - Once accepted in a session, never reopens until a new browser session.
 */
export function AIDisclaimerModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const onRequest = () => {
      if (hasAIDisclaimerSession()) {
        // Already accepted — short-circuit immediately so the caller proceeds.
        window.dispatchEvent(
          new CustomEvent("ai-disclaimer:resolved", { detail: { accepted: true } }),
        );
        return;
      }
      setOpen(true);
    };
    window.addEventListener("ai-disclaimer:request", onRequest);
    return () => window.removeEventListener("ai-disclaimer:request", onRequest);
  }, []);

  const accept = () => {
    setAIDisclaimerSession();
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent("ai-disclaimer:resolved", { detail: { accepted: true } }),
    );
    recordConsents([{ consent_type: "ai_disclaimer", granted: true }]).catch(() => undefined);
  };

  const cancel = () => {
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent("ai-disclaimer:resolved", { detail: { accepted: false } }),
    );
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Информация за изкуствен интелект"
      className="fixed bottom-4 right-4 z-50 w-[min(360px,calc(100vw-2rem))] animate-in fade-in slide-in-from-bottom-4"
    >
      <div className="relative rounded-lg border border-gold/30 bg-card/95 p-4 shadow-soft backdrop-blur-md">
        <button
          type="button"
          onClick={cancel}
          aria-label="Затвори"
          className="absolute right-2 top-2 rounded-md p-1 text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="mb-2 flex items-center gap-2 text-[10px] uppercase tracking-wider text-gold">
          <Bird className="h-3 w-3" /> Информация за изкуствен интелект
        </div>

        <p className="pr-4 text-xs leading-relaxed text-foreground/90">
          Документите са образци, генерирани от изкуствен интелект, моделиран по
          българското законодателство, и <strong>не представляват правен съвет</strong>.
          Преди подписване проверете данните и при значими сделки се консултирайте с
          адвокат или нотариус. Отговорността за използването е на потребителя.{" "}
          <Link to="/terms" className="text-gold underline-offset-2 hover:underline">
            Условия
          </Link>
          .
        </p>

        <button
          type="button"
          onClick={accept}
          className="mt-3 flex w-full items-center gap-2 rounded-md border border-gold/40 bg-background/40 p-2 text-left transition-colors hover:bg-background/70"
        >
          <Checkbox checked={false} className="pointer-events-none mt-0.5" tabIndex={-1} />
          <span className="text-[11px] leading-snug text-foreground">
            Разбирам и приемам — продължи към изтегляне.
          </span>
        </button>
      </div>
    </div>
  );
}
