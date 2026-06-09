import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export type DealStatus =
  | "draft"
  | "negotiating"
  | "signing"
  | "active"
  | "closed"
  | "archived";

export interface Deal {
  id: string;
  user_id: string;
  team_id: string | null;
  title: string;
  status: DealStatus;
  counterparty: string | null;
  counterparty_email: string | null;
  amount_eur: number | null;
  due_date: string | null;
  tags: string[];
  notes: string | null;
  pinned: boolean;
  created_at: string;
  updated_at: string;
}

export function useDeals() {
  const { user } = useAuth();
  const [deals, setDeals] = useState<Deal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) {
      setDeals([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data, error } = await supabase
      .from("deals" as any)
      .select("*")
      .order("pinned", { ascending: false })
      .order("updated_at", { ascending: false });
    if (!error && data) setDeals(data as unknown as Deal[]);
    setLoading(false);
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  const create = useCallback(
    async (input: Partial<Deal>): Promise<Deal | null> => {
      if (!user) return null;
      const payload: Record<string, unknown> = {
        user_id: user.id,
        title: input.title || "Нова сделка",
        status: input.status || "draft",
        counterparty: input.counterparty ?? null,
        counterparty_email: input.counterparty_email ?? null,
        amount_eur: input.amount_eur ?? null,
        due_date: input.due_date ?? null,
        tags: input.tags ?? [],
        notes: input.notes ?? null,
        team_id: input.team_id ?? null,
      };
      const { data, error } = await supabase
        .from("deals" as any)
        .insert(payload)
        .select("*")
        .single();
      if (error || !data) return null;
      const deal = data as unknown as Deal;
      setDeals((prev) => [deal, ...prev]);
      return deal;
    },
    [user],
  );

  const update = useCallback(
    async (id: string, patch: Partial<Deal>): Promise<Deal | null> => {
      const { data, error } = await supabase
        .from("deals" as any)
        .update(patch as any)
        .eq("id", id)
        .select("*")
        .single();
      if (error || !data) return null;
      const deal = data as unknown as Deal;
      setDeals((prev) => prev.map((d) => (d.id === id ? deal : d)));
      return deal;
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    const { error } = await supabase.from("deals" as any).delete().eq("id", id);
    if (!error) setDeals((prev) => prev.filter((d) => d.id !== id));
  }, []);

  return { deals, loading, reload: load, create, update, remove };
}

export function dealStatusLabel(s: DealStatus): string {
  const map: Record<DealStatus, string> = {
    draft: "Чернова",
    negotiating: "Преговори",
    signing: "За подпис",
    active: "Активна",
    closed: "Приключена",
    archived: "Архив",
  };
  return map[s];
}

export function dealStatusColor(s: DealStatus): string {
  const map: Record<DealStatus, string> = {
    draft: "bg-muted text-muted-foreground",
    negotiating: "bg-blue-500/15 text-blue-300 border-blue-500/30",
    signing: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    closed: "bg-slate-500/15 text-slate-300 border-slate-500/30",
    archived: "bg-zinc-700/30 text-zinc-400 border-zinc-600/30",
  };
  return map[s];
}
