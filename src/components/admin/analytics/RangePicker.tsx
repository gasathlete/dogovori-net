import { Button } from "@/components/ui/button";

export type AnalyticsRange = "24h" | "7d" | "30d";

export function RangePicker({ value, onChange }: { value: AnalyticsRange; onChange: (v: AnalyticsRange) => void }) {
  const opts: { id: AnalyticsRange; label: string }[] = [
    { id: "24h", label: "Last 24h" },
    { id: "7d", label: "Last 7d" },
    { id: "30d", label: "Last 30d" },
  ];
  return (
    <div className="inline-flex rounded-md border bg-card p-1">
      {opts.map((o) => (
        <Button
          key={o.id}
          size="sm"
          variant={value === o.id ? "default" : "ghost"}
          className="h-8"
          onClick={() => onChange(o.id)}
        >
          {o.label}
        </Button>
      ))}
    </div>
  );
}

export function rangeToBounds(r: AnalyticsRange): { from: string; to: string; bucket: "hour" | "day" } {
  const to = new Date();
  const from = new Date();
  let bucket: "hour" | "day" = "hour";
  if (r === "24h") { from.setHours(from.getHours() - 24); bucket = "hour"; }
  else if (r === "7d") { from.setDate(from.getDate() - 7); bucket = "day"; }
  else { from.setDate(from.getDate() - 30); bucket = "day"; }
  return { from: from.toISOString(), to: to.toISOString(), bucket };
}
