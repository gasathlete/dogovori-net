import { Check, X, Minus } from "lucide-react";

type Cell = "yes" | "no" | "partial" | string;

const ROWS: { label: string; us: Cell; lawyer: Cell; free: Cell }[] = [
  { label: "Цена за документ", us: "от 0,13 €", lawyer: "150–400 €", free: "0 €" },
  { label: "Време до готов документ", us: " 2-3 мин.", lawyer: "1–5 дни", free: "30–60 мин." },
  { label: "Юридическа валидност (ЗЗД·ТЗ·ЗУТ)", us: "yes", lawyer: "yes", free: "partial" },
  { label: "AI риск-анализ", us: "yes", lawyer: "partial", free: "no" },
  { label: "Електронен подпис", us: "yes", lawyer: "partial", free: "no" },
  { label: "Корекции и поддръжка", us: "yes", lawyer: "partial", free: "no" },
];

const COLUMNS: { key: "us" | "lawyer" | "free"; label: string; highlight?: boolean }[] = [
  { key: "us", label: "Договори.нет", highlight: true },
  { key: "lawyer", label: "Адвокат" },
  { key: "free", label: "СТАРИ БЛАНКИ \nВ ГУГЪЛ" },
];

function Mark({ value }: { value: Cell }) {
  if (value === "yes")
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-emerald-500/45 bg-emerald-500/15 text-emerald-500">
        <Check className="h-3.5 w-3.5" />
      </span>
    );
  if (value === "no")
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-red-500/45 bg-red-500/15 text-red-500">
        <X className="h-3.5 w-3.5" />
      </span>
    );
  if (value === "partial")
    return (
      <span className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-border/60 bg-muted/30 text-muted-foreground">
        <Minus className="h-3.5 w-3.5" />
      </span>
    );
  return <span className="text-sm font-semibold text-foreground sm:text-[15px]">{value}</span>;
}

export function ComparisonTable() {
  return (
    <section className="container py-20 sm:py-24 md:py-28">
      <div className="mx-auto mb-10 max-w-2xl text-center">
        <div className="eyebrow mb-3 justify-center">Сравнение</div>
        <h2 className="font-serif text-3xl font-bold leading-tight text-balance sm:text-4xl md:text-5xl">
          Договор<span className="text-gold font-black text-[1.12em] tracking-tight">И</span> твоята най-добра сделка още днес.
        </h2>
        <p className="mt-3 text-sm text-muted-foreground sm:text-base">
          Цена, скорост и сигурност в едно — без компромис със закона.
        </p>
      </div>

      {/* Mobile: stacked cards per criterion */}
      <div className="mx-auto max-w-5xl space-y-3 sm:hidden">
        {ROWS.map((r) => (
          <div
            key={r.label}
            className="rounded-xl border border-border/60 bg-card/30 p-4"
          >
            <div className="mb-3 text-sm font-semibold text-foreground">{r.label}</div>
            <ul className="space-y-2">
              {COLUMNS.map((c) => (
                <li
                  key={c.key}
                  className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 ${
                    c.highlight
                      ? "border border-gold/30 bg-gold/[0.06]"
                      : "border border-border/40 bg-background/40"
                  }`}
                >
                  <span
                    className={`text-[11px] font-semibold uppercase tracking-[0.14em] ${
                      c.highlight ? "text-gold" : "text-muted-foreground"
                    }`}
                  >
                    {c.label}
                  </span>
                  <Mark value={r[c.key]} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      {/* Tablet+ : full comparison table */}
      <div className="mx-auto hidden max-w-5xl overflow-x-auto rounded-xl border border-border/60 sm:block">
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
                НЕПРОВЕРЕН DOC.
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
