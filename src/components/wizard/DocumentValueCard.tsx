import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, FileDown, FileText, Sparkles, ShieldCheck, Loader2 } from "@/icons";
import {
  LAWYER_FEE_MIN_EUR,
  PRICING_PLANS,
  monthlyLabel,
  opsLabel,
} from "@/lib/pricing";


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
 * или към /plans с предварително избран план Предприемач.
 */
export function DocumentValueCard({
  canDownload,
  busy,
  onDownload,
  onDownloadDocx,
  busyDocx,
  needsAuth,
  onRegister,
  savedEur = LAWYER_FEE_MIN_EUR,
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
              <>
                <Button
                  onClick={onDownload}
                  disabled={busy || busyDocx}
                  className="flex-1 gap-2 bg-gradient-gold text-navy hover:shadow-gold"
                >
                  {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileDown className="h-4 w-4" aria-hidden />}
                  Свали PDF
                </Button>
                {onDownloadDocx && (
                  <Button
                    onClick={onDownloadDocx}
                    disabled={busy || busyDocx}
                    variant="outline"
                    className="flex-1 gap-2 border-gold/40 text-gold hover:bg-gold/10 hover:text-gold"
                  >
                    {busyDocx ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : <FileText className="h-4 w-4" aria-hidden />}
                    Свали DOCX
                  </Button>
                )}
              </>
            ) : (
              <Button asChild className="flex-1 gap-2 bg-gradient-gold text-navy hover:shadow-gold">
                <Link to="/plans?plan=entrepreneur&from=document">
                  <FileDown className="h-4 w-4" aria-hidden />
                  Изтегли документа
                </Link>
              </Button>
            )}
          </div>

          {canDownload && !needsAuth && (
            <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
              Свалянето (PDF или DOCX) използва <span className="font-medium text-foreground">1 операция</span> —
              повторно сваляне на същия документ в тази сесия е безплатно.{" "}
              План {PRICING_PLANS.free.name} включва{" "}
              <span className="font-medium text-foreground">
                {FREE_OPS_PER_MONTH} безплатни операции/месец
              </span>
              .
            </p>
          )}

          {!canDownload && !needsAuth && (
            <div className="mt-2 space-y-1 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.06] px-3 py-2">
              <p className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400">
                {roiSubtitle("professional")} с план {PRICING_PLANS.professional.name} за{" "}
                {monthlyLabel("professional")}
              </p>
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                За сваляне е нужна 1 операция. {PRICING_PLANS.professional.name} —{" "}
                {monthlyLabel("professional")} ({opsLabel("professional")}),{" "}
                {PRICING_PLANS.entrepreneur.name} — {monthlyLabel("entrepreneur")} (
                {opsLabel("entrepreneur")}), или еднократен пакет операции.
              </p>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
