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

type Props = {
  contract: GeneratedContract;
  onChange: (next: GeneratedContract) => void;
};

type EditKey = "title" | "preamble" | "closing" | `clause:${number}`;

export function ContractPreview({ contract, onChange }: Props) {
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
    <div className="rounded-xl border border-border/60 bg-gradient-card p-6 shadow-soft">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h3 className="font-serif text-lg font-bold">Преглед на документа</h3>
        <span className="text-xs text-muted-foreground">
          Натиснете „Редактирай“ за промени по секция.
        </span>
      </div>

      {/* Title */}
      <section className="mb-5 border-b border-border/40 pb-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Заглавие
          </span>
          <EditButton k="title" current={contract.title} />
        </div>
        {editing === "title" ? (
          <Input value={draft} onChange={(e) => setDraft(e.target.value)} autoFocus />
        ) : (
          <h2 className="font-serif text-xl font-semibold leading-snug">
            {contract.title}
          </h2>
        )}
      </section>

      {/* Preamble */}
      <section className="mb-5 border-b border-border/40 pb-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <span className="text-xs uppercase tracking-wider text-muted-foreground">
            Преамбюл
          </span>
          <EditButton k="preamble" current={contract.preamble} />
        </div>
        {editing === "preamble" ? (
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            autoFocus
          />
        ) : (
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
            {contract.preamble}
          </p>
        )}
      </section>

      {/* Clauses */}
      <section className="mb-5 space-y-4">
        {contract.clauses.map((cl, i) => {
          const key: EditKey = `clause:${i}`;
          return (
            <article
              key={`${cl.number}-${i}`}
              className="rounded-lg border border-border/40 bg-card/40 p-4"
            >
              <div className="mb-2 flex items-start justify-between gap-2">
                <h4 className="font-serif text-sm font-semibold text-gold">
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
                />
              ) : (
                <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
                  {cl.body}
                </p>
              )}
            </article>
          );
        })}
      </section>

      {/* Closing */}
      {contract.closing && (
        <section className="border-t border-border/40 pt-4">
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">
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
            />
          ) : (
            <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
              {contract.closing}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
