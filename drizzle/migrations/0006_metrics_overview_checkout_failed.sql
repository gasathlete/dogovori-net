CREATE OR REPLACE FUNCTION public.metrics_overview(_from timestamptz, _to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  res jsonb;
  v_visitors bigint;
  v_pageviews bigint;
  v_signups bigint;
  v_paid bigint;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;

  SELECT COUNT(DISTINCT visitor_day_hash), COUNT(*)
    INTO v_visitors, v_pageviews
    FROM public.page_views
   WHERE created_at >= _from AND created_at < _to AND event = 'pageview';

  SELECT COUNT(*) INTO v_signups
    FROM public.profiles WHERE created_at >= _from AND created_at < _to;

  SELECT COUNT(*) INTO v_paid
    FROM public.subscriptions
   WHERE created_at >= _from AND created_at < _to
     AND status IN ('active','trialing','past_due');

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
      COUNT(*) FILTER (WHERE name = 'checkout_failed') AS checkout_failed,
      COUNT(*) FILTER (WHERE name = 'upgrade_completed') AS upgrade_completed,
      COUNT(DISTINCT CASE WHEN COALESCE(props->>'segment','') = 'business' THEN session_id END) AS seg_business,
      COUNT(DISTINCT CASE WHEN COALESCE(props->>'segment','') = 'freelancer' THEN session_id END) AS seg_freelancer,
      COUNT(*) FILTER (WHERE name = 'draft_created') AS draft_created,
      COUNT(*) FILTER (WHERE name = 'draft_restore_offered') AS draft_restore_offered,
      COUNT(*) FILTER (WHERE name = 'draft_restored') AS draft_restored,
      COUNT(*) FILTER (WHERE name = 'draft_claim_started') AS claim_started,
      COUNT(*) FILTER (WHERE name = 'draft_claim_succeeded') AS claim_succeeded,
      COUNT(*) FILTER (WHERE name = 'draft_claim_blocked') AS claim_blocked,
      COUNT(*) FILTER (WHERE name = 'draft_claim_blocked' AND reason = 'expired') AS claim_blocked_expired,
      COUNT(*) FILTER (WHERE name = 'draft_claim_blocked' AND reason = 'already_claimed') AS claim_blocked_already,
      COUNT(*) FILTER (WHERE name = 'draft_claim_blocked' AND reason = 'invalid_token') AS claim_blocked_invalid,
      COUNT(*) FILTER (WHERE name = 'draft_claim_blocked' AND reason = 'network') AS claim_blocked_network,
      COUNT(*) FILTER (WHERE name = 'draft_expired') AS draft_expired
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
      'signups', v_signups,
      'signup_rate', CASE WHEN v_visitors > 0 THEN ROUND(100.0 * v_signups / v_visitors, 2) ELSE 0 END
    ),
    'activation', jsonb_build_object(
      'start', stage.s_start,
      'fill', stage.s_fill,
      'generate', stage.s_generate,
      'download', stage.s_download,
      'sign', stage.s_sign,
      'start_to_download', CASE WHEN stage.s_start > 0 THEN ROUND(100.0 * stage.s_download / stage.s_start, 2) ELSE 0 END
    ),
    'continuity', jsonb_build_object(
      'draft_created', stage.draft_created,
      'draft_restore_offered', stage.draft_restore_offered,
      'draft_restored', stage.draft_restored,
      'claim_started', stage.claim_started,
      'claim_succeeded', stage.claim_succeeded,
      'claim_blocked', stage.claim_blocked,
      'claim_success_rate', CASE WHEN stage.claim_started > 0 THEN ROUND(100.0 * stage.claim_succeeded / stage.claim_started, 2) ELSE 0 END,
      'blocked_expired', stage.claim_blocked_expired,
      'blocked_already_claimed', stage.claim_blocked_already,
      'blocked_invalid_token', stage.claim_blocked_invalid,
      'blocked_network', stage.claim_blocked_network,
      'draft_expired', stage.draft_expired
    ),
    'conversion', jsonb_build_object(
      'plans_views', stage.plans_views,
      'checkout_started', stage.checkout_started,
      'checkout_failed', stage.checkout_failed,
      'upgrade_completed', stage.upgrade_completed,
      'paid_subscriptions', v_paid,
      'visitor_to_paid', CASE WHEN v_visitors > 0 THEN ROUND(100.0 * v_paid / v_visitors, 2) ELSE 0 END,
      'signup_to_paid', CASE WHEN v_signups > 0 THEN ROUND(100.0 * v_paid / v_signups, 2) ELSE 0 END,
      'checkout_completion', CASE WHEN stage.checkout_started > 0 THEN ROUND(100.0 * stage.upgrade_completed / stage.checkout_started, 2) ELSE 0 END
    ),
    'segments', jsonb_build_object(
      'business', stage.seg_business,
      'freelancer', stage.seg_freelancer
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
    )
  ) INTO res
  FROM stage, sign, fb;

  RETURN res;
END;
$$;