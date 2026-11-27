/**
 * Ръчен преглед на клаузите.
 *
 * Показва се само когато автоматичната обработка не е успяла. Тук системата не
 * добавя нито дума: изреждаме дословните части от Вашия документ, Вие
 * отмятате кои да влязат в прегледа, и сваляте списъка. Няма правни изводи.
 */
import * as React from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ExportBar } from "@/components/product-result/ExportBar";
import { buildCorrectedPdf, safeFileName } from "@/lib/productResultExports";
import {
  selectedClauseText,
  splitClauseSegments,
  type ClauseSegment,
} from "@/lib/manualClauseSegments";

export function ManualClauseReview({
  title,
  sourceText,
}: {
  /** Заглавие за името на файла — идва от документа, не се измисля. */
  title: string;
  sourceText: string;
}) {
  const segments = React.useMemo<readonly ClauseSegment[]>(
    () => splitClauseSegments(sourceText),
    [sourceText],
  );
  const [selected, setSelected] = React.useState<ReadonlySet<string>>(new Set());

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const allSelected = segments.length > 0 && selected.size === segments.length;
  const chosen = selectedClauseText(segments, selected);

  if (segments.length === 0) {
    return (
      <Card className="mt-6 p-5">
        <h2 className="text-base font-semibold">Ръчен преглед</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          В текста на документа не откриваме отделни клаузи, които да покажем за ръчен преглед.
        </p>
      </Card>
    );
  }

  return (
    <section className="mt-6" aria-labelledby="manual-review-heading">
      <Card className="p-5">
        <h2 id="manual-review-heading" className="text-base font-semibold">
          Ръчен преглед на клаузите
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          Отдолу са частите от Вашия документ, дословно. Отметнете клаузите, които искате да
          прегледате, и ги свалете като списък. Системата не добавя текст и не прави изводи.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Button
            type="button"
            variant="outline"
            className="min-h-11"
            onClick={() =>
              setSelected(allSelected ? new Set() : new Set(segments.map((s) => s.id)))
            }
          >
            {allSelected ? "Изчистете избора" : "Отметнете всички"}
          </Button>
          <p className="text-sm text-muted-foreground" aria-live="polite">
            Избрани {selected.size} от {segments.length}
          </p>
        </div>
      </Card>

      <ul className="mt-4 space-y-3">
        {segments.map((segment, index) => {
          const inputId = `clause-${segment.id}`;
          return (
            <li key={segment.id}>
              <Card className="p-4">
                <div className="flex items-start gap-3">
                  <Checkbox
                    id={inputId}
                    checked={selected.has(segment.id)}
                    onCheckedChange={() => toggle(segment.id)}
                    className="mt-1"
                  />
                  <div className="min-w-0">
                    <label htmlFor={inputId} className="block text-sm font-medium">
                      {index + 1}. {segment.label}
                    </label>
                    <p className="mt-2 whitespace-pre-wrap break-words text-sm text-muted-foreground">
                      {segment.text.trim()}
                    </p>
                  </div>
                </div>
              </Card>
            </li>
          );
        })}
      </ul>

      {selected.size > 0 && (
        <ExportBar
          title="Свалете избраните клаузи"
          note="Файлът съдържа само дословния текст на отметнатите клаузи."
          actions={[
            {
              kind: "manual_clauses_pdf",
              label: "Избрани клаузи (PDF)",
              filename: safeFileName(title, "klauzi-za-pregled", "pdf"),
              build: () => buildCorrectedPdf(title, chosen),
            },
          ]}
        />
      )}
    </section>
  );
}
