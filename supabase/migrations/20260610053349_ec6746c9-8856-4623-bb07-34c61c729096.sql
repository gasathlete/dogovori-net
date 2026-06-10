
-- Privacy / AI compliance dashboard RPC за модератори.
-- Връща агрегирани метрики БЕЗ съдържание — само бройки и разпределения.

CREATE OR REPLACE FUNCTION public.admin_privacy_kpis(_from timestamptz, _to timestamptz)
RETURNS TABLE (
  total_ai_calls bigint,
  blocked_calls bigint,
  errored_calls bigint,
  pii_calls bigint,
  special_category_calls bigint,
  redacted_calls bigint,
  fallback_used bigint,
  unique_users bigint,
  total_tokens_in bigint,
  total_tokens_out bigint,
  illegal_attempts bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    COUNT(*) FILTER (WHERE a.created_at >= _from AND a.created_at < _to)::bigint,
    COUNT(*) FILTER (WHERE a.status = 'blocked' AND a.created_at >= _from AND a.created_at < _to)::bigint,
    COUNT(*) FILTER (WHERE a.status = 'error' AND a.created_at >= _from AND a.created_at < _to)::bigint,
    COUNT(*) FILTER (WHERE a.contains_personal_data AND a.created_at >= _from AND a.created_at < _to)::bigint,
    COUNT(*) FILTER (WHERE a.contains_special_category_data AND a.created_at >= _from AND a.created_at < _to)::bigint,
    COUNT(*) FILTER (WHERE a.redaction_applied AND a.created_at >= _from AND a.created_at < _to)::bigint,
    COUNT(*) FILTER (WHERE a.fallback_used AND a.created_at >= _from AND a.created_at < _to)::bigint,
    COUNT(DISTINCT a.user_id) FILTER (WHERE a.created_at >= _from AND a.created_at < _to)::bigint,
    COALESCE(SUM(a.tokens_in) FILTER (WHERE a.created_at >= _from AND a.created_at < _to), 0)::bigint,
    COALESCE(SUM(a.tokens_out) FILTER (WHERE a.created_at >= _from AND a.created_at < _to), 0)::bigint,
    (SELECT COUNT(*) FROM public.illegal_content_attempts ic
       WHERE ic.created_at >= _from AND ic.created_at < _to)::bigint
  FROM public.ai_audit_log a
  WHERE public.is_staff(auth.uid());
$$;

REVOKE ALL ON FUNCTION public.admin_privacy_kpis(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_privacy_kpis(timestamptz, timestamptz) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_privacy_breakdown(_from timestamptz, _to timestamptz, _dim text)
RETURNS TABLE (label text, count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;

  IF _dim = 'risk_level' THEN
    RETURN QUERY
      SELECT risk_level::text, COUNT(*)::bigint
      FROM public.ai_audit_log
      WHERE created_at >= _from AND created_at < _to
      GROUP BY risk_level ORDER BY 2 DESC;
  ELSIF _dim = 'operation' THEN
    RETURN QUERY
      SELECT operation::text, COUNT(*)::bigint
      FROM public.ai_audit_log
      WHERE created_at >= _from AND created_at < _to
      GROUP BY operation ORDER BY 2 DESC;
  ELSIF _dim = 'model' THEN
    RETURN QUERY
      SELECT model::text, COUNT(*)::bigint
      FROM public.ai_audit_log
      WHERE created_at >= _from AND created_at < _to
      GROUP BY model ORDER BY 2 DESC;
  ELSIF _dim = 'status' THEN
    RETURN QUERY
      SELECT status::text, COUNT(*)::bigint
      FROM public.ai_audit_log
      WHERE created_at >= _from AND created_at < _to
      GROUP BY status ORDER BY 2 DESC;
  ELSIF _dim = 'illegal_category' THEN
    RETURN QUERY
      SELECT category::text, COUNT(*)::bigint
      FROM public.illegal_content_attempts
      WHERE created_at >= _from AND created_at < _to
      GROUP BY category ORDER BY 2 DESC;
  ELSE
    RAISE EXCEPTION 'invalid dim: %', _dim;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.admin_privacy_breakdown(timestamptz, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_privacy_breakdown(timestamptz, timestamptz, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.admin_privacy_timeseries(_from timestamptz, _to timestamptz, _bucket text)
RETURNS TABLE (bucket timestamptz, total bigint, pii bigint, special bigint, blocked bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT
    date_trunc(_bucket, a.created_at) AS bucket,
    COUNT(*)::bigint AS total,
    COUNT(*) FILTER (WHERE a.contains_personal_data)::bigint AS pii,
    COUNT(*) FILTER (WHERE a.contains_special_category_data)::bigint AS special,
    COUNT(*) FILTER (WHERE a.status = 'blocked')::bigint AS blocked
  FROM public.ai_audit_log a
  WHERE public.is_staff(auth.uid())
    AND a.created_at >= _from AND a.created_at < _to
  GROUP BY 1
  ORDER BY 1;
$$;

REVOKE ALL ON FUNCTION public.admin_privacy_timeseries(timestamptz, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_privacy_timeseries(timestamptz, timestamptz, text) TO authenticated;
