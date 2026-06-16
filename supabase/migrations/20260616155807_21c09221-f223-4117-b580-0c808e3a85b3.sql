
ALTER TABLE public.corrections_batch_charges
  ADD COLUMN IF NOT EXISTS ops_charged integer NOT NULL DEFAULT 1;

ALTER TABLE public.corrections_batch_charges
  ALTER COLUMN session_id DROP NOT NULL;

-- Recreate function to insert ops_charged correctly (no ON CONFLICT — batch_id is not unique by default)
CREATE OR REPLACE FUNCTION public.charge_corrections_wave(
  p_user_id uuid,
  p_batch_id uuid,
  p_count integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ops integer;
  v_quota record;
  v_is_pro boolean;
  v_cap integer;
  v_used integer;
  v_from_plan integer;
  v_from_topup integer;
  v_remaining_plan integer;
  v_existing record;
BEGIN
  IF p_count IS NULL OR p_count < 1 THEN
    p_count := 1;
  END IF;

  -- Idempotency: if this batch was already charged, return cached result.
  IF p_batch_id IS NOT NULL THEN
    SELECT * INTO v_existing
      FROM public.corrections_batch_charges
      WHERE user_id = p_user_id AND batch_id = p_batch_id
      LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'ops_charged', v_existing.ops_charged, 'cached', true);
    END IF;
  END IF;

  v_ops := GREATEST(1, CEIL(p_count::numeric / 5))::integer;

  SELECT * INTO v_quota FROM public.download_quota
    WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'download_quota row missing for user %', p_user_id;
  END IF;

  v_is_pro := (v_quota.plan = 'pro') OR (v_quota.pro_until IS NOT NULL AND v_quota.pro_until > now());
  v_cap := COALESCE(v_quota.plan_ops_cap, CASE WHEN v_is_pro THEN 100 ELSE 10 END);
  v_used := CASE WHEN v_is_pro THEN COALESCE(v_quota.pro_monthly_used, 0)
                 ELSE COALESCE(v_quota.monthly_total_used, 0) END;

  v_remaining_plan := GREATEST(0, v_cap - v_used);
  v_from_plan := LEAST(v_ops, v_remaining_plan);
  v_from_topup := v_ops - v_from_plan;

  IF v_from_topup > COALESCE(v_quota.topup_ops_balance, 0) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'insufficient_quota',
      'ops_needed', v_ops,
      'remaining_plan', v_remaining_plan,
      'topup_balance', COALESCE(v_quota.topup_ops_balance, 0)
    );
  END IF;

  IF v_is_pro THEN
    UPDATE public.download_quota
      SET pro_monthly_used = COALESCE(pro_monthly_used, 0) + v_from_plan,
          topup_ops_balance = COALESCE(topup_ops_balance, 0) - v_from_topup
      WHERE user_id = p_user_id;
  ELSE
    UPDATE public.download_quota
      SET monthly_total_used = COALESCE(monthly_total_used, 0) + v_from_plan,
          topup_ops_balance = COALESCE(topup_ops_balance, 0) - v_from_topup
      WHERE user_id = p_user_id;
  END IF;

  IF p_batch_id IS NOT NULL THEN
    INSERT INTO public.corrections_batch_charges(user_id, batch_id, ops_charged)
      VALUES (p_user_id, p_batch_id, v_ops);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'ops_charged', v_ops,
    'from_plan', v_from_plan,
    'from_topup', v_from_topup
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.charge_corrections_wave(uuid, uuid, integer) TO authenticated, service_role;
