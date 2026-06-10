
-- 1. Rename illegal_content_attempts → restricted_processing_events + restructure
ALTER TABLE public.illegal_content_attempts RENAME TO restricted_processing_events;

ALTER TABLE public.restricted_processing_events DROP COLUMN IF EXISTS payload_excerpt;
ALTER TABLE public.restricted_processing_events DROP COLUMN IF EXISTS matched_term;
ALTER TABLE public.restricted_processing_events DROP COLUMN IF EXISTS user_agent;

ALTER TABLE public.restricted_processing_events
  ADD COLUMN IF NOT EXISTS event_type text NOT NULL DEFAULT 'illegal_content_blocked';

ALTER TABLE public.restricted_processing_events
  ADD COLUMN IF NOT EXISTS action text NOT NULL DEFAULT 'blocked_before_model_call';

ALTER INDEX IF EXISTS idx_illegal_attempts_created RENAME TO idx_restricted_events_created;
ALTER INDEX IF EXISTS idx_illegal_attempts_user RENAME TO idx_restricted_events_user;
ALTER INDEX IF EXISTS idx_illegal_attempts_category RENAME TO idx_restricted_events_category;

DROP POLICY IF EXISTS illegal_attempts_staff_select ON public.restricted_processing_events;
DROP POLICY IF EXISTS illegal_attempts_service_role ON public.restricted_processing_events;

CREATE POLICY restricted_events_staff_select
  ON public.restricted_processing_events
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY restricted_events_service_role
  ON public.restricted_processing_events
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- 2. Drop & re-create KPI functions to use new table name
DROP FUNCTION IF EXISTS public.admin_privacy_kpis(timestamptz, timestamptz);
DROP FUNCTION IF EXISTS public.admin_privacy_breakdown(timestamptz, timestamptz, text);

CREATE FUNCTION public.admin_privacy_kpis(_from timestamptz, _to timestamptz)
RETURNS TABLE (
  total_calls bigint, blocked_calls bigint, redacted_calls bigint,
  special_category_calls bigint, redaction_applied bigint, fallback_used bigint,
  distinct_users bigint, tokens_in_sum bigint, tokens_out_sum bigint,
  restricted_events bigint
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
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
$$;

REVOKE ALL ON FUNCTION public.admin_privacy_kpis(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_privacy_kpis(timestamptz, timestamptz) TO authenticated;

CREATE FUNCTION public.admin_privacy_breakdown(_from timestamptz, _to timestamptz, _dim text)
RETURNS TABLE (label text, count bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _dim = 'risk_level' THEN
    RETURN QUERY SELECT risk_level::text, COUNT(*)::bigint FROM public.ai_audit_log
      WHERE created_at >= _from AND created_at < _to GROUP BY risk_level ORDER BY 2 DESC;
  ELSIF _dim = 'operation' THEN
    RETURN QUERY SELECT operation::text, COUNT(*)::bigint FROM public.ai_audit_log
      WHERE created_at >= _from AND created_at < _to GROUP BY operation ORDER BY 2 DESC;
  ELSIF _dim = 'model' THEN
    RETURN QUERY SELECT model::text, COUNT(*)::bigint FROM public.ai_audit_log
      WHERE created_at >= _from AND created_at < _to GROUP BY model ORDER BY 2 DESC;
  ELSIF _dim = 'status' THEN
    RETURN QUERY SELECT status::text, COUNT(*)::bigint FROM public.ai_audit_log
      WHERE created_at >= _from AND created_at < _to GROUP BY status ORDER BY 2 DESC;
  ELSIF _dim = 'restricted_category' THEN
    RETURN QUERY SELECT category::text, COUNT(*)::bigint FROM public.restricted_processing_events
      WHERE created_at >= _from AND created_at < _to GROUP BY category ORDER BY 2 DESC;
  ELSIF _dim = 'event_type' THEN
    RETURN QUERY SELECT event_type::text, COUNT(*)::bigint FROM public.restricted_processing_events
      WHERE created_at >= _from AND created_at < _to GROUP BY event_type ORDER BY 2 DESC;
  ELSE
    RAISE EXCEPTION 'invalid dim: %', _dim;
  END IF;
END $$;

REVOKE ALL ON FUNCTION public.admin_privacy_breakdown(timestamptz, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_privacy_breakdown(timestamptz, timestamptz, text) TO authenticated;

-- 3. order_snapshots — ЗЗП snapshot при поръчка
CREATE TABLE public.order_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_name text NOT NULL,
  price_amount numeric NOT NULL,
  currency text NOT NULL DEFAULT 'EUR',
  vat_included boolean NOT NULL DEFAULT true,
  vat_rate numeric NOT NULL DEFAULT 20,
  billing_period text,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  withdrawal_version text NOT NULL,
  refund_version text NOT NULL,
  dpa_version text,
  ai_ack_accepted boolean NOT NULL DEFAULT false,
  stripe_session_id text,
  stripe_subscription_id text,
  ip inet,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT ON public.order_snapshots TO authenticated;
GRANT ALL ON public.order_snapshots TO service_role;

ALTER TABLE public.order_snapshots ENABLE ROW LEVEL SECURITY;

CREATE POLICY order_snapshots_user_select ON public.order_snapshots
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY order_snapshots_user_insert ON public.order_snapshots
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY order_snapshots_service_role ON public.order_snapshots
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_order_snapshots_user ON public.order_snapshots(user_id, created_at DESC);

-- 4. profiles.allow_third_country_ai
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS allow_third_country_ai boolean NOT NULL DEFAULT true;

-- 5. teams.eu_only_ai
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS eu_only_ai boolean NOT NULL DEFAULT false;

-- 6. signing_request_signers — нови полета
ALTER TABLE public.signing_request_signers
  ADD COLUMN IF NOT EXISTS signer_eik text,
  ADD COLUMN IF NOT EXISTS signer_capacity text,
  ADD COLUMN IF NOT EXISTS representative_declaration boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ses_equivalence_accepted boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS ses_equivalence_text_version text,
  ADD COLUMN IF NOT EXISTS document_hash_at_sign text;
