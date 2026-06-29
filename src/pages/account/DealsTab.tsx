import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Briefcase, Loader2, Plus, ExternalLink, Search, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useDeals, dealStatusLabel, dealStatusColor } from "@/hooks/useDeals";
import { cn } from "@/lib/utils";
import { exportCsv } from "@/lib/csv";

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString("bg-BG", { day: "2-digit", month: "2-digit", year: "numeric" });
  } catch {
    return "";
  }
}

export default function DealsTab() {
  const { deals, loading, create } = useDeals();
  const [q, setQ] = useState("");

  // Chronological order (newest first) — same as Контрагенти/Документи
  const ordered = useMemo(() => {
    const list = [...deals].sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
    );
    if (!q.trim()) return list;
    const s = q.trim().toLowerCase();
    return list.filter(
      (d) =>
        d.title.toLowerCase().includes(s) ||
        (d.counterparty ?? "").toLowerCase().includes(s),
    );
  }, [deals, q]);

  const onCreate = async () => {
    const d = await create({ title: "Нова сделка" });
    if (d) {
      window.location.href = `/console/deals`;
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="font-serif text-xl font-bold">Сделки</h2>
          <p className="text-xs text-muted-foreground">
            Синхронизирано с Workspace · {deals.length} {deals.length === 1 ? "сделка" : "сделки"}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Търси сделка или контрагент…"
              className="h-9 w-full pl-8 text-xs sm:w-64"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={ordered.length === 0}
            onClick={() =>
              exportCsv(
                `sdelki-${new Date().toISOString().slice(0, 10)}.csv`,
                ordered.map((d) => ({
                  title: d.title,
                  status: dealStatusLabel(d.status as any),
                  counterparty: (d as any).counterparty ?? "",
                  value: (d as any).value ?? "",
                  currency: (d as any).currency ?? "",
                  created_at: formatDate(d.created_at),
                })),
                [
                  { key: "title", label: "Заглавие" },
                  { key: "status", label: "Статус" },
                  { key: "counterparty", label: "Контрагент" },
                  { key: "value", label: "Стойност" },
                  { key: "currency", label: "Валута" },
                  { key: "created_at", label: "Създадена" },
                ],
              )
            }
          >
            <Download className="mr-1 h-3.5 w-3.5" /> CSV
          </Button>
          <Button asChild variant="outline" size="sm" className="border-gold/60 text-gold hover:bg-gold/10">
            <Link to="/console/deals">
              <ExternalLink className="mr-1 h-3.5 w-3.5" /> Workspace
            </Link>
          </Button>
          <Button onClick={onCreate} size="sm" className="bg-gradient-gold text-navy hover:shadow-gold">
            <Plus className="mr-1 h-3.5 w-3.5" /> Нова сделка
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : ordered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border/60 bg-card/30 p-10 text-center">
          <Briefcase className="mx-auto mb-3 h-8 w-8 text-muted-foreground/60" />
          <p className="text-sm text-muted-foreground">
            {q ? "Няма сделки по това търсене." : "Все още няма сделки."}
          </p>
          {!q && (
            <Button onClick={onCreate} size="sm" className="mt-4 bg-gradient-gold text-navy hover:shadow-gold">
              <Plus className="mr-1 h-3.5 w-3.5" /> Създай първа сделка
            </Button>
          )}
        </div>
      ) : (
        <ul className="divide-y divide-border/40 overflow-hidden rounded-xl border border-border/60 bg-card/30">
          {ordered.map((d) => (
            <li key={d.id}>
              <Link
                to={`/console/deals`}
                className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-muted/30"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gold/10 text-gold">
                  <Briefcase className="h-4 w-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="line-clamp-1 text-sm font-medium text-foreground">{d.title}</span>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide",
                        dealStatusColor(d.status),
                      )}
                    >
                      {dealStatusLabel(d.status)}
                    </span>
                  </div>
                  <div className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
                    {[d.counterparty, d.amount_eur ? `${Number(d.amount_eur).toFixed(2)} €` : null, formatDate(d.created_at)]
                      .filter(Boolean)
                      .join(" · ")}
                  </div>
                </div>
                <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
