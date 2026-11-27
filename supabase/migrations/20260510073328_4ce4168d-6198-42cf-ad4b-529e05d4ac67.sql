-- New columns for monthly free quota + pro monthly limit
ALTER TABLE public.download_quota
  ADD COLUMN IF NOT EXISTS monthly_contracts_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_templates_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_reset_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN IF NOT EXISTS pro_monthly_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS pro_period_start timestamptz NOT NULL DEFAULT now();

-- Backfill: existing free users get bonus to reach new 3+3 lifetime allowance.
-- contracts_used currently >= 1 means they used the old "1 free", so bump bonus_contracts by 2.
-- templates_used currently >= 1 means they used the old "1 free template" — there's no separate
-- bonus_templates column, so we reset templates_used to 0 for users who already used their old free
-- one (they effectively get 3 fresh templates instead of 2 + 1 historical).
UPDATE public.download_quota
   SET bonus_contracts = bonus_contracts + GREATEST(0, 2 - GREATEST(0, contracts_used - 1)),
       templates_used = 0
 WHERE plan = 'free'::public.user_plan;

-- Pro users: reset monthly counter to 0, start period now
UPDATE public.download_quota
   SET pro_monthly_used = 0,
       pro_period_start = now()
 WHERE plan = 'pro'::public.user_plan
    OR (pro_until IS NOT NULL AND pro_until > now());

-- Replace consume_quota with new logic
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
  _free_contract_lifetime integer := 3;
  _free_template_lifetime integer := 3;
  _free_monthly_contract integer := 1;
  _free_monthly_template integer := 1;
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
           monthly_reset_at = now()
     WHERE user_id = _uid;
    _row.monthly_contracts_used := 0;
    _row.monthly_templates_used := 0;
    _row.monthly_reset_at := now();
  END IF;

  _is_pro := _row.plan = 'pro'::public.user_plan
             OR (_row.pro_until IS NOT NULL AND _row.pro_until > now());

  -- Pro path: check 100/month aggregate cap
  IF _is_pro THEN
    -- Roll the pro monthly counter if 30+ days elapsed
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
        'ok', false,
        'reason', 'pro_limit_reached',
        'is_pro', true,
        'pro_monthly_used', _row.pro_monthly_used,
        'pro_monthly_cap', _pro_monthly_cap,
        'pro_period_start', _row.pro_period_start
      );
    END IF;

    UPDATE public.download_quota
       SET pro_monthly_used = pro_monthly_used + 1,
           updated_at = now(),
           contracts_used = CASE WHEN _kind = 'contract' THEN contracts_used + 1 ELSE contracts_used END,
           templates_used = CASE WHEN _kind = 'template' THEN templates_used + 1 ELSE templates_used END,
           analyses_used  = CASE WHEN _kind = 'analysis' THEN analyses_used + 1  ELSE analyses_used  END
     WHERE user_id = _uid;
    RETURN jsonb_build_object('ok', true, 'used_bonus', false, 'is_pro', true);
  END IF;

  -- Free path
  IF _kind = 'contract' THEN
    -- 1) lifetime allowance
    IF _row.contracts_used < _free_contract_lifetime THEN
      UPDATE public.download_quota SET contracts_used = contracts_used + 1, updated_at = now()
        WHERE user_id = _uid;
      RETURN jsonb_build_object('ok', true, 'used_bonus', false, 'is_pro', false);
    END IF;
    -- 2) monthly allowance
    IF _row.monthly_contracts_used < _free_monthly_contract THEN
      UPDATE public.download_quota
         SET monthly_contracts_used = monthly_contracts_used + 1,
             contracts_used = contracts_used + 1,
             updated_at = now()
       WHERE user_id = _uid;
      RETURN jsonb_build_object('ok', true, 'used_bonus', false, 'is_pro', false);
    END IF;
    -- 3) bonus contracts (purchased one-off)
    IF _row.bonus_contracts > 0 THEN
      UPDATE public.download_quota SET bonus_contracts = bonus_contracts - 1, updated_at = now()
        WHERE user_id = _uid;
      RETURN jsonb_build_object('ok', true, 'used_bonus', true, 'is_pro', false);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'quota_exceeded', 'is_pro', false,
                              'next_reset', _row.monthly_reset_at + interval '30 days');

  ELSIF _kind = 'template' THEN
    IF _row.templates_used < _free_template_lifetime THEN
      UPDATE public.download_quota SET templates_used = templates_used + 1, updated_at = now()
        WHERE user_id = _uid;
      RETURN jsonb_build_object('ok', true, 'is_pro', false);
    END IF;
    IF _row.monthly_templates_used < _free_monthly_template THEN
      UPDATE public.download_quota
         SET monthly_templates_used = monthly_templates_used + 1,
             templates_used = templates_used + 1,
             updated_at = now()
       WHERE user_id = _uid;
      RETURN jsonb_build_object('ok', true, 'is_pro', false);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'quota_exceeded', 'is_pro', false,
                              'next_reset', _row.monthly_reset_at + interval '30 days');

  ELSE -- analysis
    IF _row.analyses_used < 1 THEN
      UPDATE public.download_quota SET analyses_used = analyses_used + 1, updated_at = now()
        WHERE user_id = _uid;
      RETURN jsonb_build_object('ok', true, 'is_pro', false);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'quota_exceeded', 'is_pro', false);
  END IF;
END;
$function$;