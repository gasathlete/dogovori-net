/**
 * Статус на потвърждението на абонамента и оставащо време до следващата сума.
 *
 * Панелът показва само това, което базата вече е потвърдила чрез платежния
 * webhook. Когато има започнато, но непотвърдено плащане, се показва ясно
 * изчакване с връзка към довършване — за да не се губи намерението.
 */
import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CheckCircle2, Clock, CreditCard, ShieldCheck } from "@/icons";
import { Button } from "@/components/ui/button";
import { readCheckoutIntent, intentPlanLabel } from "@/lib/checkoutIntent";

export interface SubscriptionStatusInput {
  status: string | null;
  price_id: string | null;
  current_period_end: string | null;
  cancel_at_period_end: boolean | null;
  environment: "sandbox" | "live";
}

const CONFIRMED_STATUSES = ["active", "trialing"];

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString("bg-BG", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

/** Оставащо време в цели дни, часове и минути — без закръгляне нагоре. */
export function remainingParts(endIso: string, now: number): { days: number; hours: number; minutes: number } | null {
  const end = new Date(endIso).getTime();
  if (!Number.isFinite(end)) return null;
  const ms = end - now;
  if (ms <= 0) return null;
  const minutes = Math.floor(ms / 60000);
  return {
    days: Math.floor(minutes / (60 * 24)),
    hours: Math.floor((minutes % (60 * 24)) / 60),
    minutes: minutes % 60,
  };
}

export function remainingLabel(endIso: string, now: number): string {
  const parts = remainingParts(endIso, now);
  if (!parts) return "периодът изтече";
  if (parts.days > 0) return `${parts.days} дни и ${parts.hours} ч.`;
  if (parts.hours > 0) return `${parts.hours} ч. и ${parts.minutes} мин.`;
  return `${parts.minutes} мин.`;
}

export function SubscriptionStatusPanel({
  sub,
  priceLabel,
  onResume,
}: {
  sub: SubscriptionStatusInput | null;
  /** Етикет на плана, форматиран от единствения източник за цените (@/lib/pricing). */
  priceLabel?: string;
  onResume?: (priceId: string) => void;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000);
    return () => window.clearInterval(id);
  }, []);

  const intent = useMemo(() => (sub ? null : readCheckoutIntent()), [sub]);

  // Няма нито абонамент, нито започнато плащане — панелът няма какво да каже.
  if (!sub && !intent) return null;

  if (!sub && intent) {
    return (
      <div
        data-testid="subscription-status-panel"
        className="rounded-2xl border border-amber-500/40 bg-amber-500/[0.07] p-6"
      >
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0 text-amber-500" aria-hidden />
          <div className="flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-amber-600 dark:text-amber-400">
              Статус на потвърждението
            </p>
            <h3 className="mt-1 font-serif text-lg font-bold">Плащането не е потвърдено</h3>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Започнахте {intentPlanLabel(intent)}, но плащане не е потвърдено, затова
              достъпът остава по безплатния план. Можете да довършите оттам, където спряхте.
            </p>
            <Button
              className="mt-3 min-h-11 bg-gradient-gold text-navy hover:shadow-gold"
              onClick={() => onResume?.(intent.priceId)}
            >
              <CreditCard className="mr-2 h-4 w-4" aria-hidden /> Довърши плащането
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const status = sub!.status ?? "";
  const confirmed = CONFIRMED_STATUSES.includes(status);
  const failing = ["past_due", "unpaid", "incomplete"].includes(status);
  const end = sub!.current_period_end;
  const willRenew = confirmed && !sub!.cancel_at_period_end;

  return (
    <div
      data-testid="subscription-status-panel"
      className={`rounded-2xl border p-6 ${
        confirmed
          ? "border-emerald-500/35 bg-emerald-500/[0.06]"
          : failing
          ? "border-destructive/40 bg-destructive/[0.07]"
          : "border-border/60 bg-card/40"
      }`}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            Статус на потвърждението
          </p>
          <p className="mt-2 flex items-center gap-2 font-serif text-lg font-bold">
            {confirmed ? (
              <>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" aria-hidden />
                Плащането е потвърдено
              </>
            ) : failing ? (
              <>
                <AlertTriangle className="h-4 w-4 text-destructive" aria-hidden />
                Плащането не е потвърдено
              </>
            ) : (
              <>
                <Clock className="h-4 w-4 text-muted-foreground" aria-hidden />
                Абонаментът е {status || "без статус"}
              </>
            )}
          </p>
          <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
            {confirmed
              ? `Достъпът е активен${priceLabel ? ` · ${priceLabel}` : ""}. Потвърждението идва от платежния доставчик, не от браузъра.`
              : failing
              ? "Опитайте отново през платежния портал, за да не прекъсне достъпът."
              : "Достъпът следва статуса на абонамента при платежния доставчик."}
          </p>
          <p className="mt-2 inline-flex items-center gap-1.5 text-xs text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5 text-gold" aria-hidden />
            Режим: {sub!.environment === "live" ? "реални плащания" : "тест"}
          </p>
        </div>

        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground">
            {willRenew ? "До следващата сума" : "Достъп до"}
          </p>
          {end ? (
            <>
              <p className="mt-2 font-serif text-2xl font-bold tabular-nums text-gold">
                {remainingLabel(end, now)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">{formatDateTime(end)}</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {willRenew
                  ? `На тази дата се таксува следващият период${priceLabel ? ` (${priceLabel})` : ""}.`
                  : "След тази дата планът се прекратява и нова сума не се дължи."}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm text-muted-foreground">
              Датата на следващото плащане ще се покаже след потвърждение от платежния доставчик.
            </p>
          )}
          <Button asChild variant="outline" size="sm" className="mt-3 min-h-11 border-gold/40">
            <Link to="/plans">Виж плановете</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}

export default SubscriptionStatusPanel;
