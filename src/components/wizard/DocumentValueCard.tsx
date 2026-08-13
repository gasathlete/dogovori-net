import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, FileDown, FileText, Sparkles, ShieldCheck, Loader2 } from "@/icons";

interface Props {
  /** Има ли потребителят право да изтегли документа сега. */
  canDownload: boolean;
  /** Тегли се в момента. */
  busy?: boolean;
  /** Директно сваляне (при налична операция/абонамент). */
  onDownload?: () => void;
  /** Сваляне в DOCX. */
  onDownloadDocx?: () => void;
  /** DOCX експортът върви в момента. */
  busyDocx?: boolean;
  /** Няма профил — първо регистрация. */
  needsAuth?: boolean;
  onRegister?: () => void;
  /** Спестена сума спрямо адвокатски хонорар (EUR). */
  savedEur?: number;
  documentTitle?: string;
}


/**
 * Показва се веднага след успешно генериране.
 *
 * Задача: да превърне „готов текст“ в усетена стойност (ROI), преди
 * потребителят да види гейта — и да води по най-краткия път или към сваляне,
 * или към /plans с предварително избран план Предприемач (12.90 €/мес).
 */
export function DocumentValueCard({
  canDownload,
  busy,
  onDownload,
  onDownloadDocx,
  busyDocx,
  needsAuth,
  onRegister,
  savedEur = 150,
  documentTitle,
}: Props) {
  return (
    <div className="rounded-2xl border border-gold/40 bg-gold/5 p-5 shadow-soft animate-fade-in">
      <div className="flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-gold/40 bg-gold/10 text-gold">
          <CheckCircle2 className="h-4 w-4" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="font-serif text-lg text-foreground">Документът е изготвен</h3>
            <Badge variant="outline" className="border-gold/40 text-[10px] uppercase tracking-wider text-gold">
              Проверен от AI ревизор
            </Badge>
          </div>
          {documentTitle && (
            <p className="mt-1 truncate text-xs text-muted-foreground">{documentTitle}</p>
          )}

          <p className="mt-2 text-sm leading-relaxed text-foreground">
            Спестихте над <span className="font-semibold text-gold">{savedEur} EUR</span> от
            стандартен адвокатски хонорар за изготвяне на такъв документ, както и 2–3 работни дни
            изчакване.
          </p>

          <ul className="mt-3 space-y-1 text-xs text-muted-foreground">
            <li className="flex items-start gap-1.5">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-gold" aria-hidden />
              Клаузите следват ЗЗД / ТЗ и пазарния стандарт за този тип документ.
            </li>
            <li className="flex items-start gap-1.5">
              <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-emerald-600 dark:text-gold" aria-hidden />
              Готов за подпис — PDF/DOCX, е-подпис и изпращане до втората страна.
            </li>
          </ul>

          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            {needsAuth ? (
              <Button onClick={onRegister} className="flex-1 gap-2 bg-gradient-gold text-navy hover:shadow-gold">
                <Sparkles className="h-4 w-4" aria-hidden />
                Създайте профил и изтеглете
              </Button>
            ) : canDownload ? (
              <Button
                onClick={onDownload}
                disabled={busy}
                className="flex-1 gap-2 bg-gradient-gold text-navy hover:shadow-gold"
              >
                {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileDown className="h-4 w-4" aria-hidden />}
                Изтегли документа (PDF)
              </Button>
            ) : (
              <Button asChild className="flex-1 gap-2 bg-gradient-gold text-navy hover:shadow-gold">
                <Link to="/plans?plan=entrepreneur&from=document">
                  <FileDown className="h-4 w-4" aria-hidden />
                  Изтегли документа
                </Link>
              </Button>
            )}
          </div>

          {!canDownload && !needsAuth && (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              За сваляне е нужна 1 операция. План <span className="font-medium text-foreground">Предприемач</span> —
              12.90 €/мес (100 операции), или еднократен пакет операции.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
