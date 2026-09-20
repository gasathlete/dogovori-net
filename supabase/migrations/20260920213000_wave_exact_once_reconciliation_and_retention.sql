-- =============================================================================
-- 0037 — ТОЧНО-ЕДНОКРАТНА вълна: без преизразходване, без лъжливо
-- възстановяване, с истинско изравняване и пълна граница на товара.
--
-- 0036 НЕ се редактира. Тук се преопределят САМО двете функции с доказани
-- дефекти и се добавят две нови service_role функции:
--   1) public.quota_wave_reserve  — изтекъл лизинг НЕ се резервира наново;
--      отменена вълна се резервира само при ДОКАЗАНО възстановяване;
--      потвърдено повторение НИКОГА не връща празен/изтекъл товар.
--   2) public.quota_wave_cancel   — схемата на разпределението се проверява
--      fail-closed; липсващ ред на квотата или неточен UPDATE НЕ се обявява за
--      възстановяване; без GREATEST, който да прикрива отрицателен остатък.
--   3) public.quota_wave_reconcile_stale — маркира изтекли резервации за
--      ръчно решение; НЕ връща квота и НЕ пре-резервира автоматично.
--   4) public.sweep_expired_quota_wave_results — заличава САМО изтеклия точен
--      товар на вълната; счетоводството и обвързването остават.
--
-- Всички функции: SECURITY DEFINER, schema-qualified, SET search_path,
-- REVOKE от PUBLIC/anon/authenticated, GRANT само на service_role.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) РЕЗЕРВАЦИЯ — същият подпис, поправено поведение.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quota_wave_reserve(
  p_operation_id uuid,
  p_user_id uuid,
  p_kind text,
  p_purpose text,
  p_session_id text DEFAULT NULL,
  p_doc_key text DEFAULT NULL,
  p_batch_id uuid DEFAULT NULL,
  p_request_digest text DEFAULT NULL,
  p_ops_count integer DEFAULT 1,
  p_lease_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.quota_wave_operations%ROWTYPE;
  _quota public.download_quota%ROWTYPE;
  _purpose text;
  _doc_key text;
  _lease integer;
  _is_pro boolean;
  _cap integer;
  _used integer;
  _remaining_plan integer;
  _from_plan integer;
  _from_topup integer;
  _allocation jsonb;
  _existing boolean := false;
  _rows integer;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'operation_id and user_id are required' USING ERRCODE = '22023';
  END IF;
  IF p_request_digest IS NULL OR p_request_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'request_digest_required' USING ERRCODE = '22023';
  END IF;
  IF p_ops_count IS NULL OR p_ops_count < 1 THEN
    RAISE EXCEPTION 'ops_count_required' USING ERRCODE = '22023';
  END IF;

  _purpose := COALESCE(NULLIF(btrim(p_purpose), ''), 'unspecified');
  _doc_key := NULLIF(btrim(p_doc_key), '');
  _lease := GREATEST(60, LEAST(COALESCE(p_lease_seconds, 300), 1800));

  PERFORM pg_advisory_xact_lock(hashtext(p_operation_id::text));

  SELECT * INTO _row FROM public.quota_wave_operations
   WHERE operation_id = p_operation_id FOR UPDATE;

  IF FOUND THEN
    _existing := true;
    IF _row.user_id <> p_user_id
       OR _row.kind <> p_kind
       OR _row.purpose <> _purpose
       OR COALESCE(_row.session_id, '') <> COALESCE(p_session_id, '')
       OR _row.doc_key IS DISTINCT FROM _doc_key
       OR _row.batch_id IS DISTINCT FROM p_batch_id
       OR _row.request_digest <> p_request_digest
       OR _row.ops_count <> p_ops_count THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'idempotency_key_conflict');
    END IF;

    IF _row.state = 'committed' THEN
      -- Потвърденото повторение е валидно САМО докато точният товар е налице.
      IF _row.result IS NULL
         OR (_row.result_expires_at IS NOT NULL AND _row.result_expires_at <= now()) THEN
        RETURN jsonb_build_object(
          'status', 'response_expired',
          'reason', 'new_request_required',
          'new_request_required', true
        );
      END IF;
      RETURN jsonb_build_object(
        'status', 'replay', 'state', 'committed',
        'allocation', _row.allocation, 'response', _row.result
      );
    END IF;

    IF _row.state = 'reserved' THEN
      IF _row.lease_expires_at > now() THEN
        RETURN jsonb_build_object(
          'status', 'in_progress',
          'retry_after_seconds',
            GREATEST(1, CEIL(EXTRACT(EPOCH FROM (_row.lease_expires_at - now()))))::int
        );
      END IF;
      -- ИЗТЕКЪЛ ЛИЗИНГ: предходното разпределение НЕ е доказано отменено.
      -- Втора консумация тук би нарушила точно-еднократността, затова НЕ се
      -- пипат квотата, разпределението, редът и лизингът.
      RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'lease_expired');
    END IF;

    IF _row.state = 'cancelled' THEN
      IF _row.cancelled_at IS NULL THEN
        RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'cancellation_unproven');
      END IF;
      IF COALESCE(_row.detail->>'restored', '') <> 'true' THEN
        RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'restoration_unproven');
      END IF;
      -- Доказано отменена И доказано възстановена: същият ключ може отново.
    END IF;
  END IF;

  SELECT * INTO _quota FROM public.download_quota
   WHERE user_id = p_user_id
   ORDER BY user_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'unavailable', 'reason', 'quota_row_missing');
  END IF;

  _is_pro := (_quota.plan = 'pro'::public.user_plan)
             OR (_quota.pro_until IS NOT NULL AND _quota.pro_until > now());
  _cap := COALESCE(_quota.plan_ops_cap, CASE WHEN _is_pro THEN 100 ELSE 10 END);
  _used := CASE WHEN _is_pro THEN COALESCE(_quota.pro_monthly_used, 0)
                ELSE COALESCE(_quota.monthly_total_used, 0) END;

  _remaining_plan := GREATEST(0, _cap - _used);
  _from_plan := LEAST(p_ops_count, _remaining_plan);
  _from_topup := p_ops_count - _from_plan;

  IF _from_topup > COALESCE(_quota.topup_ops_balance, 0) THEN
    RETURN jsonb_build_object(
      'status', 'denied',
      'reason', 'insufficient_quota',
      'ops_needed', p_ops_count,
      'remaining_plan', _remaining_plan,
      'topup_balance', COALESCE(_quota.topup_ops_balance, 0)
    );
  END IF;

  IF _is_pro THEN
    UPDATE public.download_quota
       SET pro_monthly_used = COALESCE(pro_monthly_used, 0) + _from_plan,
           topup_ops_balance = COALESCE(topup_ops_balance, 0) - _from_topup,
           updated_at = now()
     WHERE user_id = p_user_id;
  ELSE
    UPDATE public.download_quota
       SET monthly_total_used = COALESCE(monthly_total_used, 0) + _from_plan,
           topup_ops_balance = COALESCE(topup_ops_balance, 0) - _from_topup,
           updated_at = now()
     WHERE user_id = p_user_id;
  END IF;
  GET DIAGNOSTICS _rows = ROW_COUNT;
  IF _rows <> 1 THEN
    RAISE EXCEPTION 'quota_consume_rowcount' USING ERRCODE = '40003';
  END IF;

  _allocation := '[]'::jsonb;
  IF _from_plan > 0 THEN
    _allocation := _allocation || jsonb_build_array(jsonb_build_object('source', 'plan', 'amount', _from_plan));
  END IF;
  IF _from_topup > 0 THEN
    _allocation := _allocation || jsonb_build_array(jsonb_build_object('source', 'topup', 'amount', _from_topup));
  END IF;

  IF _existing THEN
    UPDATE public.quota_wave_operations
       SET state = 'reserved',
           was_pro = _is_pro,
           allocation = _allocation,
           result = NULL,
           result_expires_at = NULL,
           lease_expires_at = now() + make_interval(secs => _lease),
           cancelled_at = NULL,
           committed_at = NULL,
           updated_at = now(),
           detail = ((_row.detail - 'cancel_reason') - 'restored')
                    || jsonb_build_object('retried_at', to_jsonb(now()))
     WHERE operation_id = p_operation_id;
  ELSE
    INSERT INTO public.quota_wave_operations (
      operation_id, user_id, kind, purpose, session_id, doc_key, batch_id,
      request_digest, ops_count, state, was_pro, allocation, lease_expires_at
    ) VALUES (
      p_operation_id, p_user_id, p_kind, _purpose, p_session_id, _doc_key, p_batch_id,
      p_request_digest, p_ops_count, 'reserved', _is_pro, _allocation,
      now() + make_interval(secs => _lease)
    );
  END IF;

  RETURN jsonb_build_object(
    'status', 'reserved',
    'allocation', _allocation,
    'ops_count', p_ops_count,
    'operation_id', p_operation_id
  );
