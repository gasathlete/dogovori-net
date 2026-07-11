import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { queryClient } from "@/lib/queryClient";

/**
 * Shared cache for the caller's row in `public.download_quota`.
 *
 * Before this hook, the same row was queried up to 6× per page load — every
 * mount of useIsPro / useDocumentAccess / individual pages fired its own
 * SELECT. That showed up as the #2 slow query in production
 * (`SELECT download_quota WHERE user_id=…` — 6 000+ calls, 17 s total time).
 *
 * With one shared React Query key `["download-quota", userId]` and a
 * 60-second `staleTime`, all consumers on a page share a single fetch. Under
 * a 50-VU mixed load this collapses ~10 identical SELECTs into 1.
 *
 * Callers that only need a couple of fields still SELECT the full row — the
 * bandwidth cost is negligible next to the round-trip savings, and it means
 * every consumer is served from the same cached copy.
 */
export type DownloadQuotaRow = {
  plan: string | null;
  pro_until: string | null;
  monthly_total_used: number | null;
  pro_monthly_used: number | null;
  ai_messages_used: number | null;
  analysis_previews_used: number | null;
  bilingual_previews_used: number | null;
  corrections_free_used: boolean | null;
  free_signing_used: boolean | null;
  signup_at: string | null;
  plan_ops_cap: number | null;
  topup_ops_balance: number | null;
  contracts_used: number | null;
  templates_used: number | null;
  bonus_contracts: number | null;
  corrections_free_used_count: number | null;
  // Any other columns present on the row remain accessible via the raw shape.
  [key: string]: unknown;
};

const QUOTA_SELECT =
  "plan, pro_until, monthly_total_used, pro_monthly_used, ai_messages_used, analysis_previews_used, bilingual_previews_used, corrections_free_used, free_signing_used, signup_at, plan_ops_cap, topup_ops_balance, contracts_used, templates_used, bonus_contracts, corrections_free_used_count";

export const quotaQueryKey = (userId: string) => ["download-quota", userId] as const;

async function fetchQuotaRow(userId: string): Promise<DownloadQuotaRow | null> {
  const { data } = await supabase
    .from("download_quota")
    .select(QUOTA_SELECT)
    .eq("user_id", userId)
    .maybeSingle();
  return (data as DownloadQuotaRow | null) ?? null;
}

/**
 * Imperative fetch — safe to call from Promise.all / event handlers.
 * Reuses the same cache as `useQuota()`, so a component that mounts right
 * after this call sees the cached row instantly.
 */
export function fetchQuotaCached(userId: string): Promise<DownloadQuotaRow | null> {
  return queryClient.fetchQuery({
    queryKey: quotaQueryKey(userId),
    queryFn: () => fetchQuotaRow(userId),
    staleTime: 60_000,
  });
}

/** Invalidate the cached quota row (e.g. after a download / correction / top-up). */
export function invalidateQuota(userId?: string | null) {
  if (userId) {
    void queryClient.invalidateQueries({ queryKey: quotaQueryKey(userId) });
  } else {
    void queryClient.invalidateQueries({ queryKey: ["download-quota"] });
  }
}

export function useQuota() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id ?? null;

  const query = useQuery({
    queryKey: userId ? quotaQueryKey(userId) : ["download-quota", "anon"],
    queryFn: () => fetchQuotaRow(userId!),
    enabled: !!userId,
    staleTime: 60_000,
    gcTime: 5 * 60_000,
  });

  const isPro = useMemo(() => {
    const q = query.data;
    if (!q) return false;
    return q.plan === "pro" || (!!q.pro_until && new Date(q.pro_until) > new Date());
  }, [query.data]);

  return {
    quota: query.data ?? null,
    loading: !!userId && query.isPending,
    isPro,
    refresh: () =>
      userId ? qc.invalidateQueries({ queryKey: quotaQueryKey(userId) }) : Promise.resolve(),
  };
}
