import { CheckCircle, FileDown, FileText, Loader2, Save } from "@/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SuccessCelebration } from "@/components/wizard/SuccessCelebration";
import { useKeyboardOpen } from "@/hooks/useKeyboardOpen";
import type { DocFormat } from "@/lib/preferredFormat";

type Props = {
  documentTitle: string;
  needsAuth: boolean;
  canDownload: boolean;
  exporting: "pdf" | "docx" | null;
  saving: boolean;
  saved: boolean;
  opsLeft?: number | null;
  /** Последно използваният формат — показва се първи и е основното действие. */
  preferredFormat?: DocFormat;
  onExportPdf: () => void;
  onExportDocx: () => void;
  onSave: () => void;
  onRegister: () => void;
};

/**
 * Единственият панел с действия след генериране.
 * Мобилно: фиксиран най-долу (safe-area, скрива се при отворена клавиатура).
 * Десктоп: inline в началото на резултата.
 */
export function ResultActionBar({
  documentTitle,
  needsAuth,
  canDownload,
  exporting,
  saving,
  saved,
  opsLeft,
  preferredFormat = "pdf",
  onExportPdf,
  onExportDocx,
  onSave,
  onRegister,
}: Props) {
  const busy = !!exporting;
  const keyboardOpen = useKeyboardOpen();

  const buttons: { format: DocFormat; label: string; onClick: () => void }[] = [
    { format: "pdf", label: "PDF", onClick: onExportPdf },
    { format: "docx", label: "DOCX", onClick: onExportDocx },
  ];
  const ordered =
    preferredFormat === "docx" ? [buttons[1], buttons[0]] : buttons;
  const primary = ordered[0];

  return (
    <>
      {/* Компактен статус ред — винаги видим в потока на документа */}
      <div className="rounded-xl border border-gold/30 bg-gradient-card px-4 py-3 shadow-soft">
        <div className="flex items-start gap-2">
          <SuccessCelebration className="mt-0.5 shrink-0" />
          <div className="min-w-0 flex-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-gold">
              Документът е готов
            </p>
            <p className="truncate text-sm font-medium text-foreground" title={documentTitle}>
              {documentTitle}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Остава една крачка — свали го и е готов за подпис.
            </p>
            {typeof opsLeft === "number" && !needsAuth && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Оставащи операции: <span className="font-semibold text-foreground">{Math.max(0, opsLeft)}</span>
              </p>
            )}
            {!needsAuth && (
              <Button
                onClick={primary.onClick}
                disabled={busy || !canDownload}
                variant="ghost"
                size="sm"
                className="motion-safe:animate-pulse-twice mt-2 h-9 px-2 text-xs font-semibold text-emerald-600 hover:text-emerald-700 dark:text-gold dark:hover:text-gold"
              >
                <FileDown className="mr-1.5 h-3.5 w-3.5" />
                Свали сега ({primary.label})
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Spacer за фиксирания мобилен бар */}
      <div className="h-20 lg:hidden" aria-hidden="true" />

      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 px-4 py-3 pb-safe backdrop-blur-md transition-transform duration-200",
          keyboardOpen && "translate-y-full lg:translate-y-0",
          "lg:static lg:z-auto lg:rounded-xl lg:border lg:bg-card/60 lg:px-4 lg:py-4 lg:backdrop-blur-none",
        )}
      >
        {needsAuth ? (
          <Button
            onClick={onRegister}
            className="cta-invite h-11 w-full bg-gradient-gold text-navy transition-transform hover:shadow-gold active:scale-[0.98]"
          >
            Регистрация и сваляне
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            {ordered.map((b, i) => (
              <Button
                key={b.format}
                onClick={b.onClick}
                disabled={busy || !canDownload}
                variant={i === 0 ? "default" : "outline"}
                className={cn(
                  "h-11 flex-1 transition-transform active:scale-[0.98]",
                  i === 0
                    ? "cta-invite bg-gradient-gold text-navy hover:shadow-gold"
                    : "border-gold/40 hover:bg-gold/10 hover:text-gold",
                )}
              >
                {exporting === b.format ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : b.format === "pdf" ? (
                  <FileDown className="mr-2 h-4 w-4" />
                ) : (
                  <FileText className="mr-2 h-4 w-4" />
                )}
                {b.label}
              </Button>
            ))}
            <Button
              onClick={onSave}
              disabled={saving || saved}
              variant="ghost"
              size="icon"
              aria-label={saved ? "Запазено в профила" : "Запази в профила"}
              title={saved ? "Запазено в профила" : "Запази в профила"}
              className="h-11 w-11 shrink-0 text-muted-foreground hover:text-gold"
            >
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : saved ? (
                <CheckCircle className="h-4 w-4 text-success" />
              ) : (
                <Save className="h-4 w-4" />
              )}
            </Button>
          </div>
        )}
      </div>
    </>
  );
}
