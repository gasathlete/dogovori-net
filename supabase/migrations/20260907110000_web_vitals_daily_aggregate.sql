-- Privacy-minimal central field baseline for Core Web Vitals.
--
-- Съгласието е изцяло на клиента: браузърът извиква RPC-то САМО ако
-- посетителят е дал съгласие за категория "analytics" (cookie banner).
-- В базата се пази ЕДИНСТВЕНО агрегат по груби измерения — няма user_id,
-- session_id, IP, user agent, суров URL, referrer, UUID, документ/токен,
-- нито свободен текст. Растежът е ограничен от декартовото произведение на
-- измеренията на ден (3 метрики × 3 рейтинга × 12 групи × 3 устройства × 5 типа).

CREATE TABLE IF NOT EXISTS public.web_vitals_daily (
  day              date        NOT NULL DEFAULT (now() AT TIME ZONE 'utc')::date,
  metric           text        NOT NULL,
  rating           text        NOT NULL,
  route_group      text        NOT NULL,
  device_class     text        NOT NULL,
  navigation_type  text        NOT NULL,
  sample_count     bigint      NOT NULL DEFAULT 0,
  value_sum        bigint      NOT NULL DEFAULT 0,
  value_min        integer     NOT NULL DEFAULT 0,
  value_max        integer     NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT web_vitals_daily_pkey PRIMARY KEY (day, metric, rating, route_group, device_class, navigation_type),
  CONSTRAINT web_vitals_daily_metric_chk CHECK (metric IN ('LCP','INP','CLS')),
  CONSTRAINT web_vitals_daily_rating_chk CHECK (rating IN ('good','needs-improvement','poor')),
  CONSTRAINT web_vitals_daily_route_group_chk CHECK (route_group IN (
    'home','template','blog','category','sector','tool','wizard','start','auth','plans','legal','other')),
  CONSTRAINT web_vitals_daily_device_chk CHECK (device_class IN ('mobile','tablet','desktop')),
  CONSTRAINT web_vitals_daily_navigation_chk CHECK (navigation_type IN (
    'navigate','reload','back-forward','prerender','other')),
  CONSTRAINT web_vitals_daily_counts_chk CHECK (sample_count >= 0 AND value_sum >= 0),
  CONSTRAINT web_vitals_daily_bounds_chk CHECK (value_min >= 0 AND value_max >= 0 AND value_max >= value_min)
);

COMMENT ON TABLE public.web_vitals_daily IS
  'Aggregate-only Core Web Vitals field data (consent-gated client side). No personal identifiers, no raw paths.';

-- Първичният ключ вече е уникалният ограничител по измеренията; допълнителен
-- индекс по ден обслужва прозорците 7d/30d в администраторския изглед.
CREATE INDEX IF NOT EXISTS web_vitals_daily_day_idx ON public.web_vitals_daily (day DESC);

-- Никакви права за директно писане на anon/authenticated: писането минава
-- само през SECURITY DEFINER RPC-то, четенето — само за администратори (RLS).
REVOKE ALL ON TABLE public.web_vitals_daily FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.web_vitals_daily TO authenticated;
GRANT ALL ON TABLE public.web_vitals_daily TO service_role;

ALTER TABLE public.web_vitals_daily ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read web vitals aggregates" ON public.web_vitals_daily;
CREATE POLICY "Admins can read web vitals aggregates"
  ON public.web_vitals_daily
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Съзнателно НЯМА INSERT/UPDATE/DELETE политика за anon/authenticated.

CREATE OR REPLACE FUNCTION public.record_web_vital_aggregate(
  _metric text,
  _rating text,
  _route_group text,
  _device_class text,
  _navigation_type text,
  _value integer
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_max integer;
  v_expected_rating text;
BEGIN
  -- 1) Изрично отхвърляне на NULL за всеки аргумент, преди каквото и да е сравнение.
  IF _metric IS NULL
     OR _rating IS NULL
     OR _route_group IS NULL
     OR _device_class IS NULL
     OR _navigation_type IS NULL
     OR _value IS NULL THEN
    RETURN;
  END IF;

  -- 2) Строг allow-list; при непозната стойност просто не записваме.
  IF _metric NOT IN ('LCP','INP','CLS') THEN RETURN; END IF;
  IF _rating NOT IN ('good','needs-improvement','poor') THEN RETURN; END IF;
  IF _route_group NOT IN ('home','template','blog','category','sector','tool',
    'wizard','start','auth','plans','legal','other') THEN RETURN; END IF;
  IF _device_class NOT IN ('mobile','tablet','desktop') THEN RETURN; END IF;
  IF _navigation_type NOT IN ('navigate','reload','back-forward','prerender','other') THEN RETURN; END IF;

  -- 3) Разумни граници върху нормализираната цяла скала (ms за LCP/INP, CLS × 1000).
  v_max := CASE WHEN _metric = 'CLS' THEN 10000 ELSE 600000 END;
  IF _value < 0 OR _value > v_max THEN RETURN; END IF;

  -- 4) Рейтингът трябва да съответства на метриката и стойността по актуалните
  --    прагове на Web Vitals (включителни, върху нормализираната скала):
  --      LCP: good <= 2500, needs-improvement <= 4000, иначе poor
  --      INP: good <= 200,  needs-improvement <= 500,  иначе poor
  --      CLS: good <= 100,  needs-improvement <= 250,  иначе poor
  v_expected_rating := CASE _metric
    WHEN 'LCP' THEN CASE WHEN _value <= 2500 THEN 'good' WHEN _value <= 4000 THEN 'needs-improvement' ELSE 'poor' END
    WHEN 'INP' THEN CASE WHEN _value <= 200  THEN 'good' WHEN _value <= 500  THEN 'needs-improvement' ELSE 'poor' END
    WHEN 'CLS' THEN CASE WHEN _value <= 100  THEN 'good' WHEN _value <= 250  THEN 'needs-improvement' ELSE 'poor' END
  END;
  IF v_expected_rating IS NULL OR _rating <> v_expected_rating THEN RETURN; END IF;

  -- 5) Атомарен агрегиран UPSERT — един ред на комбинация от измерения и ден.
  INSERT INTO public.web_vitals_daily AS w (
    day, metric, rating, route_group, device_class, navigation_type,
    sample_count, value_sum, value_min, value_max
  ) VALUES (
    (now() AT TIME ZONE 'utc')::date, _metric, _rating, _route_group, _device_class, _navigation_type,
    1, _value, _value, _value
  )
  ON CONFLICT (day, metric, rating, route_group, device_class, navigation_type)
  DO UPDATE SET
    sample_count = w.sample_count + 1,
    value_sum    = w.value_sum + EXCLUDED.value_sum,
    value_min    = LEAST(w.value_min, EXCLUDED.value_min),
    value_max    = GREATEST(w.value_max, EXCLUDED.value_max),
    updated_at   = now();
END;
$$;

COMMENT ON FUNCTION public.record_web_vital_aggregate(text, text, text, text, text, integer) IS
  'Atomic aggregate upsert for Core Web Vitals. Consent is enforced client side; the function never reads or stores auth.uid or any identifier. Invalid, NULL, out-of-range or rating/value-inconsistent input is ignored.';

REVOKE ALL ON FUNCTION public.record_web_vital_aggregate(text, text, text, text, text, integer)
  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_web_vital_aggregate(text, text, text, text, text, integer)
  TO anon, authenticated;