EXCEPTION WHEN OTHERS THEN
  -- Всяко изключение отменя ЦЯЛАТА транзакция: нито квотата, нито редът се
  -- променят частично. Навън не излиза суров текст на заявката.
  RETURN jsonb_build_object('status', 'unavailable', 'reason', SQLSTATE);
END;
$function$;

REVOKE ALL ON FUNCTION public.quota_wave_reserve(uuid, uuid, text, text, text, text, uuid, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quota_wave_reserve(uuid, uuid, text, text, text, text, uuid, text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.quota_wave_reserve(uuid, uuid, text, text, text, text, uuid, text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.quota_wave_reserve(uuid, uuid, text, text, text, text, uuid, text, integer, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) ОТМЯНА — доказано възстановяване или изравняване. Никакво „почти".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quota_wave_cancel(
  p_operation_id uuid,
  p_user_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.quota_wave_operations%ROWTYPE;
  _quota public.download_quota%ROWTYPE;
  _item jsonb;
  _source text;
  _amount numeric;
  _from_plan integer := 0;
  _from_topup integer := 0;
  _seen_plan boolean := false;
  _seen_topup boolean := false;
  _invalid text := NULL;
  _rows integer;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'operation_id and user_id are required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_operation_id::text));

  SELECT * INTO _row FROM public.quota_wave_operations
   WHERE operation_id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'absent');
  END IF;
  IF _row.user_id <> p_user_id THEN
    RETURN jsonb_build_object('status', 'unavailable', 'reason', 'binding_conflict');
  END IF;
  IF _row.state = 'committed' THEN
    RETURN jsonb_build_object('status', 'already_committed');
  END IF;
  IF _row.state = 'cancelled' THEN
    -- Идемпотентна отмяна САМО при доказано възстановяване.
    IF _row.cancelled_at IS NOT NULL AND COALESCE(_row.detail->>'restored', '') = 'true' THEN
      RETURN jsonb_build_object('status', 'cancelled', 'replay', true, 'restored', _row.allocation);
    END IF;
    RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'restoration_unproven');
  END IF;

  -- СХЕМА НА РАЗПРЕДЕЛЕНИЕТО — fail-closed: масив, само plan/topup, цели
  -- положителни стойности, без повторен източник, точна сума = ops_count.
  IF _row.allocation IS NULL OR jsonb_typeof(_row.allocation) <> 'array' THEN
    _invalid := 'allocation_not_array';
  ELSE
    FOR _item IN SELECT * FROM jsonb_array_elements(_row.allocation)
    LOOP
      IF _invalid IS NOT NULL THEN
        EXIT;
      END IF;
      IF jsonb_typeof(_item) <> 'object' THEN
        _invalid := 'allocation_item_not_object';
        EXIT;
      END IF;
      _source := _item->>'source';
      IF jsonb_typeof(_item->'amount') <> 'number' THEN
        _invalid := 'allocation_amount_not_number';
        EXIT;
      END IF;
      _amount := (_item->>'amount')::numeric;
      IF _amount IS NULL OR _amount <= 0 OR _amount <> trunc(_amount) THEN
        _invalid := 'allocation_amount_invalid';
        EXIT;
      END IF;
      IF _source = 'plan' THEN
        IF _seen_plan THEN
          _invalid := 'allocation_duplicate_source';
          EXIT;
        END IF;
        _seen_plan := true;
        _from_plan := _amount::integer;
      ELSIF _source = 'topup' THEN
        IF _seen_topup THEN
          _invalid := 'allocation_duplicate_source';
          EXIT;
        END IF;
        _seen_topup := true;
        _from_topup := _amount::integer;
      ELSE
        _invalid := 'allocation_unknown_source';
        EXIT;
      END IF;
    END LOOP;
    IF _invalid IS NULL AND (_from_plan + _from_topup) <> _row.ops_count THEN
      _invalid := 'allocation_sum_mismatch';
    END IF;
  END IF;

  IF _invalid IS NOT NULL THEN
    -- Никаква промяна на квотата и на състоянието: остава 'reserved'.
    INSERT INTO public.billing_reconciliation_items (operation_id, user_id, kind, reason, detail)
    VALUES (p_operation_id, p_user_id, _row.kind, 'wave_cancel_' || _invalid,
            jsonb_build_object('ops_count', _row.ops_count, 'source', 'quota_wave_cancel'));
    RETURN jsonb_build_object('status', 'reconciliation', 'reason', _invalid);
  END IF;

  -- ТОЧНИЯТ ред-източник се заключва; липсващ ред НЕ е възстановяване.
  SELECT * INTO _quota FROM public.download_quota
   WHERE user_id = p_user_id
   ORDER BY user_id
   FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.billing_reconciliation_items (operation_id, user_id, kind, reason, detail)
    VALUES (p_operation_id, p_user_id, _row.kind, 'wave_cancel_quota_row_missing',
            jsonb_build_object('ops_count', _row.ops_count, 'source', 'quota_wave_cancel'));
    RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'quota_row_missing');
  END IF;

  -- БЕЗ GREATEST: ако използваното е по-малко от разпределеното, сметките не
  -- се връзват — това е изравняване, не мълчаливо „нулиране".
  IF COALESCE(
       CASE WHEN COALESCE(_row.was_pro, false) THEN _quota.pro_monthly_used
            ELSE _quota.monthly_total_used END, 0) < _from_plan THEN
    INSERT INTO public.billing_reconciliation_items (operation_id, user_id, kind, reason, detail)
    VALUES (p_operation_id, p_user_id, _row.kind, 'wave_cancel_plan_underflow',
            jsonb_build_object('ops_count', _row.ops_count, 'source', 'quota_wave_cancel'));
    RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'plan_underflow');
  END IF;

  IF COALESCE(_row.was_pro, false) THEN
    UPDATE public.download_quota
       SET pro_monthly_used = COALESCE(pro_monthly_used, 0) - _from_plan,
           topup_ops_balance = COALESCE(topup_ops_balance, 0) + _from_topup,
           updated_at = now()
     WHERE user_id = p_user_id;
  ELSE
    UPDATE public.download_quota
       SET monthly_total_used = COALESCE(monthly_total_used, 0) - _from_plan,
           topup_ops_balance = COALESCE(topup_ops_balance, 0) + _from_topup,
           updated_at = now()
     WHERE user_id = p_user_id;
  END IF;
  GET DIAGNOSTICS _rows = ROW_COUNT;
  IF _rows <> 1 THEN
    RAISE EXCEPTION 'quota_restore_rowcount' USING ERRCODE = '40003';
  END IF;

  UPDATE public.quota_wave_operations
     SET state = 'cancelled',
         cancelled_at = now(),
         lease_expires_at = now(),
         updated_at = now(),
         detail = _row.detail
                  || jsonb_build_object(
                       'cancel_reason', COALESCE(p_reason, 'unspecified'),
                       'restored', 'true',
                       'restored_allocation', _row.allocation)
   WHERE operation_id = p_operation_id;
  GET DIAGNOSTICS _rows = ROW_COUNT;
  IF _rows <> 1 THEN
    RAISE EXCEPTION 'wave_state_rowcount' USING ERRCODE = '40003';
  END IF;

  RETURN jsonb_build_object('status', 'cancelled', 'replay', false, 'restored', _row.allocation);
