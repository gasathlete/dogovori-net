import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Sparkles, ShieldCheck, CreditCard } from "@/icons";

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
          <div className="mt-3 flex flex-col gap-2 sm:flex-row">
            <Button size="sm" className="gap-2" onClick={onRegister}>
              <Sparkles className="h-4 w-4" aria-hidden />
              Създайте профил и запазете документа
            </Button>
            <Button
              asChild
              size="sm"
              variant="outline"
              className="gap-2 border-gold/40 text-gold hover:bg-gold/10 hover:text-gold"
            >
              <Link to="/plans?plan=entrepreneur&from=anon_preview">
                <CreditCard className="h-4 w-4" aria-hidden />
                Виж абонаментни планове
              </Link>
            </Button>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Спести време и правни разходи с план{" "}
            <span className="font-medium text-foreground">Предприемач</span> за 12,90 €/мес
            (100 операции) или <span className="font-medium text-foreground">Екип</span> —
            10,90 €/място/мес (мин. 3 места).
          </p>
        </div>
      </div>
    </div>
  );
}
