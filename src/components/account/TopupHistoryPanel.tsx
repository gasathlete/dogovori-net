import { useEffect, useState } from "react";
import { Sparkles, Receipt } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getStripeEnvironment } from "@/lib/stripe";

type TopupRow = {
  id: string;
  created_at: string;
  ops_added: number;
  amount_eur: number | null;
  price_id: string;
};

const PRICE_LABEL: Record<string, string> = {
  topup_10_ops: "Пакет 10 операции",
  topup_20_ops: "Пакет 20 операции",
  topup_50_ops: "Пакет 50 операции",
  topup_100_ops: "Пакет 100 операции",
  five_operations: "Пакет 5 операции",
};

function priceLabel(price_id: string, ops: number): string {
  return PRICE_LABEL[price_id] ?? `Пакет ${ops} операции`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString("bg-BG", {
      day: "2-digit", month: "2-digit", year: "numeric",
      hour: "2-digit", minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

export function TopupHistoryPanel() {
  const { user } = useAuth();
  const [rows, setRows] = useState<TopupRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("topup_purchases")
        .select("id,created_at,ops_added,amount_eur,price_id")
        .eq("user_id", user.id)
        .eq("environment", getStripeEnvironment())
        .order("created_at", { ascending: false })
        .limit(10);
      if (!cancelled) {
        setRows((data ?? []) as TopupRow[]);
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  if (!loading && rows.length === 0) return null;

  const totalOps = rows.reduce((s, r) => s + (r.ops_added ?? 0), 0);

  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-6">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-gold" />
          <div>
            <p className="font-medium">История на топ-ъп пакетите</p>
            <p className="text-xs text-muted-foreground">Последните 10 покупки на допълнителни операции</p>
          </div>
        </div>
        <div className="text-right text-xs text-muted-foreground">
          Общо: <span className="font-semibold text-foreground">{totalOps}</span> операции
        </div>
      </div>

      {loading ? (
        <div className="py-6 text-center text-sm text-muted-foreground">Зареждане…</div>
      ) : (
        <ul className="divide-y divide-border/40">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
              <div className="min-w-0">
                <div className="flex items-center gap-2 truncate font-medium">
                  <Receipt className="h-3.5 w-3.5 shrink-0 text-gold" />
                  {priceLabel(r.price_id, r.ops_added)}
                </div>
                <div className="text-[11px] text-muted-foreground">{formatDate(r.created_at)}</div>
              </div>
              <div className="shrink-0 text-right">
                <div className="font-semibold text-gold">+{r.ops_added} оп.</div>
                {r.amount_eur != null && (
                  <div className="text-[11px] text-muted-foreground">
                    {r.amount_eur.toFixed(2)} €
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
