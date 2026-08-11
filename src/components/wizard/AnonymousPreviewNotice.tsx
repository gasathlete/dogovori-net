import { Button } from "@/components/ui/button";
import { Sparkles, ShieldCheck } from "@/icons";

interface Props {
  onRegister: () => void;
}

/**
 * Shown after an anonymous visitor generates a document: the text is fully
 * readable (proof of quality), but export/save требва регистрация.
 */
export function AnonymousPreviewNotice({ onRegister }: Props) {
  return (
    <div className="mb-4 rounded-2xl border border-gold/40 bg-gold/5 p-4">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold">
          <ShieldCheck className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-semibold">Готов документ — преглед без регистрация</h3>
          <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
            Прочетете целия текст и оценката на риска. За да запазите документа,
            да го изтеглите в PDF/DOCX или да го изпратите за подпис, е нужен профил —
            прогресът ви се запазва автоматично.
          </p>
          <Button size="sm" className="mt-3 gap-2" onClick={onRegister}>
            <Sparkles className="h-4 w-4" aria-hidden />
            Създайте профил и запазете документа
          </Button>
        </div>
      </div>
    </div>
  );
}
