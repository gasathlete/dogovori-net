import { useMemo } from "react";
import { Clock, Euro, TrendingUp, Share2, Sparkles } from "lucide-react";
import { trackFunnelEvent } from "@/lib/funnel";
import { toast } from "sonner";

/**
 * SavingsSnapshot — engagement loop card for the account dashboard.
 *
 * Converts the user's lifetime operations into two emotionally meaningful
 * numbers (money saved vs. lawyer baseline + hours saved) and offers a
 * one-tap share. Reinforces the value-per-operation framing the funnel
 * uses on /analiz and /plans (lawyer ~290 € / doc, ~3 h / doc).
 */

const LAWYER_AVG_EUR = 290;
const LAWYER_AVG_HOURS = 3;

interface Props {
  totalOps: number;
  monthlyOps: number;
}

export function SavingsSnapshot({ totalOps, monthlyOps }: Props) {
  const moneySaved = totalOps * LAWYER_AVG_EUR;
  const hoursSaved = totalOps * LAWYER_AVG_HOURS;
  const monthMoney = monthlyOps * LAWYER_AVG_EUR;

  // Progress towards the next "milestone" — every 1 000 € feels rewarding.
  const nextMilestone = useMemo(() => {
    if (moneySaved < 290) return 290;
    if (moneySaved < 1_000) return 1_000;
    if (moneySaved < 5_000) return 5_000;
    if (moneySaved < 10_000) return 10_000;
    return Math.ceil((moneySaved + 1) / 10_000) * 10_000;
  }, [moneySaved]);
  const progressPct = Math.min(100, Math.round((moneySaved / nextMilestone) * 100));

  const share = async () => {
    const text =
      totalOps > 0
        ? `Спестих ${moneySaved.toLocaleString("bg-BG")} € и ~${hoursSaved} ч. правни консултации с DogovaryAI. Опитай и ти:`
        : "Изготвям договорите си с DogovaryAI — над 600 шаблона + AI анализ на риска:";
    const url = "https://dogovori.net?ref=savings";
    trackFunnelEvent("savings_share_click", { totalOps, moneySaved });
    try {
      if (navigator.share) {
        await navigator.share({ title: "DogovaryAI", text, url });
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast.success("Линкът е копиран");
      }
    } catch {
      /* user cancelled */
    }
  };

  const empty = totalOps === 0;

  return (
    <div className="md:col-span-3">
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.06] via-card to-card p-4 shadow-soft sm:p-5">
        {/* Decorative blob */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl"
        />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="h-3 w-3" />
              Твоите спестявания
            </p>
            <h3 className="mt-1.5 font-serif text-lg font-bold leading-tight sm:text-xl">
              {empty
                ? "Готов си да започнеш да пестиш"
                : "Колко ти струваше адвокат — досега"}
            </h3>
          </div>
          <button
            type="button"
            onClick={share}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-background/60 px-2.5 py-1.5 text-[11px] font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400"
          >
            <Share2 className="h-3 w-3" />
            Сподели
          </button>
        </div>

        {/* Two big stats */}
        <div className="relative mt-4 grid grid-cols-2 gap-2.5">
          <Stat
            icon={<Euro className="h-3.5 w-3.5" />}
            label="спестени"
            value={`${moneySaved.toLocaleString("bg-BG")} €`}
            sub={
              empty
                ? "Спрямо адвокат ~290 €/документ"
                : `~290 € × ${totalOps} операции`
            }
            tone="emerald"
          />
          <Stat
            icon={<Clock className="h-3.5 w-3.5" />}
            label="спестено време"
            value={hoursSaved >= 24 ? `${Math.round(hoursSaved / 24)} дни` : `${hoursSaved} ч.`}
            sub={empty ? "~3 часа на документ" : `~3 ч. × ${totalOps} операции`}
            tone="gold"
          />
        </div>

        {/* Monthly mini chart — proportional bar */}
        <div className="relative mt-4 rounded-xl border border-border/60 bg-background/40 px-3 py-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Този месец</span>
            <span className="font-semibold text-foreground tabular-nums">
              {monthMoney.toLocaleString("bg-BG")} €{" "}
              <span className="text-muted-foreground">· {monthlyOps} оп.</span>
            </span>
          </div>
          <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-700"
              style={{ width: `${Math.min(100, Math.round((monthlyOps / Math.max(totalOps || 1, monthlyOps, 5)) * 100))}%` }}
            />
          </div>
        </div>

        {/* Milestone progress */}
        <div className="relative mt-3">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">
              <Sparkles className="mr-1 inline h-3 w-3 text-emerald-500" />
              Следваща цел
            </span>
            <span className="font-semibold tabular-nums text-foreground">
              {moneySaved.toLocaleString("bg-BG")} / {nextMilestone.toLocaleString("bg-BG")} €
            </span>
          </div>
          <div className="relative mt-1.5 h-2 overflow-hidden rounded-full bg-muted">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-gold/70 via-emerald-400 to-emerald-500 transition-all duration-700"
              style={{ width: `${progressPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function Stat({
  icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub: string;
  tone: "emerald" | "gold";
}) {
  const ring =
    tone === "emerald"
      ? "border-emerald-500/25 text-emerald-600 dark:text-emerald-400"
      : "border-gold/30 text-gold";
  return (
    <div className={`rounded-xl border bg-background/40 px-3 py-3 ${ring}`}>
      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
        {icon}
        {label}
      </div>
      <div className="mt-1 font-serif text-xl font-bold tabular-nums text-foreground sm:text-2xl">
        {value}
      </div>
      <div className="text-[10px] leading-tight text-muted-foreground">{sub}</div>
    </div>
  );
}
