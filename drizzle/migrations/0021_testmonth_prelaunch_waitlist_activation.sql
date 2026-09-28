CREATE TABLE IF NOT EXISTS public.prelaunch_waitlist_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT false,
  retention_days integer NULL CHECK (retention_days BETWEEN 1 AND 1095),
  approval_ref text NULL CHECK (approval_ref ~ '^[A-Za-z0-9_.:-]{1,64}$'),
  window_seconds integer NOT NULL DEFAULT 3600 CHECK (window_seconds BETWEEN 60 AND 86400),
  max_per_window integer NOT NULL DEFAULT 200 CHECK (max_per_window BETWEEN 1 AND 100000),
  updated_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON TABLE public.prelaunch_waitlist_config FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.prelaunch_waitlist_config TO service_role;
ALTER TABLE public.prelaunch_waitlist_config ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.prelaunch_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (
    char_length(email) BETWEEN 6 AND 254 AND email = lower(btrim(email))
    AND email ~ '^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$'),
  feature text NOT NULL CHECK (feature IN (
    'blank_download','document_generation','document_review',
    'assistant','one_time_product','subscription')),
  consent_version text NOT NULL CHECK (consent_version = 'prelaunch_waitlist_v1'),
  consent_at timestamptz NOT NULL DEFAULT now(),
  retention_until timestamptz NOT NULL CHECK (retention_until > consent_at),
  UNIQUE (email, feature)
);
REVOKE ALL ON TABLE public.prelaunch_waitlist FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.prelaunch_waitlist TO service_role;
ALTER TABLE public.prelaunch_waitlist ENABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS public.prelaunch_waitlist_admission (
  bucket_start timestamptz PRIMARY KEY,
  admitted integer NOT NULL CHECK (admitted >= 0)
);
REVOKE ALL ON TABLE public.prelaunch_waitlist_admission FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.prelaunch_waitlist_admission TO service_role;
ALTER TABLE public.prelaunch_waitlist_admission ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.request_prelaunch_waitlist(
  _email text, _feature text, _consent boolean, _consent_version text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text := lower(btrim(coalesce(_email, '')));
  v_cfg public.prelaunch_waitlist_config%ROWTYPE;
  v_bucket timestamptz;
  v_ok integer;
BEGIN
  IF _consent IS DISTINCT FROM true THEN RETURN false; END IF;
  IF _consent_version IS DISTINCT FROM 'prelaunch_waitlist_v1' THEN RETURN false; END IF;
  IF char_length(v_email) NOT BETWEEN 6 AND 254
     OR v_email !~ '^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$' THEN RETURN false; END IF;
  IF _feature IS NULL OR _feature NOT IN ('blank_download','document_generation','document_review',
                      'assistant','one_time_product','subscription') THEN RETURN false; END IF;
  SELECT * INTO v_cfg FROM public.prelaunch_waitlist_config WHERE id FOR SHARE;
  IF NOT FOUND OR v_cfg.enabled IS NOT TRUE OR v_cfg.retention_days IS NULL
     OR v_cfg.approval_ref IS NULL THEN
    RETURN false;
  END IF;
  PERFORM 1 FROM public.prelaunch_waitlist
    WHERE email = v_email AND feature = _feature AND retention_until > now();
  IF FOUND THEN RETURN true; END IF;
  v_bucket := to_timestamp(floor(extract(epoch FROM now()) / v_cfg.window_seconds) * v_cfg.window_seconds);
  INSERT INTO public.prelaunch_waitlist_admission AS a (bucket_start, admitted)
    VALUES (v_bucket, 1)
  ON CONFLICT (bucket_start) DO UPDATE SET admitted = a.admitted + 1
    WHERE a.admitted < v_cfg.max_per_window
  RETURNING 1 INTO v_ok;
  IF v_ok IS NULL THEN RETURN false; END IF;
  DELETE FROM public.prelaunch_waitlist
    WHERE email = v_email AND feature = _feature AND retention_until <= now();
  INSERT INTO public.prelaunch_waitlist (email, feature, consent_version, consent_at, retention_until)
  VALUES (v_email, _feature, 'prelaunch_waitlist_v1', now(),
          now() + make_interval(days => v_cfg.retention_days))
  ON CONFLICT (email, feature) DO NOTHING;
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.request_prelaunch_waitlist(text, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_prelaunch_waitlist(text, text, boolean, text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.withdraw_prelaunch_waitlist(_email text)
RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (DELETE FROM public.prelaunch_waitlist WHERE email = lower(btrim(_email)) RETURNING 1)
  SELECT count(*)::integer FROM d;
$$;
REVOKE ALL ON FUNCTION public.withdraw_prelaunch_waitlist(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_prelaunch_waitlist(text) TO service_role;

CREATE OR REPLACE FUNCTION public.withdraw_my_prelaunch_waitlist()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_email text := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  v_n integer;
BEGIN
  IF auth.uid() IS NULL OR v_email = '' THEN RETURN 0; END IF;
  WITH d AS (DELETE FROM public.prelaunch_waitlist WHERE email = v_email RETURNING 1)
  SELECT count(*)::integer INTO v_n FROM d;
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.withdraw_my_prelaunch_waitlist() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_my_prelaunch_waitlist() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.purge_expired_prelaunch_waitlist()
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_n integer;
BEGIN
  WITH d AS (DELETE FROM public.prelaunch_waitlist WHERE retention_until <= now() RETURNING 1)
  SELECT count(*)::integer INTO v_n FROM d;
  DELETE FROM public.prelaunch_waitlist_admission WHERE bucket_start < now() - interval '2 days';
  RETURN v_n;
END $$;
REVOKE ALL ON FUNCTION public.purge_expired_prelaunch_waitlist() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_expired_prelaunch_waitlist() TO service_role;

DO $cron$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-prelaunch-waitlist-daily') THEN
    PERFORM cron.unschedule('purge-prelaunch-waitlist-daily');
  END IF;
  PERFORM cron.schedule('purge-prelaunch-waitlist-daily', '17 3 * * *',
    'SELECT public.purge_expired_prelaunch_waitlist()');
END
$cron$;