EXCEPTION WHEN OTHERS THEN
  -- ЕДНА транзакционна граница: изключението връща и квотата, и състоянието в
  -- изходния им вид. Никакво частично възстановяване, без суров текст.
  RETURN jsonb_build_object('status', 'reconciliation', 'reason', SQLSTATE);
END;
$function$;

REVOKE ALL ON FUNCTION public.quota_wave_cancel(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quota_wave_cancel(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.quota_wave_cancel(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.quota_wave_cancel(uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) ИЗРАВНЯВАНЕ на изтекли резервации: маркира, НЕ решава вместо човека.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quota_wave_reconcile_stale(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _limit integer;
  _rec record;
  _examined integer := 0;
  _flagged integer := 0;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  _limit := GREATEST(1, LEAST(COALESCE(p_limit, 50), 500));

  FOR _rec IN
    SELECT * FROM public.quota_wave_operations
     WHERE state = 'reserved'
       AND lease_expires_at IS NOT NULL
       AND lease_expires_at <= now()
     ORDER BY lease_expires_at, operation_id
     LIMIT _limit
     FOR UPDATE SKIP LOCKED
  LOOP
    _examined := _examined + 1;
    -- НЕ се гадае дали моделът е бил изпълнен: няма автоматично връщане на
    -- квота и няма нова резервация. Решението е изрично, от оператор/работник.
    IF COALESCE(_rec.detail->>'reconciliation_flagged', '') <> 'true' THEN
      INSERT INTO public.billing_reconciliation_items (operation_id, user_id, kind, reason, detail)
      VALUES (_rec.operation_id, _rec.user_id, _rec.kind, 'wave_lease_expired',
              jsonb_build_object('ops_count', _rec.ops_count, 'source', 'quota_wave_reconcile_stale'));
      UPDATE public.quota_wave_operations
         SET detail = _rec.detail || jsonb_build_object(
                        'reconciliation_flagged', 'true',
                        'reconciliation_flagged_at', to_jsonb(now())),
             updated_at = now()
       WHERE operation_id = _rec.operation_id;
      _flagged := _flagged + 1;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('examined', _examined, 'flagged', _flagged);
END;
$function$;

REVOKE ALL ON FUNCTION public.quota_wave_reconcile_stale(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quota_wave_reconcile_stale(integer) FROM anon;
REVOKE ALL ON FUNCTION public.quota_wave_reconcile_stale(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.quota_wave_reconcile_stale(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) ГРАНИЦА НА ТОВАРА за вълните: изтича САМО точният отговор.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sweep_expired_quota_wave_results(
  p_limit integer DEFAULT 500,
  p_dry_run boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _limit integer;
  _due integer := 0;
  _cleared integer := 0;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  _limit := GREATEST(1, LEAST(COALESCE(p_limit, 500), 5000));

  SELECT count(*) INTO _due
    FROM public.quota_wave_operations
   WHERE result IS NOT NULL
     AND result_expires_at IS NOT NULL
     AND result_expires_at <= now();

  IF COALESCE(p_dry_run, false) THEN
    RETURN jsonb_build_object('due', _due, 'cleared', 0, 'dry_run', true);
  END IF;

  WITH due AS (
    SELECT operation_id FROM public.quota_wave_operations
     WHERE result IS NOT NULL
       AND result_expires_at IS NOT NULL
       AND result_expires_at <= now()
     ORDER BY result_expires_at, operation_id
     LIMIT _limit
  )
  UPDATE public.quota_wave_operations q
     SET result = NULL, updated_at = now()
    FROM due
   WHERE q.operation_id = due.operation_id;
  GET DIAGNOSTICS _cleared = ROW_COUNT;

  RETURN jsonb_build_object('due', _due, 'cleared', _cleared, 'dry_run', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.sweep_expired_quota_wave_results(integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sweep_expired_quota_wave_results(integer, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.sweep_expired_quota_wave_results(integer, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_expired_quota_wave_results(integer, boolean) TO service_role;
