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
  _free_cap integer := 15;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  _row := public._roll_feature_counters(_uid);
  _is_pro := _row.plan = 'pro'::public.user_plan
             OR (_row.pro_until IS NOT NULL AND _row.pro_until > now());

  IF _is_pro THEN
    RETURN jsonb_build_object('ok', true, 'is_pro', true);
  END IF;

  IF _row.ai_messages_used >= _free_cap THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ai_limit_reached',
                              'used', _row.ai_messages_used, 'cap', _free_cap);
  END IF;

  UPDATE public.download_quota
     SET ai_messages_used = ai_messages_used + 1, updated_at = now()
   WHERE user_id = _uid;
  RETURN jsonb_build_object('ok', true, 'is_pro', false,
                            'used', _row.ai_messages_used + 1, 'cap', _free_cap);
END;
$$;