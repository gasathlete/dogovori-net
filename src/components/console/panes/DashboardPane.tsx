import { useEffect, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { supabase } from "@/integrations/supabase/client";
import { useDeals } from "@/hooks/useDeals";
import { useConsoleStore } from "@/hooks/useConsoleStore";
import { Briefcase, FileText, FileUp, PenSquare, Plus } from "lucide-react";

function KpiCard({ label, value, icon: Icon }: { label: string; value: string | number; icon: any }) {
  return (
    <div className="rounded-xl border border-border/60 bg-card/40 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        <Icon className="h-4 w-4 text-gold" />
      </div>
      <div className="mt-2 font-serif text-2xl font-semibold">{value}</div>
    </div>
  );
}

export function DashboardPane() {
  const { user } = useAuth();
  const { deals } = useDeals();
  const { openTab, setSection } = useConsoleStore();
  const [docsCount, setDocsCount] = useState(0);
  const [uploadedCount, setUploadedCount] = useState(0);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ count: d }, { count: u }] = await Promise.all([
        supabase.from("saved_documents").select("id", { count: "exact", head: true }).eq("user_id", user.id),
        supabase.from("uploaded_contracts").select("id", { count: "exact", head: true }).eq("user_id", user.id),
      ]);
      setDocsCount(d ?? 0);
      setUploadedCount(u ?? 0);
    })();
  }, [user]);

  const signingCount = deals.filter((d) => d.status === "signing").length;
  const activeCount = deals.filter((d) => d.status === "active" || d.status === "negotiating").length;

  return (
    <div className="mx-auto max-w-6xl space-y-6 p-6">
      <div>
        <h1 className="font-serif text-2xl font-bold">Архитект на сделките</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Работен плот с табове и multitasking за вашите документи и сделки.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <KpiCard label="Активни сделки" value={activeCount} icon={Briefcase} />
        <KpiCard label="За подпис" value={signingCount} icon={PenSquare} />
        <KpiCard label="Документи" value={docsCount} icon={FileText} />
        <KpiCard label="Качени" value={uploadedCount} icon={FileUp} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-border/60 bg-card/40 p-5">
          <h2 className="font-serif text-lg font-semibold">Бързи действия</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setSection("deals")}
              className="inline-flex items-center gap-2 rounded-md bg-gold/15 px-3 py-2 text-sm text-gold hover:bg-gold/25"
            >
              <Plus className="h-4 w-4" /> Нова сделка
            </button>
            <a
              href="/catalog"
              className="inline-flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm hover:bg-muted/40"
            >
              Изготви по шаблон
            </a>
            <a
              href="/build"
              className="inline-flex items-center gap-2 rounded-md border border-border/60 px-3 py-2 text-sm hover:bg-muted/40"
            >
              Качи и анализирай
            </a>
          </div>
        </div>

        <div className="rounded-xl border border-border/60 bg-card/40 p-5">
          <h2 className="font-serif text-lg font-semibold">Последни сделки</h2>
          {deals.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">Все още няма сделки.</p>
          ) : (
            <ul className="mt-3 space-y-1">
              {deals.slice(0, 5).map((d) => (
                <li key={d.id}>
                  <button
                    type="button"
                    onClick={() => openTab({ kind: "deal", entityId: d.id, title: d.title })}
                    className="flex w-full items-center justify-between rounded-md px-2 py-1.5 text-sm hover:bg-muted/30"
                  >
                    <span className="truncate">{d.title}</span>
                    <span className="text-xs text-muted-foreground">
                      {d.counterparty ?? "—"}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
