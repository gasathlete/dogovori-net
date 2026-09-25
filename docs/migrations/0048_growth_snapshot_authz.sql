-- stage_growth_snapshot_authz (proposed id 0048_growth_snapshot_authz)
--
-- SOURCE ONLY. NOT APPLIED. Reviewed copy; apply only with the procedure in
-- docs/operations/prelaunch-gate9-10-runbook.md (single atomic transaction).
--
-- Finding (live FUNCTION METADATA only; the function was never invoked):
--   growth_snapshot is SECURITY DEFINER, owner postgres, proconfig
--   search_path=public, EXECUTE granted to anon and authenticated. Its guard
--   `current_user IN ('service_role','supabase_admin','postgres')` is always
--   true inside a definer owned by postgres, so any caller bypasses is_staff.
-- Fix: authorize by auth.role() (JWT role) and auth.uid() + is_staff, with
--   COALESCE so NULL/missing role/uid fail closed; fixed search_path; revoke
--   PUBLIC/anon, keep authenticated (staff) and service_role (growth-brief).
-- Body is otherwise byte-for-byte the source migration
--   supabase/migrations/20260811215209_bc8f22db-519e-453c-acb0-002eec899f82.sql.
-- Direct psql calls as postgres without a JWT role are now denied by design.
BEGIN;

