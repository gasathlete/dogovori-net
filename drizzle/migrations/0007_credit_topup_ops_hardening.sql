-- Hardening на public.credit_topup_ops (еднократни покупки → операции).
--
-- Цели:
--  * fail-closed валидация на входа (session id, ops, environment);
--  * ако редът в topup_purchases е НОВ, но UPDATE на download_quota не засегне
--    точно 1 ред → RAISE EXCEPTION, за да се върне цялата транзакция (включително
--    insert-а). Така Stripe получава non-2xx и повтаря, а балансът не се губи;
--  * повторна доставка на същата сесия → ok=true, credited=false, без нов кредит;
--  * SECURITY DEFINER, фиксиран search_path, execute само за service_role.
--
-- ВНИМАНИЕ: този файл е само ПОДГОТВЕН източник и НЕ е приложен.
-- Старите приложени миграции не са пипани.

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
  v_inserted integer := 0;
  v_updated integer := 0;
  v_env text := lower(COALESCE(NULLIF(btrim(p_environment), ''), 'sandbox'));
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'credit_topup_ops: user_id required';
  END IF;
  IF p_price_id IS NULL OR btrim(p_price_id) = '' THEN
    RAISE EXCEPTION 'credit_topup_ops: price_id required';
  END IF;
  IF p_session_id IS NULL OR btrim(p_session_id) = '' THEN
    RAISE EXCEPTION 'credit_topup_ops: session_id required';
  END IF;
  IF p_ops IS NULL OR p_ops < 1 OR p_ops > 1000 THEN
    RAISE EXCEPTION 'credit_topup_ops: ops out of range (%)', p_ops;
  END IF;
  IF v_env NOT IN ('sandbox', 'live') THEN
    RAISE EXCEPTION 'credit_topup_ops: invalid environment (%)', p_environment;
  END IF;

  INSERT INTO public.topup_purchases(
    user_id, price_id, ops_added, amount_eur, stripe_session_id, environment
  )
  VALUES (p_user_id, btrim(p_price_id), p_ops, p_amount, btrim(p_session_id), v_env)
  ON CONFLICT (stripe_session_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;

  IF v_inserted = 0 THEN
    -- Повторна доставка на същата Stripe сесия: идемпотентен успех.
    RETURN jsonb_build_object('ok', true, 'credited', false);
  END IF;

  -- Гарантираме, че редът с квотата съществува, преди да вдигнем баланса.
  INSERT INTO public.download_quota (user_id)
  VALUES (p_user_id)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.download_quota
     SET topup_ops_balance = COALESCE(topup_ops_balance, 0) + p_ops
   WHERE user_id = p_user_id;
  GET DIAGNOSTICS v_updated = ROW_COUNT;

  IF v_updated <> 1 THEN
    -- Rollback на цялата транзакция, включително topup_purchases insert-а,
    -- за да остане retry-ът безопасен и балансът консистентен.
    RAISE EXCEPTION 'credit_topup_ops: quota update affected % rows for user %', v_updated, p_user_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'credited', true, 'ops', p_ops);
END;
$$;

REVOKE ALL ON FUNCTION public.credit_topup_ops(uuid, text, integer, numeric, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.credit_topup_ops(uuid, text, integer, numeric, text, text) TO service_role;
