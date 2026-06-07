
-- 1) Schema additions on download_quota
ALTER TABLE public.download_quota
  ADD COLUMN IF NOT EXISTS signup_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS corrections_free_used boolean NOT NULL DEFAULT false;

-- Backfill signup_at from auth.users.created_at for existing rows
UPDATE public.download_quota q
   SET signup_at = u.created_at
  FROM auth.users u
 WHERE q.user_id = u.id
   AND q.signup_at > u.created_at;

-- 2) Replace consume_quota with dynamic free cap (5 first 30d, 2 thereafter)
CREATE OR REPLACE FUNCTION public.consume_quota(_kind text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.download_quota%ROWTYPE;
  _is_pro boolean;
  _free_monthly_cap integer;
  _pro_monthly_cap integer := 100;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF _kind NOT IN ('contract','template','analysis') THEN
    RAISE EXCEPTION 'invalid kind' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _row FROM public.download_quota
   WHERE user_id = _uid FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.download_quota (user_id) VALUES (_uid)
      RETURNING * INTO _row;
  END IF;

  -- Roll the monthly free counter if 30+ days elapsed
  IF now() - _row.monthly_reset_at >= interval '30 days' THEN
    UPDATE public.download_quota
       SET monthly_contracts_used = 0,
           monthly_templates_used = 0,
           monthly_total_used = 0,
           monthly_reset_at = now()
     WHERE user_id = _uid;
    _row.monthly_contracts_used := 0;
    _row.monthly_templates_used := 0;
    _row.monthly_total_used := 0;
    _row.monthly_reset_at := now();
  END IF;

  _is_pro := _row.plan = 'pro'::public.user_plan
             OR (_row.pro_until IS NOT NULL AND _row.pro_until > now());

  -- Free cap: 5 ops during the first 30 days from signup, 2 ops per month afterwards.
  IF now() - _row.signup_at < interval '30 days' THEN
    _free_monthly_cap := 5;
  ELSE
    _free_monthly_cap := 2;
  END IF;

  IF _is_pro THEN
    IF now() - _row.pro_period_start >= interval '30 days' THEN
      UPDATE public.download_quota
         SET pro_monthly_used = 0,
             pro_period_start = now()
       WHERE user_id = _uid;
      _row.pro_monthly_used := 0;
      _row.pro_period_start := now();
    END IF;

    IF _row.pro_monthly_used >= _pro_monthly_cap THEN
      RETURN jsonb_build_object(
        'ok', false, 'reason', 'pro_limit_reached', 'is_pro', true,
        'pro_monthly_used', _row.pro_monthly_used,
        'pro_monthly_cap', _pro_monthly_cap,
        'pro_period_start', _row.pro_period_start
      );
    END IF;

    UPDATE public.download_quota
       SET pro_monthly_used = pro_monthly_used + 1,
           total_used = total_used + 1,
           updated_at = now(),
           contracts_used = CASE WHEN _kind = 'contract' THEN contracts_used + 1 ELSE contracts_used END,
           templates_used = CASE WHEN _kind = 'template' THEN templates_used + 1 ELSE templates_used END,
           analyses_used  = CASE WHEN _kind = 'analysis' THEN analyses_used + 1  ELSE analyses_used  END
     WHERE user_id = _uid;
    RETURN jsonb_build_object('ok', true, 'used_bonus', false, 'is_pro', true);
  END IF;

  IF _row.monthly_total_used < _free_monthly_cap THEN
    UPDATE public.download_quota
       SET monthly_total_used = monthly_total_used + 1,
           total_used = total_used + 1,
           updated_at = now(),
           monthly_contracts_used = CASE WHEN _kind = 'contract' THEN monthly_contracts_used + 1 ELSE monthly_contracts_used END,
           monthly_templates_used = CASE WHEN _kind = 'template' THEN monthly_templates_used + 1 ELSE monthly_templates_used END,
           contracts_used = CASE WHEN _kind = 'contract' THEN contracts_used + 1 ELSE contracts_used END,
           templates_used = CASE WHEN _kind = 'template' THEN templates_used + 1 ELSE templates_used END,
           analyses_used  = CASE WHEN _kind = 'analysis' THEN analyses_used + 1  ELSE analyses_used  END
     WHERE user_id = _uid;
    RETURN jsonb_build_object('ok', true, 'used_bonus', false, 'is_pro', false,
                              'free_monthly_used', _row.monthly_total_used + 1,
                              'free_monthly_cap', _free_monthly_cap);
  END IF;

  IF _row.bonus_contracts > 0 THEN
    UPDATE public.download_quota
       SET bonus_contracts = bonus_contracts - 1,
           total_used = total_used + 1,
           updated_at = now(),
           contracts_used = CASE WHEN _kind = 'contract' THEN contracts_used + 1 ELSE contracts_used END,
           templates_used = CASE WHEN _kind = 'template' THEN templates_used + 1 ELSE templates_used END,
           analyses_used  = CASE WHEN _kind = 'analysis' THEN analyses_used + 1  ELSE analyses_used  END
     WHERE user_id = _uid;
    RETURN jsonb_build_object('ok', true, 'used_bonus', true, 'is_pro', false);
  END IF;

  RETURN jsonb_build_object(
    'ok', false, 'reason', 'quota_exceeded', 'is_pro', false,
    'free_monthly_cap', _free_monthly_cap,
    'next_reset', _row.monthly_reset_at + interval '30 days'
  );
END;
$function$;

-- 3) Replace consume_corrections_batch — first apply per account is free
CREATE OR REPLACE FUNCTION public.consume_corrections_batch(_session_id uuid, _batch_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _existing public.corrections_batch_charges%ROWTYPE;
  _row public.download_quota%ROWTYPE;
  _is_pro boolean;
  _result jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;

  -- Same-wave reuse is free
  IF _session_id IS NOT NULL AND _batch_id IS NOT NULL THEN
    SELECT * INTO _existing
      FROM public.corrections_batch_charges
     WHERE user_id = _uid AND session_id = _session_id AND batch_id = _batch_id
     FOR UPDATE;
    IF FOUND THEN
      RETURN jsonb_build_object(
        'ok', true, 'charged', false,
        'is_pro', (SELECT plan = 'pro'::public.user_plan
                          OR (pro_until IS NOT NULL AND pro_until > now())
                    FROM public.download_quota WHERE user_id = _uid),
        'reused_batch_charge', true
      );
    END IF;
  END IF;

  SELECT * INTO _row FROM public.download_quota WHERE user_id = _uid FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.download_quota (user_id) VALUES (_uid) RETURNING * INTO _row;
  END IF;
  _is_pro := _row.plan = 'pro'::public.user_plan
             OR (_row.pro_until IS NOT NULL AND _row.pro_until > now());

  -- One free corrections application per free account, ever.
  IF NOT _is_pro AND NOT _row.corrections_free_used THEN
    UPDATE public.download_quota
       SET corrections_free_used = true,
           updated_at = now()
     WHERE user_id = _uid;
    IF _session_id IS NOT NULL AND _batch_id IS NOT NULL THEN
      INSERT INTO public.corrections_batch_charges (user_id, session_id, batch_id)
        VALUES (_uid, _session_id, _batch_id)
        ON CONFLICT (user_id, session_id, batch_id) DO NOTHING;
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'charged', false, 'is_pro', false,
      'free_corrections_bonus', true
    );
  END IF;

  -- Otherwise charge as normal analysis op
  _result := public.consume_quota('analysis');

  IF COALESCE((_result->>'ok')::boolean, false) THEN
    IF _session_id IS NOT NULL AND _batch_id IS NOT NULL THEN
      INSERT INTO public.corrections_batch_charges (user_id, session_id, batch_id)
        VALUES (_uid, _session_id, _batch_id)
        ON CONFLICT (user_id, session_id, batch_id) DO NOTHING;
    END IF;
    _result := _result || jsonb_build_object('charged', true);
  ELSE
    _result := _result || jsonb_build_object('charged', false);
  END IF;

  RETURN _result;
END;
$function$;

-- 4) Reset all free users — fresh 30-day window with 5 free ops + free correction bonus
UPDATE public.download_quota
   SET monthly_contracts_used = 0,
       monthly_templates_used = 0,
       monthly_total_used = 0,
       monthly_reset_at = now(),
       ai_messages_used = 0,
       analysis_previews_used = 0,
       bilingual_previews_used = 0,
       features_reset_at = now(),
       corrections_free_used = false,
       signup_at = now(),
       updated_at = now()
 WHERE plan <> 'pro'::public.user_plan
   AND (pro_until IS NULL OR pro_until <= now());
