import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

export type TimeseriesPoint = { bucket: string; visitors: number; pageviews: number };

export function TrafficChart({ data, bucket }: { data: TimeseriesPoint[]; bucket: "hour" | "day" }) {
  const fmt = (v: string) => {
    const d = new Date(v);
    return bucket === "hour"
      ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" })
      : d.toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
  };
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Traffic over time</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="h-72 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <defs>
                <linearGradient id="pvFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="vFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="hsl(var(--gold, var(--primary)))" stopOpacity={0.35} />
                  <stop offset="100%" stopColor="hsl(var(--gold, var(--primary)))" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
              <XAxis dataKey="bucket" tickFormatter={fmt} stroke="hsl(var(--muted-foreground))" fontSize={11} />
              <YAxis stroke="hsl(var(--muted-foreground))" fontSize={11} allowDecimals={false} />
              <Tooltip
                labelFormatter={(v) => new Date(v as string).toLocaleString("en-GB")}
                contentStyle={{ background: "hsl(var(--background))", border: "1px solid hsl(var(--border))", borderRadius: 8 }}
              />
              <Area type="monotone" dataKey="pageviews" stroke="hsl(var(--primary))" fill="url(#pvFill)" strokeWidth={2} />
              <Area type="monotone" dataKey="visitors" stroke="hsl(var(--gold, var(--primary)))" fill="url(#vFill)" strokeWidth={2} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}
