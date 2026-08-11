import { useEffect, useState } from "react";
import { AlertTriangle, X } from "@/icons";
import { Button } from "@/components/ui/button";
import { drainBufferedEvents } from "@/lib/bufferedEvents";

/**
 * Global gate shown when a document still contains unfilled placeholders
 * ([...], {{...}}, ______) at export time. Opens on "placeholders:request"
 * and answers with "placeholders:resolved".
 */
export function UnfilledPlaceholdersModal() {
  const [open, setOpen] = useState(false);
  const [placeholders, setPlaceholders] = useState<string[]>([]);

  useEffect(() => {
    const onRequest = (detail: unknown) => {
      const list = (detail as { placeholders?: string[] })?.placeholders ?? [];
      setPlaceholders(list);
      setOpen(true);
    };
    const listener = (e: Event) => onRequest((e as CustomEvent).detail);
    window.addEventListener("placeholders:request", listener);
    drainBufferedEvents("placeholders:request", onRequest);
    return () => window.removeEventListener("placeholders:request", listener);
  }, []);

  const reply = (proceed: boolean) => {
    setOpen(false);
    window.dispatchEvent(
      new CustomEvent("placeholders:resolved", { detail: { proceed } }),
    );
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-background/85 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="placeholders-title"
    >
      <div className="relative w-full max-w-lg rounded-xl border border-border bg-card p-6 shadow-xl">
        <button
          type="button"
          onClick={() => reply(false)}
          className="absolute right-4 top-4 text-muted-foreground transition-colors hover:text-foreground"
          aria-label="Затвори"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3">
          <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-amber-500/15 text-amber-600 dark:text-amber-400">
            <AlertTriangle className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 id="placeholders-title" className="text-base font-semibold text-foreground">
              Документът съдържа непопълнени полета
            </h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Открихме места, които все още не са конкретизирани. Документ с
              непопълнени полета може да бъде оспорен като непълен или неопределен.
            </p>
          </div>
        </div>

        <ul className="mt-4 max-h-40 space-y-1 overflow-y-auto rounded-lg border border-border bg-muted/40 p-3">
          {placeholders.map((p) => (
            <li key={p} className="font-mono text-xs text-foreground break-all">
              {p}
            </li>
          ))}
        </ul>

        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={() => reply(false)} className="sm:min-w-40">
            Върни се към редакция
          </Button>
          <Button onClick={() => reply(true)} className="sm:min-w-40">
            Свали въпреки това
          </Button>
        </div>
        <p className="mt-3 text-[11px] text-muted-foreground">
          Ако полетата са умишлено оставени за ръчно попълване (напр. дата и подпис
          на място), можете да продължите.
        </p>
      </div>
    </div>
  );
}
