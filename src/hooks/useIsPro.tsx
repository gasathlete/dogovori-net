import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

interface ProState {
  isPro: boolean;
  isTeam: boolean;
  loading: boolean;
}

export function useIsPro(): ProState {
  const { user } = useAuth();
  const [state, setState] = useState<ProState>({ isPro: false, isTeam: false, loading: true });

  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setState({ isPro: false, isTeam: false, loading: false });
      return;
    }
    (async () => {
      const [{ data: q }, { data: tm }] = await Promise.all([
        supabase.from("download_quota").select("plan, pro_until").eq("user_id", user.id).maybeSingle(),
        supabase
          .from("team_members")
          .select("team_id, teams!inner(status)")
          .eq("user_id", user.id)
          .limit(1)
          .maybeSingle(),
      ]);
      if (cancelled) return;
      const isPro = q?.plan === "pro" || Boolean(q?.pro_until && new Date(q.pro_until) > new Date());
      const t: any = tm;
      const isTeam = Boolean(t && t.teams?.status === "active");
      setState({ isPro, isTeam, loading: false });
    })();
    return () => { cancelled = true; };
  }, [user]);

  return state;
}
