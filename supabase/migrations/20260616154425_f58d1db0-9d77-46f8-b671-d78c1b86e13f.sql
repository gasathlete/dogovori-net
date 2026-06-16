
-- 1. Add topup balance column
ALTER TABLE public.download_quota
  ADD COLUMN IF NOT EXISTS topup_ops_balance integer NOT NULL DEFAULT 0;

-- 2. Top-up purchases history
CREATE TABLE IF NOT EXISTS public.topup_purchases (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  price_id text NOT NULL,
  ops_added integer NOT NULL CHECK (ops_added > 0),
  amount_eur numeric(10,2),
  stripe_session_id text UNIQUE,
  environment text NOT NULL DEFAULT 'sandbox',
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.topup_purchases TO authenticated;
GRANT ALL ON public.topup_purchases TO service_role;

ALTER TABLE public.topup_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own top-up purchases"
  ON public.topup_purchases FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role manages top-up purchases"
  ON public.topup_purchases FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE INDEX IF NOT EXISTS idx_topup_purchases_user ON public.topup_purchases(user_id, created_at DESC);

-- 3. Charge corrections wave with stepped pricing
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
BEGIN
  IF p_count IS NULL OR p_count < 1 THEN
    p_count := 1;
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

  INSERT INTO public.corrections_batch_charges(user_id, batch_id, ops_charged)
    VALUES (p_user_id, p_batch_id, v_ops)
    ON CONFLICT DO NOTHING;

  RETURN jsonb_build_object(
    'ok', true,
    'ops_charged', v_ops,
    'from_plan', v_from_plan,
    'from_topup', v_from_topup,
    'remaining_plan', v_remaining_plan - v_from_plan,
    'topup_balance', COALESCE(v_quota.topup_ops_balance, 0) - v_from_topup
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.charge_corrections_wave(uuid, uuid, integer) TO authenticated, service_role;

-- 4. Credit top-up ops idempotently
CREATE OR REPLACE FUNCTION public.credit_topup_ops(
  p_user_id uuid,
  p_price_id text,
  p_ops integer,
  p_amount numeric,
  p_session_id text,
  p_environment text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inserted boolean := false;
BEGIN
  INSERT INTO public.topup_purchases(user_id, price_id, ops_added, amount_eur, stripe_session_id, environment)
    VALUES (p_user_id, p_price_id, p_ops, p_amount, p_session_id, COALESCE(p_environment, 'sandbox'))
    ON CONFLICT (stripe_session_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted THEN
    UPDATE public.download_quota
      SET topup_ops_balance = COALESCE(topup_ops_balance, 0) + p_ops
      WHERE user_id = p_user_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'credited', v_inserted);
END;
$$;

GRANT EXECUTE ON FUNCTION public.credit_topup_ops(uuid, text, integer, numeric, text, text) TO service_role;
