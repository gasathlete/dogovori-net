-- Rate-limit bucket таблица + RPC за shared edge-функция helper
CREATE TABLE IF NOT EXISTS public.rate_limit_buckets (
  key text PRIMARY KEY,
  window_start timestamptz NOT NULL DEFAULT now(),
  count integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.rate_limit_buckets TO service_role;

ALTER TABLE public.rate_limit_buckets ENABLE ROW LEVEL SECURITY;

-- Само service_role има достъп — никакви RLS политики за authenticated/anon.
CREATE POLICY "service_role manages rate limits"
  ON public.rate_limit_buckets FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_rate_limit_buckets_window_start
  ON public.rate_limit_buckets(window_start);

-- RPC: атомично увеличава брояч и връща дали лимитът е надхвърлен.
CREATE OR REPLACE FUNCTION public.rate_limit_check(
  _key text, _max integer, _window_s integer
) RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _row public.rate_limit_buckets%ROWTYPE;
  _now timestamptz := now();
  _elapsed integer;
BEGIN
  INSERT INTO public.rate_limit_buckets(key, window_start, count)
    VALUES (_key, _now, 0)
    ON CONFLICT (key) DO NOTHING;

  SELECT * INTO _row FROM public.rate_limit_buckets WHERE key = _key FOR UPDATE;

  _elapsed := EXTRACT(EPOCH FROM (_now - _row.window_start))::int;
  IF _elapsed >= _window_s THEN
    UPDATE public.rate_limit_buckets
       SET window_start = _now, count = 1, updated_at = _now
     WHERE key = _key;
    RETURN jsonb_build_object('ok', true, 'remaining', _max - 1, 'retry_after_s', 0);
  END IF;

  IF _row.count >= _max THEN
    RETURN jsonb_build_object(
      'ok', false, 'remaining', 0,
      'retry_after_s', GREATEST(1, _window_s - _elapsed)
    );
  END IF;

  UPDATE public.rate_limit_buckets
     SET count = count + 1, updated_at = _now
   WHERE key = _key;
  RETURN jsonb_build_object('ok', true, 'remaining', _max - _row.count - 1, 'retry_after_s', 0);
END;
$$;

REVOKE ALL ON FUNCTION public.rate_limit_check(text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rate_limit_check(text, integer, integer) TO service_role;