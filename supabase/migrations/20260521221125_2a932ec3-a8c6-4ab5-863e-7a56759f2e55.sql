
-- 1) Add aggregated counters
ALTER TABLE public.download_quota
  ADD COLUMN IF NOT EXISTS total_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_total_used integer NOT NULL DEFAULT 0;

-- 2) Backfill from existing per-kind counters
UPDATE public.download_quota
   SET total_used = COALESCE(contracts_used,0) + COALESCE(templates_used,0) + COALESCE(analyses_used,0),
       monthly_total_used = COALESCE(monthly_contracts_used,0) + COALESCE(monthly_templates_used,0);

-- 3) Replace consume_quota with generalized free-plan logic (6 lifetime + 2/month)
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
  _free_lifetime integer := 6;
  _free_monthly integer := 2;
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

  -- Pro path: 100/month aggregate cap
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
           total_used = total_used + 1,
           updated_at = now(),
           contracts_used = CASE WHEN _kind = 'contract' THEN contracts_used + 1 ELSE contracts_used END,
           templates_used = CASE WHEN _kind = 'template' THEN templates_used + 1 ELSE templates_used END,
           analyses_used  = CASE WHEN _kind = 'analysis' THEN analyses_used + 1  ELSE analyses_used  END
     WHERE user_id = _uid;
    RETURN jsonb_build_object('ok', true, 'used_bonus', false, 'is_pro', true);
  END IF;

  -- Free path: generalized 6 lifetime + 2/month, bonus is generalized too
  -- 1) lifetime allowance
  IF _row.total_used < _free_lifetime THEN
    UPDATE public.download_quota
       SET total_used = total_used + 1,
           updated_at = now(),
           contracts_used = CASE WHEN _kind = 'contract' THEN contracts_used + 1 ELSE contracts_used END,
           templates_used = CASE WHEN _kind = 'template' THEN templates_used + 1 ELSE templates_used END,
           analyses_used  = CASE WHEN _kind = 'analysis' THEN analyses_used + 1  ELSE analyses_used  END
     WHERE user_id = _uid;
    RETURN jsonb_build_object('ok', true, 'used_bonus', false, 'is_pro', false);
  END IF;

  -- 2) monthly allowance
  IF _row.monthly_total_used < _free_monthly THEN
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
    RETURN jsonb_build_object('ok', true, 'used_bonus', false, 'is_pro', false);
  END IF;

  -- 3) bonus operations (generalized for any kind)
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
    'ok', false,
    'reason', 'quota_exceeded',
    'is_pro', false,
    'next_reset', _row.monthly_reset_at + interval '30 days'
  );
END;
$function$;

-- 4) Update refund_quota to mirror generalized counters
CREATE OR REPLACE FUNCTION public.refund_quota(_user_id uuid, _kind text, _used_bonus boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF auth.role() <> 'service_role'
     AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  IF _used_bonus THEN
    UPDATE public.download_quota
       SET bonus_contracts = bonus_contracts + 1,
           total_used = GREATEST(0, total_used - 1),
           updated_at = now()
     WHERE user_id = _user_id;
  ELSE
    UPDATE public.download_quota
       SET total_used = GREATEST(0, total_used - 1),
           monthly_total_used = GREATEST(0, monthly_total_used - 1),
           updated_at = now()
     WHERE user_id = _user_id;
  END IF;

  IF _kind = 'contract' THEN
    UPDATE public.download_quota
       SET contracts_used = GREATEST(0, contracts_used - 1),
           monthly_contracts_used = GREATEST(0, monthly_contracts_used - 1),
           updated_at = now()
     WHERE user_id = _user_id;
  ELSIF _kind = 'template' THEN
    UPDATE public.download_quota
       SET templates_used = GREATEST(0, templates_used - 1),
           monthly_templates_used = GREATEST(0, monthly_templates_used - 1),
           updated_at = now()
     WHERE user_id = _user_id;
  ELSIF _kind = 'analysis' THEN
    UPDATE public.download_quota
       SET analyses_used = GREATEST(0, analyses_used - 1),
           updated_at = now()
     WHERE user_id = _user_id;
  END IF;
END;
$function$;
