import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { getStripeEnvironment } from "@/lib/stripe";

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

async function fetchTeam(userId: string): Promise<{ team: TeamMembership | null; usage: TeamUsage | null }> {
  const { data: members } = await supabase
    .from("team_members")
    .select("team_id, role, teams!inner(id, name, seat_count, status, current_period_end,environment)")
    .eq("user_id", userId)
    .eq("teams.environment", getStripeEnvironment())
    .limit(1);
  const m = members?.[0] as any;
  if (!m) return { team: null, usage: null };

  const team: TeamMembership = {
    team_id: m.team_id,
    team_name: m.teams.name,
    role: m.role,
    seat_count: m.teams.seat_count,
    status: m.teams.status,
    current_period_end: m.teams.current_period_end,
  };

  const { data: u } = await supabase
    .from("team_usage")
    .select("ops_used, period_start, lifetime_ops")
    .eq("team_id", m.team_id)
    .maybeSingle();

  const usage: TeamUsage = {
    ops_used: u?.ops_used ?? 0,
    cap: m.teams.seat_count * 100,
    period_start: u?.period_start ?? new Date().toISOString(),
    lifetime_ops: (u as any)?.lifetime_ops ?? 0,
  };
  return { team, usage };
}

/**
 * Cached team membership + usage. Team membership rarely changes, so we keep
 * the query fresh for 5 minutes to avoid hitting `team_members`/`teams` on
 * every render of the header, account page, and usage badge.
 */
export function useTeam() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const userId = user?.id ?? null;

  const query = useQuery({
    queryKey: ["team", userId, getStripeEnvironment()],
    queryFn: () => userId ? fetchTeam(userId) : Promise.resolve({ team: null, usage: null }),
    enabled: !!userId,
    staleTime: 5 * 60_000,
    gcTime: 10 * 60_000,
  });

  const refresh = useCallback(async () => {
    if (!userId) return;
    await qc.invalidateQueries({ queryKey: ["team", userId] });
  }, [qc, userId]);

  return {
    team: query.data?.team ?? null,
    usage: query.data?.usage ?? null,
    loading: !!userId && query.isPending,
    refresh,
  };
}
