import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export interface TeamMembership {
  team_id: string;
  team_name: string;
  role: "owner" | "admin" | "member";
  seat_count: number;
  status: string;
  current_period_end: string | null;
}

export interface TeamUsage {
  ops_used: number;
  cap: number;
  period_start: string;
  lifetime_ops: number;
}


export function useTeam() {
  const { user } = useAuth();
  const [team, setTeam] = useState<TeamMembership | null>(null);
  const [usage, setUsage] = useState<TeamUsage | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setTeam(null);
      setUsage(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const { data: members } = await supabase
      .from("team_members")
      .select("team_id, role, teams!inner(id, name, seat_count, status, current_period_end)")
      .eq("user_id", user.id)
      .limit(1);
    const m = members?.[0] as any;
    if (!m) {
      setTeam(null);
      setUsage(null);
    } else {
      setTeam({
        team_id: m.team_id,
        team_name: m.teams.name,
        role: m.role,
        seat_count: m.teams.seat_count,
        status: m.teams.status,
        current_period_end: m.teams.current_period_end,
      });
      const { data: u } = await supabase
        .from("team_usage")
        .select("ops_used, period_start")
        .eq("team_id", m.team_id)
        .maybeSingle();
      setUsage({
        ops_used: u?.ops_used ?? 0,
        cap: m.teams.seat_count * 100,
        period_start: u?.period_start ?? new Date().toISOString(),
      });
    }
    setLoading(false);
  }, [user]);

  useEffect(() => { refresh(); }, [refresh]);

  return { team, usage, loading, refresh };
}
