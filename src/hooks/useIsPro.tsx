import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { fetchQuotaCached } from "@/hooks/useQuota";
import { getStripeEnvironment } from "@/lib/stripe";

export interface FreeQuota {
  opsUsed: number;
  opsCap: number;
  aiMessagesUsed: number;
  aiMessagesCap: number;
  analysisPreviewsUsed: number;
  analysisPreviewsCap: number;
  bilingualPreviewsUsed: number;
  bilingualPreviewsCap: number;
  kitSlotsCap: number;
  correctionsFreeUsed: boolean;
  signingFreeUsed: boolean;
  signupAt: string | null;
  topupBalance: number;
}

interface ProState {
  isPro: boolean;
  isTeam: boolean;
  isEntrepreneur: boolean;
  isProfessional: boolean;
  loading: boolean;
  freeQuota: FreeQuota;
  refresh: () => Promise<void>;
}

const DEFAULT_FREE_QUOTA: FreeQuota = {
  opsUsed: 0,
  opsCap: 2,
  aiMessagesUsed: 0,
  aiMessagesCap: 5,
  analysisPreviewsUsed: 0,
  analysisPreviewsCap: 1,
  bilingualPreviewsUsed: 0,
  bilingualPreviewsCap: 1,
  kitSlotsCap: 1,
  correctionsFreeUsed: false,
  signingFreeUsed: false,
  signupAt: null,
  topupBalance: 0,
};

export function useIsPro(): ProState {
  const { user } = useAuth();
  const [state, setState] = useState<Omit<ProState, "refresh">>({
    isPro: false,
    isTeam: false,
    isEntrepreneur: false,
    isProfessional: false,
    loading: true,
    freeQuota: DEFAULT_FREE_QUOTA,
  });

  const refresh = useCallback(async () => {
    if (!user) {
      setState({ isPro: false, isTeam: false, isEntrepreneur: false, isProfessional: false, loading: false, freeQuota: DEFAULT_FREE_QUOTA });
      return;
    }
    const [q, { data: tm }, { data: sub }] = await Promise.all([
      // Shared cache: repeated mounts of useIsPro across the tree share one row.
      fetchQuotaCached(user.id),
      supabase
        .from("team_members")
        .select("team_id, teams!inner(status,environment,current_period_end)")
        .eq("user_id", user.id)
        .eq("teams.environment", getStripeEnvironment())
        .limit(1)
        .maybeSingle(),
      supabase
        .from("subscriptions")
        .select("price_id, status, current_period_end")
        .eq("user_id", user.id)
        .eq("environment", getStripeEnvironment())
        .in("status", ["active", "trialing", "past_due", "canceled"])
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    const activeSubscription = Boolean(sub && (!sub.current_period_end || new Date(sub.current_period_end)>new Date()) && sub.status !== "canceled") || Boolean(sub?.status === "canceled" && sub.current_period_end && new Date(sub.current_period_end)>new Date());
    const isPro = activeSubscription ||
      (q as any)?.plan === "pro" ||
      Boolean((q as any)?.pro_until && new Date((q as any).pro_until) > new Date());
    const t: any = tm;
    const isTeam = Boolean(t && t.teams?.status === "active" && (!t.teams.current_period_end || new Date(t.teams.current_period_end) > new Date()));
    const signupAt: string | null = (q as any)?.signup_at ?? null;
    // Derive cap for paid users from price_id (with grandfathered override),
    // otherwise free monthly cap (10 ops/mo for registered users).
    const priceId = (sub as any)?.price_id ?? null;
    const isEntrepreneur =
      priceId === "entrepreneur_monthly" || priceId === "entrepreneur_yearly";
    const isProfessional =
      priceId === "pro_monthly" || priceId === "pro_yearly" ||
      priceId === "professional_monthly" || priceId === "professional_yearly";
    const grandfathered = (q as any)?.plan_ops_cap as number | null;
    let opsCap: number;
    if (isPro) {
      // Предприемач (19.90€) = 100 ops/mo, Професионалист (12.90€) = 50 ops/mo,
      // Екип (109€/seat/год.) = 100 ops/seat/mo. Grandfathered override wins.
      if (grandfathered != null) opsCap = grandfathered;
      else if (isProfessional) opsCap = 50;
      else opsCap = 100;
    } else {
      // Free plan: 5 ops през първите 30 дни от регистрацията, после 2/мес.
      const signupTs = signupAt ? new Date(signupAt).getTime() : Date.now();
      const withinFirstMonth = Date.now() - signupTs < 30 * 24 * 60 * 60 * 1000;
      opsCap = q?.marketing_bonus_legacy && withinFirstMonth ? 5 : 2;
    }

    setState({
      isPro,
      isTeam,
      isEntrepreneur: isPro && isEntrepreneur,
      isProfessional: isPro && isProfessional,
      loading: false,
      freeQuota: {
        opsUsed: isPro
          ? ((q as any)?.pro_monthly_used ?? 0)
          : ((q as any)?.monthly_total_used ?? 0),
        opsCap,
        // Платените планове: 1 AI съобщение = 1 операция от общия месечен пул.
        // Безплатен план: DogovaryAI е достъпен с 3 запитвания (както и за
        // нерегистрирани), с CTA към регистрация/абонамент след изчерпване.
        aiMessagesUsed: isPro
          ? ((q as any)?.pro_monthly_used ?? 0)
          : ((q as any)?.ai_messages_used ?? 0),
        aiMessagesCap: isPro ? opsCap : 3,
        analysisPreviewsUsed: (q as any)?.analysis_previews_used ?? 0,
        analysisPreviewsCap: 1,
        bilingualPreviewsUsed: (q as any)?.bilingual_previews_used ?? 0,
        bilingualPreviewsCap: 1,
        kitSlotsCap: 1,
        correctionsFreeUsed: Boolean((q as any)?.corrections_free_used),
        signingFreeUsed: Boolean((q as any)?.free_signing_used),
        signupAt,
        topupBalance: (q as any)?.topup_ops_balance ?? 0,
      },
    });
  }, [user]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (cancelled) return;
      await refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  useEffect(() => {
    const reload = () => { void refresh(); };
    window.addEventListener("dogovori:quota-refreshed", reload);
    return () => window.removeEventListener("dogovori:quota-refreshed", reload);
  }, [refresh]);

  return { ...state, refresh };
}
