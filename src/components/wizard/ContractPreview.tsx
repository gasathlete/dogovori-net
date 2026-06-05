/**
 * ContractPreview — read-only render of a GeneratedContract with optional
 * inline editing. Each section (title / preamble / clause body / closing)
 * can be flipped into a textarea, edited, and saved back via `onChange`.
 *
 * Used on the finalize screen so users can preview and tweak the AI output
 * before exporting to PDF/DOCX.
 */

import { useState } from "react";
import { Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { GeneratedContract } from "@/lib/exporters";
import { usePrefetchExporters } from "@/hooks/usePrefetchExporters";

type Props = {
  contract: GeneratedContract;
  onChange: (next: GeneratedContract) => void;
};

type EditKey = "title" | "preamble" | "closing" | `clause:${number}`;

export function ContractPreview({ contract, onChange }: Props) {
  // Warm the PDF/DOCX export chunks and embed font while the user reads
  // through the preview — the next click on Download is then near-instant.
  usePrefetchExporters({ pdf: true, docx: true });

  const [editing, setEditing] = useState<EditKey | null>(null);
  const [draft, setDraft] = useState<string>("");

  const startEdit = (key: EditKey, current: string) => {
    setEditing(key);
    setDraft(current);
  };
  const cancel = () => {
    setEditing(null);
    setDraft("");
  };
  const save = () => {
    if (editing === null) return;
    const next = { ...contract };
    if (editing === "title") next.title = draft.trim() || contract.title;
    else if (editing === "preamble") next.preamble = draft;
    else if (editing === "closing") next.closing = draft;
    else if (editing.startsWith("clause:")) {
      const idx = Number(editing.split(":")[1]);
      next.clauses = contract.clauses.map((c, i) =>
        i === idx ? { ...c, body: draft } : c,
      );
    }
    onChange(next);
    cancel();
  };

  const EditButton = ({ k, current }: { k: EditKey; current: string }) =>
    editing === k ? (
      <div className="flex gap-1">
        <Button size="sm" variant="outline" onClick={cancel} className="h-7 px-2">
          <X className="h-3.5 w-3.5" />
        </Button>
        <Button size="sm" onClick={save} className="h-7 px-2 bg-gradient-gold text-navy">
          <Check className="h-3.5 w-3.5" />
        </Button>
      </div>
    ) : (
      <Button
        size="sm"
        variant="ghost"
        onClick={() => startEdit(k, current)}
        className="h-7 px-2 text-xs text-muted-foreground hover:text-gold"
      >
        <Pencil className="mr-1 h-3 w-3" />
        Редактирай
      </Button>
    );

  return (
    <div className="rounded-xl border border-border/60 bg-gradient-card p-4 shadow-soft sm:p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-serif text-lg font-bold">Преглед на документа</h3>
        <span className="hidden text-xs text-muted-foreground sm:inline">
          Натиснете „Редактирай“ за промени по секция.
        </span>
      </div>

      {/* Word-like paper sheet */}
      <div className="mx-auto max-w-[816px] rounded-md bg-white text-neutral-900 shadow-[0_4px_24px_rgba(0,0,0,0.18)] ring-1 ring-black/5">
        <div className="px-6 py-8 sm:px-16 sm:py-14 font-serif text-[15px] leading-7">


          {/* Title */}
          <section className="mb-6 border-b border-neutral-200 pb-4">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-wider text-neutral-500">
                Заглавие
              </span>
              <EditButton k="title" current={contract.title} />
            </div>
            {editing === "title" ? (
              <Input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                autoFocus
                className="bg-white text-neutral-900"
              />
            ) : (
              <h2 className="text-center font-serif text-2xl font-bold uppercase leading-snug text-neutral-900">
                {contract.title}
              </h2>
            )}
          </section>

          {/* Preamble */}
          <section className="mb-6">
            <div className="mb-2 flex items-center justify-between gap-2">
              <span className="text-[11px] uppercase tracking-wider text-neutral-500">
                Преамбюл
              </span>
              <EditButton k="preamble" current={contract.preamble} />
            </div>
            {editing === "preamble" ? (
              <Textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={6}
                autoFocus
                className="bg-white text-neutral-900"
              />
            ) : (
              <p className="whitespace-pre-wrap text-justify indent-8 leading-7 text-neutral-900">
                {contract.preamble}
              </p>
            )}
          </section>

          {/* Clauses */}
          <section className="mb-6 space-y-5">
            {contract.clauses.map((cl, i) => {
              const key: EditKey = `clause:${i}`;
              return (
                <article key={`${cl.number}-${i}`}>
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <h4 className="font-serif text-base font-bold uppercase text-neutral-900">
                      {cl.number} {cl.title}
                    </h4>
                    <EditButton k={key} current={cl.body} />
                  </div>
                  {editing === key ? (
                    <Textarea
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      rows={Math.min(14, Math.max(4, draft.split("\n").length + 1))}
                      autoFocus
                      className="bg-white text-neutral-900"
                    />
                  ) : (
                    <p className="whitespace-pre-wrap text-justify indent-8 leading-7 text-neutral-900">
                      {cl.body}
                    </p>
                  )}
                </article>
              );
            })}
          </section>

          {/* Closing */}
          {contract.closing && (
            <section className="border-t border-neutral-200 pt-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="text-[11px] uppercase tracking-wider text-neutral-500">
                  Заключителни разпоредби
                </span>
                <EditButton k="closing" current={contract.closing} />
              </div>
              {editing === "closing" ? (
                <Textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  rows={4}
                  autoFocus
                  className="bg-white text-neutral-900"
                />
              ) : (
                <p className="whitespace-pre-wrap text-justify indent-8 leading-7 text-neutral-900">
                  {contract.closing}
                </p>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

