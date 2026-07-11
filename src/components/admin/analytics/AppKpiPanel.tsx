import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { UserPlus, Activity, CreditCard, TrendingUp } from "@/icons";

export type AppKpis = { signups: number; ops: number; paid_conversions: number; conversion_rate: number };

export function AppKpiPanel({ data }: { data: AppKpis | null }) {
  const items = [
    { label: "New signups", value: data?.signups ?? 0, icon: UserPlus },
    { label: "Operations", value: data?.ops ?? 0, icon: Activity },
    { label: "Paid conversions", value: data?.paid_conversions ?? 0, icon: CreditCard },
    { label: "Conversion rate", value: data ? `${data.conversion_rate}%` : "—", icon: TrendingUp },
  ];
  return (
    <Card>
      <CardHeader><CardTitle className="text-base">App KPIs</CardTitle></CardHeader>
      <CardContent>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {items.map((it) => (
            <div key={it.label} className="rounded-md border p-3">
              <div className="flex items-center justify-between text-muted-foreground text-xs">
                <span>{it.label}</span>
                <it.icon className="h-3.5 w-3.5" />
              </div>
              <div className="text-xl font-semibold mt-1">{typeof it.value === "number" ? it.value.toLocaleString() : it.value}</div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
