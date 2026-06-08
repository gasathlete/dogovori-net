import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Eye, MousePointerClick, Clock } from "lucide-react";

export type Kpis = { visitors: number; pageviews: number; bounce_rate: number; avg_duration_ms: number };

function fmtDuration(ms: number) {
  if (!ms || ms < 1000) return "0s";
  const s = Math.round(ms / 1000);
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

export function KpiCards({ data, loading }: { data: Kpis | null; loading?: boolean }) {
  const items = [
    { label: "Unique visitors", value: data ? data.visitors.toLocaleString() : "—", icon: Users },
    { label: "Pageviews", value: data ? data.pageviews.toLocaleString() : "—", icon: Eye },
    { label: "Bounce rate", value: data ? `${data.bounce_rate}%` : "—", icon: MousePointerClick },
    { label: "Avg visit duration", value: data ? fmtDuration(data.avg_duration_ms) : "—", icon: Clock },
  ];
  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
      {items.map((it) => (
        <Card key={it.label}>
          <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
            <CardTitle className="text-sm font-medium text-muted-foreground">{it.label}</CardTitle>
            <it.icon className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{loading ? "…" : it.value}</div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
