CREATE OR REPLACE FUNCTION public.consume_ai_message()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.download_quota%ROWTYPE;
  _is_pro boolean;
  _free_cap integer;
  _pro_cap  integer;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
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
           monthly_total_used     = 0,
           monthly_reset_at       = now()
     WHERE user_id = _uid;
    _row.monthly_total_used := 0;
    _row.monthly_reset_at   := now();
  END IF;

  _is_pro := _row.plan = 'pro'::public.user_plan
             OR (_row.pro_until IS NOT NULL AND _row.pro_until > now());

  IF _is_pro THEN
    IF now() - _row.pro_period_start >= interval '30 days' THEN
      UPDATE public.download_quota
         SET pro_monthly_used  = 0,
             pro_period_start  = now()
       WHERE user_id = _uid;
      _row.pro_monthly_used := 0;
      _row.pro_period_start := now();
    END IF;
    _pro_cap := COALESCE(_row.plan_ops_cap, 100);
    IF _row.pro_monthly_used >= _pro_cap THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'pro_limit_reached',
        'is_pro', true, 'used', _row.pro_monthly_used, 'cap', _pro_cap);
    END IF;
    UPDATE public.download_quota
       SET pro_monthly_used  = pro_monthly_used + 1,
           ai_messages_used  = ai_messages_used + 1,
           total_used        = total_used + 1,
           updated_at        = now()
     WHERE user_id = _uid;
    RETURN jsonb_build_object('ok', true, 'is_pro', true,
      'used', _row.pro_monthly_used + 1, 'cap', _pro_cap);
  END IF;

  IF now() - _row.signup_at < interval '30 days' THEN
    _free_cap := 5;
  ELSE
    _free_cap := 2;
  END IF;

  IF _row.monthly_total_used >= _free_cap THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ai_limit_reached',
      'used', _row.monthly_total_used, 'cap', _free_cap);
  END IF;

  UPDATE public.download_quota
     SET monthly_total_used = monthly_total_used + 1,
         ai_messages_used   = ai_messages_used + 1,
         total_used         = total_used + 1,
         updated_at         = now()
   WHERE user_id = _uid;
  RETURN jsonb_build_object('ok', true, 'is_pro', false,
    'used', _row.monthly_total_used + 1, 'cap', _free_cap);
END;
$$;