/**
 * AppendixSuggestions — surface "Приложение №X" / "Анекс №X" references
 * detected in the generated contract and offer a one-click CTA to draft each
 * one as a separate document.
 */

import { FilePlus2, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AppendixReference } from "@/lib/detectAppendixReferences";

interface Props {
  appendices: AppendixReference[];
  onCreate: (ref: AppendixReference) => void;
}

export function AppendixSuggestions({ appendices, onCreate }: Props) {
  if (!appendices.length) return null;

  return (
    <section className="rounded-xl border border-gold/40 bg-gradient-to-br from-gold/10 via-card to-card p-5 shadow-soft">
      <div className="mb-3 flex items-start gap-3">
        <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full bg-gold/15 text-gold">
          <Paperclip className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="font-serif text-base font-bold leading-tight">
            Документът цитира {appendices.length === 1 ? "приложение" : "приложения"}
          </h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Договорът се позовава на отделни документи. Създайте ги с един клик,
            за да са обвързани правно с основния договор.
          </p>
        </div>
      </div>

      <ul className="space-y-2">
        {appendices.map((a) => (
          <li
            key={`${a.kind}:${a.number}`}
            className="flex flex-col gap-2 rounded-lg border border-border/50 bg-card/60 p-3 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0 flex-1">
              <div className="text-sm font-semibold text-foreground">
                {a.label}
              </div>
              {a.context && (
                <div className="mt-0.5 line-clamp-2 text-[11px] text-muted-foreground">
                  „…{a.context}…"
                </div>
              )}
            </div>
            <Button
              size="sm"
              onClick={() => onCreate(a)}
              className="bg-gradient-gold text-navy hover:shadow-gold sm:flex-shrink-0"
            >
              <FilePlus2 className="mr-1.5 h-3.5 w-3.5" />
              Създай {a.label}
            </Button>
          </li>
        ))}
      </ul>
    </section>
  );
}
