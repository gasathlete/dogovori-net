/**
 * Изтеглянията. Файлът се строи в браузъра от вече проверения резултат и точния
 * платен текст. Ако нещо не съвпада, файл не се създава и казваме защо.
 */
import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, Loader2 } from "@/icons";
import { downloadBlob } from "@/lib/productResultExports";
import type { ResultExportKind } from "@/lib/productResultAnalytics";

export interface ExportAction {
  readonly kind: ResultExportKind;
  readonly label: string;
  readonly filename: string;
  readonly build: () => Promise<Blob>;
}

export function ExportBar({
  title,
  note,
  actions,
  onCompleted,
}: {
  title: string;
  note?: string;
  actions: readonly ExportAction[];
  onCompleted?: (kind: ResultExportKind) => void;
}) {
  const [busy, setBusy] = useState<ResultExportKind | null>(null);
  const [status, setStatus] = useState<string | null>(null);

  const run = async (action: ExportAction) => {
    setBusy(action.kind);
    setStatus(null);
    try {
      const blob = await action.build();
      downloadBlob(blob, action.filename);
      onCompleted?.(action.kind);
      setStatus(`${action.label} е изтеглен.`);
    } catch (error) {
      setStatus(
        error instanceof Error && error.message.length > 0 && error.message.length < 240
          ? error.message
          : "Файлът не можа да се създаде. Опитайте отново.",
      );
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="mt-6 p-4 md:p-5">
      <h3 className="text-sm font-semibold">{title}</h3>
      {note && <p className="mt-2 text-sm text-muted-foreground">{note}</p>}
      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        {actions.map((action) => (
          <Button
            key={action.kind}
            type="button"
            variant="outline"
            className="min-h-11 justify-start"
            disabled={busy !== null}
            onClick={() => void run(action)}
          >
            {busy === action.kind ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            {action.label}
          </Button>
        ))}
      </div>
      <p aria-live="polite" className="mt-3 min-h-5 text-sm text-muted-foreground">
        {status ?? ""}
      </p>
    </Card>
  );
}
