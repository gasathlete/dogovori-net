CREATE OR REPLACE FUNCTION public.admin_financial_audit(_months integer DEFAULT 6)
RETURNS TABLE (
  month date,
  new_signups integer,
  active_paid integer,
  active_teams integer,
  team_seats integer,
  ops_total integer,
  ops_template integer,
  ops_contract integer,
  ops_analysis integer,
  ops_corrections integer,
  ai_calls integer,
  ai_tokens_in bigint,
  ai_tokens_out bigint,
  ai_cost_eur numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  n integer := greatest(1, least(coalesce(_months, 6), 36));
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  RETURN QUERY
  WITH months AS (
    SELECT generate_series(
      date_trunc('month', now())::date - ((n - 1) || ' months')::interval,
      date_trunc('month', now())::date,
      '1 month'::interval
    )::date AS m
  )
  SELECT
    mo.m,
    (SELECT count(*)::int FROM profiles p
      WHERE p.created_at >= mo.m AND p.created_at < (mo.m + interval '1 month')),
    (SELECT count(DISTINCT s.user_id)::int FROM subscriptions s
      WHERE s.status IN ('active','trialing','past_due')
        AND coalesce(s.current_period_start, s.created_at) < (mo.m + interval '1 month')
        AND coalesce(s.current_period_end, now()) >= mo.m),
    (SELECT count(*)::int FROM teams t
      WHERE t.status IN ('active','trialing')
        AND coalesce(t.current_period_start, t.created_at) < (mo.m + interval '1 month')
        AND coalesce(t.current_period_end, now()) >= mo.m),
    (SELECT coalesce(sum(t.seat_count),0)::int FROM teams t
      WHERE t.status IN ('active','trialing')
        AND coalesce(t.current_period_start, t.created_at) < (mo.m + interval '1 month')
        AND coalesce(t.current_period_end, now()) >= mo.m),
    (SELECT count(*)::int FROM quota_session_charges q
      WHERE q.created_at >= mo.m AND q.created_at < (mo.m + interval '1 month'))
      + (SELECT coalesce(sum(c.ops_charged),0)::int FROM corrections_batch_charges c
      WHERE c.created_at >= mo.m AND c.created_at < (mo.m + interval '1 month')),
    (SELECT count(*)::int FROM quota_session_charges q
      WHERE q.kind = 'template' AND q.created_at >= mo.m AND q.created_at < (mo.m + interval '1 month')),
    (SELECT count(*)::int FROM quota_session_charges q
      WHERE q.kind = 'contract' AND q.created_at >= mo.m AND q.created_at < (mo.m + interval '1 month')),
    (SELECT count(*)::int FROM quota_session_charges q
      WHERE q.kind = 'analysis' AND q.created_at >= mo.m AND q.created_at < (mo.m + interval '1 month')),
    (SELECT coalesce(sum(c.ops_charged),0)::int FROM corrections_batch_charges c
      WHERE c.created_at >= mo.m AND c.created_at < (mo.m + interval '1 month')),
    (SELECT count(*)::int FROM ai_usage a
      WHERE a.created_at >= mo.m AND a.created_at < (mo.m + interval '1 month')),
    (SELECT coalesce(sum(a.tokens_in),0)::bigint FROM ai_usage a
      WHERE a.created_at >= mo.m AND a.created_at < (mo.m + interval '1 month')),
    (SELECT coalesce(sum(a.tokens_out),0)::bigint FROM ai_usage a
      WHERE a.created_at >= mo.m AND a.created_at < (mo.m + interval '1 month')),
    (SELECT coalesce(sum(a.cost_eur),0)::numeric FROM ai_usage a
      WHERE a.created_at >= mo.m AND a.created_at < (mo.m + interval '1 month'))
  FROM months mo
  ORDER BY mo.m;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_financial_audit(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_financial_audit(integer) TO authenticated, service_role;