import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";

export type TopRow = { label: string; visitors: number; pageviews: number };

function Bar({ rows }: { rows: TopRow[] }) {
  const max = Math.max(1, ...rows.map((r) => r.visitors));
  if (!rows.length) return <p className="text-sm text-muted-foreground py-6 text-center">No data yet.</p>;
  return (
    <ul className="space-y-1">
      {rows.map((r) => (
        <li key={r.label} className="relative">
          <div className="absolute inset-y-0 left-0 bg-primary/10 rounded" style={{ width: `${(r.visitors / max) * 100}%` }} />
          <div className="relative flex justify-between items-center px-2 py-1.5 text-sm">
            <span className="truncate pr-2">{r.label}</span>
            <span className="tabular-nums text-muted-foreground">{r.visitors.toLocaleString()}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

export function TopList({ data }: { data: Record<string, TopRow[]> }) {
  const tabs = [
    { id: "path", label: "Pages" },
    { id: "referrer_host", label: "Sources" },
    { id: "country", label: "Countries" },
    { id: "device", label: "Devices" },
    { id: "browser", label: "Browsers" },
  ];
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Top</CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="path">
          <TabsList className="mb-3 flex-wrap h-auto">
            {tabs.map((t) => <TabsTrigger key={t.id} value={t.id}>{t.label}</TabsTrigger>)}
          </TabsList>
          {tabs.map((t) => (
            <TabsContent key={t.id} value={t.id}>
              <Bar rows={data[t.id] ?? []} />
            </TabsContent>
          ))}
        </Tabs>
      </CardContent>
    </Card>
  );
}
