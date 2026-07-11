import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useConsoleStore } from "@/hooks/useConsoleStore";
import { Users, Briefcase, Loader2 } from "@/icons";

export function ClientPane({ counterparty }: { counterparty: string }) {
  const { openTab } = useConsoleStore();
  const [deals, setDeals] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("deals" as any)
        .select("*")
        .eq("counterparty", counterparty)
        .order("updated_at", { ascending: false });
      setDeals(data ?? []);
      setLoading(false);
    })();
  }, [counterparty]);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <div className="flex items-center gap-3">
        <div className="flex h-12 w-12 items-center justify-center rounded-full bg-gold/15 text-gold">
          <Users className="h-6 w-6" />
        </div>
        <div>
          <h1 className="font-serif text-2xl font-bold">{counterparty}</h1>
          <p className="text-xs text-muted-foreground">Клиент / контрагент</p>
        </div>
      </div>

      <h2 className="mt-8 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
        Сделки
      </h2>
      {loading ? (
        <Loader2 className="mt-4 h-5 w-5 animate-spin text-muted-foreground" />
      ) : deals.length === 0 ? (
        <p className="mt-3 text-sm text-muted-foreground">Няма сделки с този клиент.</p>
      ) : (
        <ul className="mt-3 space-y-2">
          {deals.map((d) => (
            <li key={d.id}>
              <button
                type="button"
                onClick={() => openTab({ kind: "deal", entityId: d.id, title: d.title })}
                className="flex w-full items-center justify-between rounded-lg border border-border/40 px-3 py-2.5 hover:border-gold/40 hover:bg-muted/20"
              >
                <span className="flex items-center gap-2">
                  <Briefcase className="h-4 w-4 text-gold" />
                  <span className="text-sm">{d.title}</span>
                </span>
                <span className="text-xs text-muted-foreground">
                  {d.amount_eur ? `${Number(d.amount_eur).toFixed(2)} €` : ""}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
