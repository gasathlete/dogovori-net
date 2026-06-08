
CREATE TABLE public.page_views (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now(),
  visitor_day_hash text NOT NULL,
  session_id uuid NOT NULL,
  user_id uuid,
  path text NOT NULL,
  referrer_host text,
  utm_source text,
  country text,
  device text,
  browser text,
  os text,
  duration_ms integer,
  is_bounce boolean NOT NULL DEFAULT true,
  event text NOT NULL DEFAULT 'pageview'
);

GRANT ALL ON public.page_views TO service_role;
GRANT SELECT ON public.page_views TO authenticated;

ALTER TABLE public.page_views ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Staff can read page_views" ON public.page_views
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE INDEX page_views_created_at_idx ON public.page_views (created_at DESC);
CREATE INDEX page_views_path_created_idx ON public.page_views (path, created_at DESC);
CREATE INDEX page_views_session_idx ON public.page_views (session_id);
CREATE INDEX page_views_visitor_day_idx ON public.page_views (visitor_day_hash, created_at DESC);

-- KPIs: visitors, pageviews, bounce rate, avg duration
CREATE OR REPLACE FUNCTION public.analytics_kpis(_from timestamptz, _to timestamptz)
RETURNS TABLE(visitors bigint, pageviews bigint, bounce_rate numeric, avg_duration_ms numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  RETURN QUERY
  WITH sessions AS (
    SELECT session_id,
           COUNT(*) AS pv,
           MAX(COALESCE(duration_ms,0)) AS dur,
           bool_and(is_bounce) AS bounced
      FROM public.page_views
     WHERE created_at >= _from AND created_at < _to AND event = 'pageview'
     GROUP BY session_id
  )
  SELECT COUNT(DISTINCT pv.visitor_day_hash)::bigint AS visitors,
         (SELECT COUNT(*)::bigint FROM public.page_views
           WHERE created_at >= _from AND created_at < _to AND event = 'pageview') AS pageviews,
         COALESCE(ROUND(100.0 * SUM(CASE WHEN s.pv = 1 AND s.bounced THEN 1 ELSE 0 END)::numeric
                / NULLIF(COUNT(*),0), 1), 0) AS bounce_rate,
         COALESCE(ROUND(AVG(s.dur)::numeric, 0), 0) AS avg_duration_ms
    FROM sessions s
    LEFT JOIN public.page_views pv ON pv.session_id = s.session_id
   WHERE pv.created_at >= _from AND pv.created_at < _to;
END;
$$;

-- Time series bucketed
CREATE OR REPLACE FUNCTION public.analytics_timeseries(_from timestamptz, _to timestamptz, _bucket text)
RETURNS TABLE(bucket timestamptz, visitors bigint, pageviews bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  _interval interval;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  _interval := CASE _bucket
    WHEN 'hour' THEN interval '1 hour'
    WHEN 'day' THEN interval '1 day'
    ELSE interval '1 hour'
  END;
  RETURN QUERY
  SELECT date_bin(_interval, created_at, _from) AS bucket,
         COUNT(DISTINCT visitor_day_hash)::bigint AS visitors,
         COUNT(*)::bigint AS pageviews
    FROM public.page_views
   WHERE created_at >= _from AND created_at < _to AND event = 'pageview'
   GROUP BY 1 ORDER BY 1;
END;
$$;

-- Top dimensions: path, referrer_host, country, device, browser, os
CREATE OR REPLACE FUNCTION public.analytics_top(_from timestamptz, _to timestamptz, _dim text, _limit int)
RETURNS TABLE(label text, visitors bigint, pageviews bigint)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  IF _dim NOT IN ('path','referrer_host','country','device','browser','os','utm_source') THEN
    RAISE EXCEPTION 'invalid dim';
  END IF;
  RETURN QUERY EXECUTE format(
    'SELECT COALESCE(NULLIF(%I,''''), ''(none)'')::text AS label,
            COUNT(DISTINCT visitor_day_hash)::bigint AS visitors,
            COUNT(*)::bigint AS pageviews
       FROM public.page_views
      WHERE created_at >= $1 AND created_at < $2 AND event = ''pageview''
      GROUP BY 1
      ORDER BY visitors DESC, pageviews DESC
      LIMIT $3', _dim
  ) USING _from, _to, _limit;
END;
$$;

-- App KPIs: signups, ops, paid conversions
CREATE OR REPLACE FUNCTION public.analytics_app_kpis(_from timestamptz, _to timestamptz)
RETURNS TABLE(signups bigint, ops bigint, paid_conversions bigint, conversion_rate numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public
AS $$
DECLARE _signups bigint; _paid bigint;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN RAISE EXCEPTION 'forbidden'; END IF;
  SELECT COUNT(*) INTO _signups FROM auth.users WHERE created_at >= _from AND created_at < _to;
  SELECT COUNT(*) INTO _paid FROM public.subscriptions
   WHERE created_at >= _from AND created_at < _to
     AND status IN ('active','trialing');
  RETURN QUERY
  SELECT _signups,
         COALESCE((SELECT SUM(contracts_used + templates_used + analyses_used)::bigint
                     FROM public.download_quota
                    WHERE updated_at >= _from AND updated_at < _to), 0),
         _paid,
         CASE WHEN _signups > 0 THEN ROUND(100.0 * _paid::numeric / _signups, 1) ELSE 0 END;
END;
$$;