CREATE OR REPLACE FUNCTION public.growth_snapshot(_from timestamptz, _to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  res jsonb;
  v_visitors bigint;
  v_pageviews bigint;
  v_sessions bigint;
  v_signups bigint;
  v_signups_total bigint;
  v_paid_new bigint;
  v_paid_active bigint;
  v_docs bigint;
  v_uploads bigint;
  v_ops bigint;
  v_topup_ops bigint;
  v_topup_eur numeric;
  v_top_templates jsonb;
  v_top_dropoff jsonb;
  v_top_paths jsonb;
  v_sources jsonb;
BEGIN
  -- Авторизация по ИСТИНСКАТА JWT роля на заявката, не по current_user:
  -- в SECURITY DEFINER current_user е собственикът (postgres), затова старият
  -- клон беше винаги истина. NULL/липсваща роля или uid = ОТКАЗ (COALESCE).
  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR (
      COALESCE(auth.role(), '') = 'authenticated'
      AND auth.uid() IS NOT NULL
      AND COALESCE(public.is_staff(auth.uid()), false)
    )
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(DISTINCT visitor_day_hash), COUNT(*), COUNT(DISTINCT session_id)
    INTO v_visitors, v_pageviews, v_sessions
    FROM public.page_views
   WHERE created_at >= _from AND created_at < _to AND event = 'pageview';

  SELECT COUNT(*) INTO v_signups FROM public.profiles
   WHERE created_at >= _from AND created_at < _to;
  SELECT COUNT(*) INTO v_signups_total FROM public.profiles;

  SELECT COUNT(*) INTO v_paid_new FROM public.subscriptions
   WHERE created_at >= _from AND created_at < _to
     AND status IN ('active','trialing','past_due');

  SELECT COUNT(*) INTO v_paid_active FROM public.subscriptions
   WHERE status IN ('active','trialing');

  SELECT COUNT(*) INTO v_docs FROM public.saved_documents
   WHERE created_at >= _from AND created_at < _to;

  SELECT COUNT(*) INTO v_uploads FROM public.uploaded_contracts
   WHERE created_at >= _from AND created_at < _to;

  SELECT COUNT(*) INTO v_ops FROM public.quota_session_charges
   WHERE created_at >= _from AND created_at < _to;

  SELECT COALESCE(SUM(ops_added),0), COALESCE(SUM(amount_eur),0)
    INTO v_topup_ops, v_topup_eur
    FROM public.topup_purchases
   WHERE created_at >= _from AND created_at < _to;

  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v_top_templates
    FROM (
      SELECT props->>'doc_key' AS doc_key, COUNT(*) AS starts
        FROM public.funnel_events
       WHERE created_at >= _from AND created_at < _to
         AND name = 'doc_start' AND COALESCE(props->>'doc_key','') <> ''
       GROUP BY 1 ORDER BY 2 DESC LIMIT 10
    ) t;

  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v_top_dropoff
    FROM (
      SELECT name, COALESCE(props->>'reason','') AS reason, COUNT(*) AS hits
        FROM public.funnel_events
       WHERE created_at >= _from AND created_at < _to
         AND name IN ('doc_generate_fail','doc_generate_blocked','placeholder_block','doc_abandon')
       GROUP BY 1,2 ORDER BY 3 DESC LIMIT 12
    ) t;

  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v_top_paths
    FROM (
      SELECT path, COUNT(*) AS views
        FROM public.page_views
       WHERE created_at >= _from AND created_at < _to AND event = 'pageview'
       GROUP BY 1 ORDER BY 2 DESC LIMIT 12
    ) t;

  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v_sources
    FROM (
      SELECT COALESCE(NULLIF(utm_source,''), NULLIF(referrer_host,''), 'direct') AS source,
             COUNT(DISTINCT visitor_day_hash) AS visitors
        FROM public.page_views
       WHERE created_at >= _from AND created_at < _to AND event = 'pageview'
       GROUP BY 1 ORDER BY 2 DESC LIMIT 10
    ) t;

  WITH ev AS (
    SELECT name, props, session_id, COALESCE(props->>'reason','') AS reason
      FROM public.funnel_events
     WHERE created_at >= _from AND created_at < _to
  ),
  evc AS (
    SELECT ev.*,
           ((name = 'doc_generate_blocked')
             OR (name = 'doc_generate_fail' AND reason ~* '(needs_confirmation|confirmation_required|quota_exceeded|requires_login|sensitive_blocked|blocked_content|illegal_content|placeholder)')) AS is_gate
      FROM ev
  ),
  stage AS (
    SELECT
      COUNT(DISTINCT CASE WHEN name = 'doc_start' THEN session_id END) AS s_start,
      COUNT(DISTINCT CASE WHEN name LIKE 'doc_fill%' THEN session_id END) AS s_fill,
      COUNT(DISTINCT CASE WHEN name = 'doc_generate_success' THEN session_id END) AS s_generate,
      COUNT(DISTINCT CASE WHEN name = 'doc_download_success' THEN session_id END) AS s_download,
      COUNT(DISTINCT CASE WHEN name IN ('doc_sign_requested','doc_sign_signed') THEN session_id END) AS s_sign,
      COUNT(*) FILTER (WHERE name IN ('doc_generate_fail','doc_generate_blocked') AND NOT is_gate) AS generate_fail,
      COUNT(*) FILTER (WHERE is_gate) AS generate_blocked,
      COUNT(*) FILTER (WHERE name = 'doc_generate_started') AS generate_started,
      COUNT(*) FILTER (WHERE name = 'placeholder_block') AS placeholder_blocks,
      COUNT(*) FILTER (WHERE name = 'quality_review_result') AS reviews,
      AVG(NULLIF((props->>'score'), '')::numeric) FILTER (WHERE name = 'quality_review_result') AS avg_review_score,
      COUNT(*) FILTER (WHERE name = 'quality_review_result'
                        AND COALESCE(NULLIF(props->>'issues','')::numeric, 0) = 0) AS clean_reviews,
      COUNT(*) FILTER (WHERE name = 'corrections_applied') AS corrections_applied,
      COUNT(*) FILTER (WHERE name = 'plans_view') AS plans_views,
      COUNT(*) FILTER (WHERE name = 'checkout_started') AS checkout_started,
      COUNT(*) FILTER (WHERE name = 'upgrade_completed') AS upgrade_completed,
      COUNT(DISTINCT CASE WHEN COALESCE(props->>'segment','') = 'business' THEN session_id END) AS seg_business,
      COUNT(DISTINCT CASE WHEN COALESCE(props->>'segment','') = 'freelancer' THEN session_id END) AS seg_freelancer
    FROM evc
  ),
  sign AS (
    SELECT COUNT(*) AS requests,
           COUNT(*) FILTER (WHERE status = 'completed') AS completed,
           COUNT(*) FILTER (WHERE status IN ('cancelled','expired','declined')) AS failed
      FROM public.signing_requests
     WHERE created_at >= _from AND created_at < _to
  ),
  fb AS (
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE category = 'bug') AS bugs,
           AVG(NULLIF(rating, 0)::numeric) AS avg_rating
      FROM public.feedback_submissions
     WHERE created_at >= _from AND created_at < _to
  )
  SELECT jsonb_build_object(
    'range', jsonb_build_object('from', _from, 'to', _to),
    'acquisition', jsonb_build_object(
      'visitors', v_visitors,
      'pageviews', v_pageviews,
      'sessions', v_sessions,
      'signups', v_signups,
      'signups_total', v_signups_total,
      'signup_rate', CASE WHEN v_visitors > 0 THEN ROUND(100.0 * v_signups / v_visitors, 2) ELSE 0 END,
      'top_sources', v_sources,
      'top_paths', v_top_paths
    ),
    'activation', jsonb_build_object(
      'start', stage.s_start,
      'fill', stage.s_fill,
      'generate', stage.s_generate,
      'download', stage.s_download,
      'sign', stage.s_sign,
      'documents_saved', v_docs,
      'uploads_analyzed', v_uploads,
      'start_to_download', CASE WHEN stage.s_start > 0 THEN ROUND(100.0 * stage.s_download / stage.s_start, 2) ELSE 0 END,
      'top_templates', v_top_templates
    ),
    'conversion', jsonb_build_object(
      'plans_views', stage.plans_views,
      'checkout_started', stage.checkout_started,
      'upgrade_completed', stage.upgrade_completed,
      'new_paid_subscriptions', v_paid_new,
      'active_paid_subscriptions', v_paid_active,
      'visitor_to_paid', CASE WHEN v_visitors > 0 THEN ROUND(100.0 * v_paid_new / v_visitors, 2) ELSE 0 END,
      'signup_to_paid', CASE WHEN v_signups > 0 THEN ROUND(100.0 * v_paid_new / v_signups, 2) ELSE 0 END,
      'checkout_completion', CASE WHEN stage.checkout_started > 0 THEN ROUND(100.0 * stage.upgrade_completed / stage.checkout_started, 2) ELSE 0 END
    ),
    'segments', jsonb_build_object(
      'business', stage.seg_business,
      'freelancer', stage.seg_freelancer
    ),
    'operations', jsonb_build_object(
      'charged_sessions', v_ops,
      'topup_ops_sold', v_topup_ops,
      'topup_revenue_eur', v_topup_eur
    ),
    'quality', jsonb_build_object(
      'reviews', stage.reviews,
      'avg_review_score', COALESCE(ROUND(stage.avg_review_score, 1), 0),
      'clean_review_rate', CASE WHEN stage.reviews > 0 THEN ROUND(100.0 * stage.clean_reviews / stage.reviews, 2) ELSE 0 END,
      'placeholder_blocks', stage.placeholder_blocks,
      'corrections_applied', stage.corrections_applied,
      'generate_started', stage.generate_started,
      'generate_fail', stage.generate_fail,
      'generate_blocked', stage.generate_blocked,
      'generate_fail_rate', CASE WHEN stage.generate_started > 0 THEN ROUND(100.0 * stage.generate_fail / stage.generate_started, 2) ELSE 0 END,
      'generate_blocked_rate', CASE WHEN stage.generate_started > 0 THEN ROUND(100.0 * stage.generate_blocked / stage.generate_started, 2) ELSE 0 END,
      'signing_requests', sign.requests,
      'signing_completed', sign.completed,
      'signing_failed', sign.failed,
      'signing_completion_rate', CASE WHEN sign.requests > 0 THEN ROUND(100.0 * sign.completed / sign.requests, 2) ELSE 0 END,
      'feedback_total', fb.total,
      'feedback_bugs', fb.bugs,
      'feedback_avg_rating', COALESCE(ROUND(fb.avg_rating, 2), 0)
    ),
    'drop_off', v_top_dropoff
  ) INTO res
  FROM stage, sign, fb;

  RETURN res;
END;
$function$;

REVOKE ALL ON FUNCTION public.growth_snapshot(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.growth_snapshot(timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.growth_snapshot(timestamptz, timestamptz) TO authenticated, service_role;

COMMIT;
