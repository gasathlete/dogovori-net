
-- 1) Admin bonus вече кредитира универсалния topup_ops_balance,
--    така че бонусите важат за всички типове операции и всички планове.
CREATE OR REPLACE FUNCTION public.admin_add_bonus_contracts(_user_id uuid, _count int)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _count IS NULL OR _count < 1 THEN
    RAISE EXCEPTION 'invalid count' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.download_quota (user_id, topup_ops_balance)
    VALUES (_user_id, _count)
  ON CONFLICT (user_id) DO UPDATE
    SET topup_ops_balance = COALESCE(public.download_quota.topup_ops_balance, 0) + _count,
        updated_at = now();
END;
$$;

REVOKE ALL ON FUNCTION public.admin_add_bonus_contracts(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_bonus_contracts(uuid, integer) TO authenticated, service_role;

-- 2) consume_quota вече пада към topup_ops_balance за ВСЕКИ план,
--    когато месечният кап е изчерпан (важи за contract/template/analysis).
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
  _pro_monthly_cap integer;
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

  IF now() - _row.signup_at < interval '30 days' THEN
    _free_monthly_cap := 5;
  ELSE
    _free_monthly_cap := 2;
  END IF;

  _pro_monthly_cap := COALESCE(_row.plan_ops_cap, 100);

  IF _is_pro THEN
    IF now() - _row.pro_period_start >= interval '30 days' THEN
      UPDATE public.download_quota
         SET pro_monthly_used = 0,
             pro_period_start = now()
       WHERE user_id = _uid;
      _row.pro_monthly_used := 0;
      _row.pro_period_start := now();
    END IF;

    IF _row.pro_monthly_used < _pro_monthly_cap THEN
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

    -- Pro кап изчерпан → пробвай topup/bonus (админ бонуси попадат тук)
    IF COALESCE(_row.topup_ops_balance, 0) > 0 THEN
      UPDATE public.download_quota
         SET topup_ops_balance = topup_ops_balance - 1,
             total_used = total_used + 1,
             updated_at = now(),
             contracts_used = CASE WHEN _kind = 'contract' THEN contracts_used + 1 ELSE contracts_used END,
             templates_used = CASE WHEN _kind = 'template' THEN templates_used + 1 ELSE templates_used END,
             analyses_used  = CASE WHEN _kind = 'analysis' THEN analyses_used + 1  ELSE analyses_used  END
       WHERE user_id = _uid;
      RETURN jsonb_build_object('ok', true, 'used_bonus', true, 'is_pro', true, 'source', 'topup');
    END IF;

    IF COALESCE(_row.bonus_contracts, 0) > 0 THEN
      UPDATE public.download_quota
         SET bonus_contracts = bonus_contracts - 1,
             total_used = total_used + 1,
             updated_at = now(),
             contracts_used = CASE WHEN _kind = 'contract' THEN contracts_used + 1 ELSE contracts_used END,
             templates_used = CASE WHEN _kind = 'template' THEN templates_used + 1 ELSE templates_used END,
             analyses_used  = CASE WHEN _kind = 'analysis' THEN analyses_used + 1  ELSE analyses_used  END
       WHERE user_id = _uid;
      RETURN jsonb_build_object('ok', true, 'used_bonus', true, 'is_pro', true, 'source', 'bonus');
    END IF;

    RETURN jsonb_build_object(
      'ok', false, 'reason', 'pro_limit_reached', 'is_pro', true,
      'pro_monthly_used', _row.pro_monthly_used,
      'pro_monthly_cap', _pro_monthly_cap,
      'pro_period_start', _row.pro_period_start
    );
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

  -- Free кап изчерпан → пробвай topup първо (админ бонуси), после стария bonus_contracts
  IF COALESCE(_row.topup_ops_balance, 0) > 0 THEN
    UPDATE public.download_quota
       SET topup_ops_balance = topup_ops_balance - 1,
           total_used = total_used + 1,
           updated_at = now(),
           contracts_used = CASE WHEN _kind = 'contract' THEN contracts_used + 1 ELSE contracts_used END,
           templates_used = CASE WHEN _kind = 'template' THEN templates_used + 1 ELSE templates_used END,
           analyses_used  = CASE WHEN _kind = 'analysis' THEN analyses_used + 1  ELSE analyses_used  END
     WHERE user_id = _uid;
    RETURN jsonb_build_object('ok', true, 'used_bonus', true, 'is_pro', false, 'source', 'topup');
  END IF;

  IF COALESCE(_row.bonus_contracts, 0) > 0 THEN
    UPDATE public.download_quota
       SET bonus_contracts = bonus_contracts - 1,
           total_used = total_used + 1,
           updated_at = now(),
           contracts_used = CASE WHEN _kind = 'contract' THEN contracts_used + 1 ELSE contracts_used END,
           templates_used = CASE WHEN _kind = 'template' THEN templates_used + 1 ELSE templates_used END,
           analyses_used  = CASE WHEN _kind = 'analysis' THEN analyses_used + 1  ELSE analyses_used  END
     WHERE user_id = _uid;
    RETURN jsonb_build_object('ok', true, 'used_bonus', true, 'is_pro', false, 'source', 'bonus');
  END IF;

  RETURN jsonb_build_object(
    'ok', false, 'reason', 'quota_exceeded', 'is_pro', false,
    'free_monthly_cap', _free_monthly_cap,
    'next_reset', _row.monthly_reset_at + interval '30 days'
  );
END;
$function$;
