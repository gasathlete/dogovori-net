-- Root security review, 28.09.2026: guard the whole aggregate RPC.
-- A WHERE filter on the outer aggregate does not authorize scalar subqueries.
-- Keep the query and result signature unchanged for staff.
BEGIN;
CREATE OR REPLACE FUNCTION public.admin_privacy_kpis(_from timestamp with time zone, _to timestamp with time zone)
 RETURNS TABLE(total_calls bigint, blocked_calls bigint, redacted_calls bigint, special_category_calls bigint, redaction_applied bigint, fallback_used bigint, distinct_users bigint, tokens_in_sum bigint, tokens_out_sum bigint, restricted_events bigint)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  IF NOT COALESCE(public.is_staff(auth.uid()), false) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
SELECT
    COUNT(*) FILTER (WHERE a.created_at >= _from AND a.created_at < _to)::bigint,
    COUNT(*) FILTER (WHERE a.status = 'blocked' AND a.created_at >= _from AND a.created_at < _to)::bigint,
    COUNT(*) FILTER (WHERE a.redaction_applied AND a.created_at >= _from AND a.created_at < _to)::bigint,
    COUNT(*) FILTER (WHERE a.contains_special_category_data AND a.created_at >= _from AND a.created_at < _to)::bigint,
    COUNT(*) FILTER (WHERE a.redaction_applied AND a.created_at >= _from AND a.created_at < _to)::bigint,
    COUNT(*) FILTER (WHERE a.fallback_used AND a.created_at >= _from AND a.created_at < _to)::bigint,
    COUNT(DISTINCT a.user_id) FILTER (WHERE a.created_at >= _from AND a.created_at < _to)::bigint,
    COALESCE(SUM(a.tokens_in) FILTER (WHERE a.created_at >= _from AND a.created_at < _to), 0)::bigint,
    COALESCE(SUM(a.tokens_out) FILTER (WHERE a.created_at >= _from AND a.created_at < _to), 0)::bigint,
    (SELECT COUNT(*) FROM public.restricted_processing_events ic
       WHERE ic.created_at >= _from AND ic.created_at < _to)::bigint
  FROM public.ai_audit_log a
  WHERE public.is_staff(auth.uid());
$function$
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.admin_privacy_kpis(timestamptz,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_privacy_kpis(timestamptz,timestamptz) TO authenticated, service_role;
COMMIT;
