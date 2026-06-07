import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

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
}

interface ProState {
  isPro: boolean;
  isTeam: boolean;
  loading: boolean;
  freeQuota: FreeQuota;
  refresh: () => Promise<void>;
}

const DEFAULT_FREE_QUOTA: FreeQuota = {
  opsUsed: 0,
  opsCap: 5,
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
};

export function useIsPro(): ProState {
  const { user } = useAuth();
  const [state, setState] = useState<Omit<ProState, "refresh">>({
    isPro: false,
    isTeam: false,
    loading: true,
    freeQuota: DEFAULT_FREE_QUOTA,
  });

  const refresh = useCallback(async () => {
    if (!user) {
      setState({ isPro: false, isTeam: false, loading: false, freeQuota: DEFAULT_FREE_QUOTA });
      return;
    }
    const [{ data: q }, { data: tm }] = await Promise.all([
      supabase
        .from("download_quota")
        .select(
          "plan, pro_until, monthly_total_used, ai_messages_used, analysis_previews_used, bilingual_previews_used, corrections_free_used, signup_at",
        )
        .eq("user_id", user.id)
        .maybeSingle(),
      supabase
        .from("team_members")
        .select("team_id, teams!inner(status)")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle(),
    ]);
    const isPro =
      (q as any)?.plan === "pro" ||
      Boolean((q as any)?.pro_until && new Date((q as any).pro_until) > new Date());
    const t: any = tm;
    const isTeam = Boolean(t && t.teams?.status === "active");
    const signupAt: string | null = (q as any)?.signup_at ?? null;
    const withinFirstMonth =
      !!signupAt && Date.now() - new Date(signupAt).getTime() < 30 * 24 * 60 * 60 * 1000;
    const opsCap = withinFirstMonth ? 5 : 2;
    setState({
      isPro,
      isTeam,
      loading: false,
      freeQuota: {
        opsUsed: (q as any)?.monthly_total_used ?? 0,
        opsCap,
        aiMessagesUsed: (q as any)?.ai_messages_used ?? 0,
        aiMessagesCap: 5,
        analysisPreviewsUsed: (q as any)?.analysis_previews_used ?? 0,
        analysisPreviewsCap: 1,
        bilingualPreviewsUsed: (q as any)?.bilingual_previews_used ?? 0,
        bilingualPreviewsCap: 1,
        kitSlotsCap: 1,
        correctionsFreeUsed: Boolean((q as any)?.corrections_free_used),
        signupAt,
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

  return { ...state, refresh };
}
