import { CheckCircle, FileDown, FileText, Loader2, Save } from "@/icons";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { SuccessCelebration } from "@/components/wizard/SuccessCelebration";

type Props = {
  documentTitle: string;
  needsAuth: boolean;
  canDownload: boolean;
  exporting: "pdf" | "docx" | null;
  saving: boolean;
  saved: boolean;
  opsLeft?: number | null;
  onExportPdf: () => void;
  onExportDocx: () => void;
  onSave: () => void;
  onRegister: () => void;
};

/**
 * Единственият панел с действия след генериране.
 * Мобилно: фиксиран най-долу (safe-area). Десктоп: inline в началото на резултата.
 */
export function ResultActionBar({
  documentTitle,
  needsAuth,
  canDownload,
  exporting,
  saving,
  saved,
  opsLeft,
  onExportPdf,
  onExportDocx,
  onSave,
  onRegister,
}: Props) {
  const busy = !!exporting;

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
              Остава само да го свалиш — PDF за подпис или DOCX за редакция.
            </p>
            {typeof opsLeft === "number" && !needsAuth && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                Оставащи операции: <span className="font-semibold text-foreground">{Math.max(0, opsLeft)}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Spacer за фиксирания мобилен бар */}
      <div className="h-20 lg:hidden" aria-hidden="true" />

      <div
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-background/95 px-4 py-3 pb-safe backdrop-blur-md",
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
            <Button
              onClick={onExportPdf}
              disabled={busy || !canDownload}
              className="cta-invite h-11 flex-1 bg-gradient-gold text-navy transition-transform hover:shadow-gold active:scale-[0.98]"
            >
              {exporting === "pdf" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileDown className="mr-2 h-4 w-4" />
              )}
              PDF
            </Button>
            <Button
              onClick={onExportDocx}
              disabled={busy || !canDownload}
              variant="outline"
              className="h-11 flex-1 border-gold/40 transition-transform hover:bg-gold/10 hover:text-gold active:scale-[0.98]"
            >
              {exporting === "docx" ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <FileText className="mr-2 h-4 w-4" />
              )}
              DOCX
            </Button>
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
                <CheckCircle className="h-4 w-4 text-emerald-600 dark:text-gold" />
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
