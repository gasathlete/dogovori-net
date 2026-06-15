ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS assistant_messages_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS assistant_quota_reset_at timestamptz NOT NULL DEFAULT date_trunc('month', now()) + interval '1 month';

CREATE OR REPLACE FUNCTION public.consume_assistant_message(_user_id uuid, _limit integer DEFAULT 15)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_used integer;
  v_reset timestamptz;
  v_now timestamptz := now();
BEGIN
  -- Ensure profile row
  INSERT INTO public.profiles (id) VALUES (_user_id)
  ON CONFLICT (id) DO NOTHING;

  SELECT assistant_messages_used, assistant_quota_reset_at
    INTO v_used, v_reset
  FROM public.profiles WHERE id = _user_id FOR UPDATE;

  -- Rollover monthly window
  IF v_reset IS NULL OR v_now >= v_reset THEN
    v_used := 0;
    v_reset := date_trunc('month', v_now) + interval '1 month';
  END IF;

  IF v_used >= _limit THEN
    UPDATE public.profiles
      SET assistant_messages_used = v_used,
          assistant_quota_reset_at = v_reset
      WHERE id = _user_id;
    RETURN jsonb_build_object('allowed', false, 'used', v_used, 'limit', _limit, 'reset_at', v_reset);
  END IF;

  v_used := v_used + 1;
  UPDATE public.profiles
    SET assistant_messages_used = v_used,
        assistant_quota_reset_at = v_reset
    WHERE id = _user_id;

  RETURN jsonb_build_object('allowed', true, 'used', v_used, 'limit', _limit, 'reset_at', v_reset);
END;
$$;

GRANT EXECUTE ON FUNCTION public.consume_assistant_message(uuid, integer) TO authenticated, service_role;