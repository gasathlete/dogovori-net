import {
  ResponsiveContainer, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid,
  Tooltip as RTooltip, Legend, AreaChart, Area,
} from "recharts";

export type TotalsDatum = { name: string; value: number; fill: string };
export type TimelineDatum = { date: string; label: string; created: number; analyses: number; corrections: number };

/**
 * Charts extracted into their own chunk so `recharts` (~200KB min+gz) is
 * lazy-loaded only when the dashboard tab is actually rendered and expanded.
 */
export default function DashboardCharts({
  totalsData,
  timelineData,
  hasAnyActivity,
  last30dOps,
  totalOps,
}: {
  totalsData: TotalsDatum[];
  timelineData: TimelineDatum[];
  hasAnyActivity: boolean;
  last30dOps: number;
  totalOps: number;
}) {
  return (
    <div className="md:col-span-3 grid gap-4 lg:grid-cols-5 border-t border-border/60 p-3 md:border-0 md:p-0">
      <div className="rounded-xl border border-border/60 bg-gradient-card p-4 sm:p-6 lg:col-span-2">
        <div className="mb-4 flex items-baseline justify-between gap-2">
          <h3 className="font-serif text-base sm:text-lg font-bold">Разпределение на операциите</h3>
          <span className="shrink-0 text-xs text-muted-foreground">общо</span>
        </div>
        {hasAnyActivity ? (
          <ResponsiveContainer width="100%" height={Math.max(220, totalsData.length * 36)}>
            <BarChart data={totalsData} layout="vertical" margin={{ top: 4, right: 16, left: 4, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" horizontal={false} />
              <XAxis type="number" allowDecimals={false} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis
                type="category"
                dataKey="name"
                width={92}
                tick={{ fill: "hsl(var(--foreground))", fontSize: 12 }}
                axisLine={false}
                tickLine={false}
              />
              <RTooltip
                cursor={{ fill: "hsl(var(--muted) / 0.3)" }}
                contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="value" radius={[0, 6, 6, 0]} barSize={18}>
                {totalsData.map((entry, idx) => (
                  <Cell key={idx} fill={entry.fill} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="py-12 text-center text-sm text-muted-foreground">Все още нямате извършени операции.</p>
        )}
      </div>

      <div className="rounded-xl border border-border/60 bg-gradient-card p-4 sm:p-6 lg:col-span-3">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-serif text-base sm:text-lg font-bold">Активност (последни 30 дни)</h3>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className="rounded-full border border-gold/40 bg-gold/10 px-2.5 py-1 text-[11px] font-medium text-gold"
              title="Операции през последните 30 дни"
            >
              Този месец: <span className="font-semibold">{last30dOps}</span>
            </span>
            <span
              className="rounded-full border border-border/60 bg-muted/30 px-2.5 py-1 text-[11px] font-medium text-muted-foreground"
              title="Общо извършени операции от регистрацията"
            >
              Общо: <span className="font-semibold text-foreground">{totalOps}</span>
            </span>
          </div>
        </div>
        <ResponsiveContainer width="100%" height={260}>
          <AreaChart data={timelineData} margin={{ top: 8, right: 12, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="gradCreated" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--gold))" stopOpacity={0.55} />
                <stop offset="100%" stopColor="hsl(var(--gold))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradAnalyses" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.5} />
                <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradCorrections" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="hsl(var(--accent))" stopOpacity={0.5} />
                <stop offset="100%" stopColor="hsl(var(--accent))" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border) / 0.4)" vertical={false} />
            <XAxis
              dataKey="label"
              tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
              axisLine={false}
              tickLine={false}
              interval="preserveStartEnd"
              minTickGap={28}
            />
            <YAxis allowDecimals={false} width={28} tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 11 }} axisLine={false} tickLine={false} />
            <RTooltip
              contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))", borderRadius: 8, fontSize: 12 }}
              labelStyle={{ color: "hsl(var(--foreground))" }}
            />
            <Legend wrapperStyle={{ fontSize: 11, paddingTop: 4 }} iconType="circle" />
            <Area type="monotone" dataKey="created" name="Създадени" stroke="hsl(var(--gold))" fill="url(#gradCreated)" strokeWidth={2} />
            <Area type="monotone" dataKey="analyses" name="Анализи" stroke="hsl(var(--primary))" fill="url(#gradAnalyses)" strokeWidth={2} />
            <Area type="monotone" dataKey="corrections" name="Корекции" stroke="hsl(var(--accent))" fill="url(#gradCorrections)" strokeWidth={2} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
