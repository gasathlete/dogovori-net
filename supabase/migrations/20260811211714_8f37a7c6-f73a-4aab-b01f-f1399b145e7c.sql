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
    SELECT name, props, session_id FROM public.funnel_events
     WHERE created_at >= _from AND created_at < _to
  ),
  stage AS (
    SELECT
      COUNT(DISTINCT CASE WHEN name = 'doc_start' THEN session_id END) AS s_start,
      COUNT(DISTINCT CASE WHEN name LIKE 'doc_fill%' THEN session_id END) AS s_fill,
      COUNT(DISTINCT CASE WHEN name = 'doc_generate_success' THEN session_id END) AS s_generate,
      COUNT(DISTINCT CASE WHEN name IN ('doc_download','doc_download_pdf','doc_download_docx') THEN session_id END) AS s_download,
      COUNT(DISTINCT CASE WHEN name IN ('doc_sign','doc_sign_sent','signing_sent') THEN session_id END) AS s_sign,
      COUNT(*) FILTER (WHERE name = 'doc_generate_fail') AS generate_fail,
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
    FROM ev
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
    'conversion', jsonb_build_object(
      'plans_views', stage.plans_views,
      'checkout_started', stage.checkout_started,
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
      'generate_fail_rate', CASE WHEN stage.generate_started > 0 THEN ROUND(100.0 * stage.generate_fail / stage.generate_started, 2) ELSE 0 END,
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

REVOKE ALL ON FUNCTION public.metrics_overview(timestamptz, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.metrics_overview(timestamptz, timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.metrics_event_timeseries(_from timestamptz, _to timestamptz, _bucket text)
RETURNS TABLE(bucket timestamptz, starts bigint, downloads bigint, checkouts bigint, upgrades bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _interval interval;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  _interval := CASE _bucket WHEN 'hour' THEN interval '1 hour' ELSE interval '1 day' END;
  RETURN QUERY
  SELECT date_bin(_interval, created_at, _from) AS bucket,
         COUNT(*) FILTER (WHERE name = 'doc_start')::bigint,
         COUNT(*) FILTER (WHERE name IN ('doc_download','doc_download_pdf','doc_download_docx'))::bigint,
         COUNT(*) FILTER (WHERE name = 'checkout_started')::bigint,
         COUNT(*) FILTER (WHERE name = 'upgrade_completed')::bigint
    FROM public.funnel_events
   WHERE created_at >= _from AND created_at < _to
   GROUP BY 1 ORDER BY 1;
END;
$$;

REVOKE ALL ON FUNCTION public.metrics_event_timeseries(timestamptz, timestamptz, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.metrics_event_timeseries(timestamptz, timestamptz, text) TO authenticated, service_role;