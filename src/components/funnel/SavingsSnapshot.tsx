import { FileText, TrendingUp, Share2, Sparkles } from "@/icons";
import { trackFunnelEvent } from "@/lib/funnel";
import { toast } from "sonner";
import { CATALOG_DOCUMENT_COUNT } from "@/lib/catalogStats";

/**
 * SavingsSnapshot — обобщение на реалната работа по документи в профила.
 *
 * Показва само измерими данни от акаунта: изразходвани действия общо и през
 * последните 30 дни. Без сравнения с външни хонорари, без изчислена икономия
 * на пари или време и без обещания за срок.
 */

interface Props {
  totalOps: number;
  monthlyOps: number;
}

export function SavingsSnapshot({ totalOps, monthlyOps }: Props) {
  const share = async () => {
    const text = `Изготвям документите си с DogovaryAI — ${CATALOG_DOCUMENT_COUNT} шаблона и анализ на риска:`;
    const url = "https://dogovori.net?ref=dashboard";
    trackFunnelEvent("savings_share_click", { totalOps });
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
  const monthShare = totalOps > 0 ? Math.min(100, Math.round((monthlyOps / totalOps) * 100)) : 0;

  return (
    <div className="md:col-span-3">
      <div className="relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-gradient-to-br from-emerald-500/[0.06] via-card to-card p-4 shadow-soft sm:p-5">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-12 -top-12 h-40 w-40 rounded-full bg-emerald-500/10 blur-3xl"
        />

        <div className="relative flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.18em] text-emerald-600 dark:text-emerald-400">
              <TrendingUp className="h-3 w-3" />
              Вашата активност
            </p>
            <h3 className="mt-1.5 font-serif text-lg font-bold leading-tight sm:text-xl">
              {empty ? "Още няма изразходвани действия" : "Работа по документи досега"}
            </h3>
          </div>
          <button
            type="button"
            onClick={share}
            className="inline-flex min-h-[44px] shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/30 bg-background/60 px-3 py-1.5 text-[11px] font-semibold text-emerald-600 transition-colors hover:bg-emerald-500/10 dark:text-emerald-400"
          >
            <Share2 className="h-3 w-3" />
            Споделете
          </button>
        </div>

        <div className="relative mt-4 grid grid-cols-2 gap-2.5">
          <Stat
            icon={<FileText className="h-3.5 w-3.5" />}
            label="действия общо"
            value={totalOps.toLocaleString("bg-BG")}
            sub="Сваляне, анализ или AI съобщение"
            tone="emerald"
          />
          <Stat
            icon={<Sparkles className="h-3.5 w-3.5" />}
            label="последните 30 дни"
            value={monthlyOps.toLocaleString("bg-BG")}
            sub={empty ? "Започнете с първия документ" : `${monthShare}% от всички досега`}
            tone="gold"
          />
        </div>

        <div className="relative mt-4 rounded-xl border border-border/60 bg-background/40 px-3 py-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-muted-foreground">Дял на последните 30 дни</span>
            <span className="font-semibold text-foreground tabular-nums">{monthShare}%</span>
          </div>
          <div className="relative mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
            <div
              className="absolute inset-y-0 left-0 rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-700"
              style={{ width: `${monthShare}%` }}
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
    <div className={`rounded-xl border bg-background/40 px-3 py-2.5 ${ring}`}>
      <p className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider">
        {icon}
        {label}
      </p>
      <p className="mt-1 font-serif text-xl font-bold tabular-nums text-foreground sm:text-2xl">
        {value}
      </p>
      <p className="mt-0.5 text-[11px] leading-tight text-muted-foreground">{sub}</p>
    </div>
  );
}

export default SavingsSnapshot;
