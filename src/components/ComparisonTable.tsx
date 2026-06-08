import { Check, X, Minus } from "lucide-react";

type Cell = "yes" | "no" | "partial" | string;

const ROWS: { label: string; us: Cell; lawyer: Cell; free: Cell }[] = [
  { label: "Цена за документ", us: "0,10–1,90 €", lawyer: "150–400 €", free: "0 €" },
  { label: "Време за готов документ", us: "под 2 мин.", lawyer: "1–5 дни", free: "30–60 мин." },
  { label: "Юридическа валидност (ЗЗД·ТЗ·ЗУТ)", us: "yes", lawyer: "yes", free: "partial" },
  { label: "AI риск-анализ", us: "yes", lawyer: "partial", free: "no" },
  { label: "Електронен подпис", us: "yes", lawyer: "partial", free: "no" },
  { label: "Корекции и поддръжка", us: "yes", lawyer: "partial", free: "no" },
];

function Mark({ value }: { value: Cell }) {
  if (value === "yes")
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gold/40 bg-gold/15 text-gold">
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  if (value === "no")
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/60 bg-muted/30 text-muted-foreground">
        <X className="h-3.5 w-3.5" />
      </span>
    );
  if (value === "partial")
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-gold/25 bg-gold/5 text-gold/60">
        <Minus className="h-3.5 w-3.5" />
      </span>
    );
  return <span className="text-sm font-semibold text-foreground sm:text-[15px]">{value}</span>;
}

export function ComparisonTable() {
  return (
    <section className="container py-14 sm:py-16 md:py-20">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <div className="eyebrow mb-3 justify-center">Сравнение</div>
        <h2 className="font-serif text-2xl font-bold leading-tight text-balance sm:text-3xl md:text-4xl">
          Защо Договори.нет, а не алтернативите
        </h2>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          Цена, скорост и сигурност в едно — без компромис със закона.
        </p>
      </div>

      <div className="mx-auto max-w-5xl overflow-x-auto rounded-xl border border-border/60">
        <table className="w-full min-w-[640px] border-collapse text-left">
          <thead>
            <tr className="border-b border-border/60 bg-card/40">
              <th className="sticky left-0 z-10 bg-card/80 px-4 py-4 text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:px-6">
                Критерий
              </th>
              <th className="bg-gold/10 px-4 py-4 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-gold sm:px-6">
                Договори.нет
              </th>
              <th className="px-4 py-4 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:px-6">
                Адвокат
              </th>
              <th className="px-4 py-4 text-center text-[11px] font-semibold uppercase tracking-[0.18em] text-muted-foreground sm:px-6">
                Безплатни PDF
              </th>
            </tr>
          </thead>
          <tbody>
            {ROWS.map((r, i) => (
              <tr
                key={r.label}
                className={i % 2 === 0 ? "bg-transparent" : "bg-card/20"}
              >
                <th
                  scope="row"
                  className="sticky left-0 z-10 bg-inherit px-4 py-4 text-sm font-medium text-foreground sm:px-6"
                  style={{ backgroundColor: i % 2 === 0 ? "transparent" : undefined }}
                >
                  {r.label}
                </th>
                <td className="bg-gold/[0.04] px-4 py-4 text-center sm:px-6">
                  <Mark value={r.us} />
                </td>
                <td className="px-4 py-4 text-center sm:px-6">
                  <Mark value={r.lawyer} />
                </td>
                <td className="px-4 py-4 text-center sm:px-6">
                  <Mark value={r.free} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
