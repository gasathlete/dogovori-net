-- =============================================================================
-- GATE 4 — DATABASE PROOF CORRECTIONS
-- -----------------------------------------------------------------------------
-- Corrections proven against an isolated staging clone:
--   * assistant cancellation replays persisted closed reasons idempotently;
--   * AI document usage deduplication targets the partial unique index;
--   * expired document payload sweeping clears both payload and expiry marker;
--   * reconciliation audit tables are service-role only.
--
-- This migration is intentionally duplicated byte-for-byte in drizzle/ and
-- supabase/ so both migration runners converge on the same schema.
-- =============================================================================
BEGIN;

CREATE OR REPLACE FUNCTION public.assistant_turn_cancel(p_operation_id uuid, p_user_id uuid, p_reason text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row public.assistant_turn_operations%ROWTYPE;
  _alloc jsonb;
  _prior jsonb;
  _src text;
  _q public.download_quota%ROWTYPE;
  _usage public.team_usage%ROWTYPE;
  _restored boolean := false;
  _rolled boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  SELECT * INTO _row FROM public.assistant_turn_operations
   WHERE operation_id = p_operation_id FOR UPDATE;
  IF NOT FOUND OR _row.user_id <> p_user_id THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  IF _row.state = 'cancelled' THEN
    RETURN jsonb_build_object('status', 'cancelled', 'restored', _row.charged,
      'idempotent', true);
  END IF;
  IF _row.state = 'committed' THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'already_committed');
  END IF;
  IF _row.state = 'reconciliation' THEN
    RETURN jsonb_build_object(
      'status', 'reconciliation',
      'reason', CASE _row.detail
        WHEN 'later_usage' THEN 'later_usage'
        WHEN 'window_changed' THEN 'window_changed'
        WHEN 'allocation_missing' THEN 'allocation_missing'
        WHEN 'team_usage_missing' THEN 'team_usage_missing'
        WHEN 'team_underflow' THEN 'underflow'
        WHEN 'quota_row_missing' THEN 'quota_row_missing'
        WHEN 'provenance_missing' THEN 'provenance_missing'
        WHEN 'quota_underflow' THEN 'underflow'
        ELSE 'unknown_state'
      END,
      'idempotent', true
    );
  END IF;
  IF _row.state <> 'reserved' THEN
    RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'unknown_state');
  END IF;

  -- Стартиран модел НИКОГА не се отменя автоматично.
  IF _row.model_started_at IS NOT NULL THEN
    UPDATE public.assistant_turn_operations
       SET state = 'reconciliation', reconciliation_required = true,
           detail = left(COALESCE(p_reason, 'model_started'), 120), updated_at = now()
     WHERE operation_id = p_operation_id;
    RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'model_started');
  END IF;

  IF NOT _row.charged THEN
    UPDATE public.assistant_turn_operations
       SET state = 'cancelled', cancelled_at = now(), lease_expires_at = NULL,
           detail = left(COALESCE(p_reason, 'cancelled'), 120), updated_at = now()
     WHERE operation_id = p_operation_id;
    RETURN jsonb_build_object('status', 'cancelled', 'restored', false);
  END IF;

  _alloc := _row.allocation;
  _src := _alloc->>'source';
  IF _alloc IS NULL OR _src IS NULL THEN
    UPDATE public.assistant_turn_operations
       SET state = 'reconciliation', reconciliation_required = true,
           detail = 'allocation_missing', updated_at = now()
     WHERE operation_id = p_operation_id;
    RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'allocation_missing');
  END IF;

  _rolled := COALESCE((_alloc->>'rollover')::boolean, false);
  _prior := _alloc->'prior';

  IF _src = 'team' THEN
    SELECT * INTO _usage FROM public.team_usage
     WHERE team_id = (_alloc->>'team_id')::uuid FOR UPDATE;
    IF NOT FOUND THEN
      UPDATE public.assistant_turn_operations
         SET state = 'reconciliation', reconciliation_required = true,
             detail = 'team_usage_missing', updated_at = now()
       WHERE operation_id = p_operation_id;
      RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'team_usage_missing');
    END IF;
    -- ВСИЧКО ИЛИ НИЩО: периодът, върху който е таксувано, трябва да е СЪЩИЯТ.
    IF _usage.period_start IS DISTINCT FROM (_alloc->>'window_period_start')::timestamptz THEN
      UPDATE public.assistant_turn_operations
         SET state = 'reconciliation', reconciliation_required = true,
             detail = 'window_changed', updated_at = now()
       WHERE operation_id = p_operation_id;
      RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'window_changed');
    END IF;
    -- Превъртян прозорец се възстановява ЦЯЛ. Това е допустимо САМО ако след
    -- резервацията НИЩО друго не е ползвало същия прозорец — иначе по-късната
    -- употреба би била изтрита. При недоказуемост: само изравняване.
    IF _rolled THEN
      IF _alloc->'post' IS NULL
         OR _usage.period_start IS DISTINCT FROM (_alloc->'post'->>'period_start')::timestamptz
         OR _usage.ops_used IS DISTINCT FROM (_alloc->'post'->>'ops_used')::integer
         OR _usage.lifetime_ops IS DISTINCT FROM (_alloc->'post'->>'lifetime_ops')::integer THEN
        UPDATE public.assistant_turn_operations
           SET state = 'reconciliation', reconciliation_required = true,
               detail = 'later_usage', updated_at = now()
         WHERE operation_id = p_operation_id;
        RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'later_usage');
      END IF;
    END IF;
    IF _usage.lifetime_ops < COALESCE((_alloc->>'lifetime_ops')::integer, 0)
       OR (NOT _rolled AND _usage.ops_used < COALESCE((_alloc->>'ops_used')::integer, 0))
       OR (_rolled AND (_prior IS NULL OR _prior->>'period_start' IS NULL)) THEN
      UPDATE public.assistant_turn_operations
         SET state = 'reconciliation', reconciliation_required = true,
             detail = 'team_underflow', updated_at = now()
       WHERE operation_id = p_operation_id;
      RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'underflow');
    END IF;
    UPDATE public.team_usage
       SET ops_used = CASE
             WHEN _rolled THEN COALESCE((_prior->>'ops_used')::integer, 0)
             ELSE ops_used - COALESCE((_alloc->>'ops_used')::integer, 0) END,
           period_start = CASE
             WHEN _rolled THEN (_prior->>'period_start')::timestamptz
             ELSE period_start END,
           lifetime_ops = lifetime_ops - COALESCE((_alloc->>'lifetime_ops')::integer, 0),
           updated_at = now()
     WHERE team_id = (_alloc->>'team_id')::uuid;
    _restored := true;

  ELSE
    SELECT * INTO _q FROM public.download_quota WHERE user_id = _row.user_id FOR UPDATE;
    IF NOT FOUND THEN
      UPDATE public.assistant_turn_operations
         SET state = 'reconciliation', reconciliation_required = true,
             detail = 'quota_row_missing', updated_at = now()
       WHERE operation_id = p_operation_id;
      RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'quota_row_missing');
    END IF;
    -- ВСИЧКО ИЛИ НИЩО: прозорецът, върху който е таксувано, трябва да е СЪЩИЯТ.
    -- Ако междувременно е настъпил нов период, точното възстановяване е
    -- недоказуемо и състоянието отива за изравняване, без частична промяна.
    IF _q.monthly_reset_at IS DISTINCT FROM (_alloc->>'window_monthly_reset_at')::timestamptz
       OR (_src = 'pro'
           AND _q.pro_period_start IS DISTINCT FROM (_alloc->>'window_pro_period_start')::timestamptz) THEN
      UPDATE public.assistant_turn_operations
         SET state = 'reconciliation', reconciliation_required = true,
             detail = 'window_changed', updated_at = now()
       WHERE operation_id = p_operation_id;
      RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'window_changed');
    END IF;

    IF _rolled THEN
      -- Прозорецът е превъртян от САМАТА тази резервация. Възстановяваме точно
      -- записания произход, вместо приблизително изваждане.
      IF _alloc->'post' IS NULL
         OR _q.monthly_reset_at IS DISTINCT FROM (_alloc->'post'->>'monthly_reset_at')::timestamptz
         OR _q.monthly_total_used IS DISTINCT FROM (_alloc->'post'->>'monthly_total_used')::integer
         OR _q.monthly_contracts_used IS DISTINCT FROM (_alloc->'post'->>'monthly_contracts_used')::integer
         OR _q.monthly_templates_used IS DISTINCT FROM (_alloc->'post'->>'monthly_templates_used')::integer
         OR _q.ai_messages_used IS DISTINCT FROM (_alloc->'post'->>'ai_messages_used')::integer
         OR _q.total_used IS DISTINCT FROM (_alloc->'post'->>'total_used')::integer
         OR (_src = 'pro' AND (
              _q.pro_period_start IS DISTINCT FROM (_alloc->'post'->>'pro_period_start')::timestamptz
              OR _q.pro_monthly_used IS DISTINCT FROM (_alloc->'post'->>'pro_monthly_used')::integer)) THEN
        -- По-късна употреба в същия прозорец: ЦЯЛОСТНО възстановяване би я
        -- изтрило. Затова няма никаква промяна по квотата — само изравняване.
        UPDATE public.assistant_turn_operations
           SET state = 'reconciliation', reconciliation_required = true,
               detail = 'later_usage', updated_at = now()
         WHERE operation_id = p_operation_id;
        RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'later_usage');
      END IF;
      IF _prior IS NULL
         OR _prior->>'monthly_reset_at' IS NULL
         OR _q.ai_messages_used < COALESCE((_alloc->>'ai_messages_used')::integer, 0)
         OR _q.total_used < COALESCE((_alloc->>'total_used')::integer, 0) THEN
        UPDATE public.assistant_turn_operations
           SET state = 'reconciliation', reconciliation_required = true,
               detail = 'provenance_missing', updated_at = now()
         WHERE operation_id = p_operation_id;
        RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'provenance_missing');
      END IF;
      UPDATE public.download_quota
         SET ai_messages_used = ai_messages_used - COALESCE((_alloc->>'ai_messages_used')::integer, 0),
             total_used = total_used - COALESCE((_alloc->>'total_used')::integer, 0),
             monthly_contracts_used = COALESCE((_prior->>'monthly_contracts_used')::integer, 0),
             monthly_templates_used = COALESCE((_prior->>'monthly_templates_used')::integer, 0),
             monthly_total_used = COALESCE((_prior->>'monthly_total_used')::integer, 0),
             monthly_reset_at = (_prior->>'monthly_reset_at')::timestamptz,
             pro_monthly_used = CASE
               WHEN _src = 'pro' THEN COALESCE((_prior->>'pro_monthly_used')::integer, 0)
               ELSE pro_monthly_used END,
             pro_period_start = CASE
               WHEN _src = 'pro' AND _prior->>'pro_period_start' IS NOT NULL
                 THEN (_prior->>'pro_period_start')::timestamptz
               ELSE pro_period_start END,
             updated_at = now()
       WHERE user_id = _row.user_id;
      _restored := true;
    ELSE
      IF _q.ai_messages_used < COALESCE((_alloc->>'ai_messages_used')::integer, 0)
         OR _q.total_used < COALESCE((_alloc->>'total_used')::integer, 0)
         OR _q.monthly_total_used < COALESCE((_alloc->>'monthly_total_used')::integer, 0)
         OR (_src = 'pro' AND _q.pro_monthly_used < COALESCE((_alloc->>'pro_monthly_used')::integer, 0)) THEN
        UPDATE public.assistant_turn_operations
           SET state = 'reconciliation', reconciliation_required = true,
               detail = 'quota_underflow', updated_at = now()
         WHERE operation_id = p_operation_id;
        RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'underflow');
      END IF;
      UPDATE public.download_quota
         SET ai_messages_used = ai_messages_used - COALESCE((_alloc->>'ai_messages_used')::integer, 0),
             total_used = total_used - COALESCE((_alloc->>'total_used')::integer, 0),
             monthly_total_used = monthly_total_used - COALESCE((_alloc->>'monthly_total_used')::integer, 0),
             pro_monthly_used = pro_monthly_used - COALESCE((_alloc->>'pro_monthly_used')::integer, 0),
             updated_at = now()
       WHERE user_id = _row.user_id;
      _restored := true;
    END IF;
  END IF;

  UPDATE public.assistant_turn_operations
     SET state = 'cancelled', cancelled_at = now(), lease_expires_at = NULL,
         detail = left(COALESCE(p_reason, 'cancelled'), 120), updated_at = now()
   WHERE operation_id = p_operation_id;

  RETURN jsonb_build_object('status', 'cancelled', 'restored', _restored);
END;
$function$;

CREATE OR REPLACE FUNCTION public.ai_document_operation_commit(p_operation_id uuid, p_user_id uuid, p_purpose text, p_binding text, p_result jsonb, p_result_ttl_seconds integer, p_usage_function text, p_business jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _row public.ai_document_operations%ROWTYPE;
  _ttl integer;
  _wave jsonb;
  _kind text;
  _analysis_id uuid;
  _updated integer := 0;
  _usage text;
  _expected_usage text;
  _envelope jsonb;
BEGIN
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_result IS NULL THEN
    RAISE EXCEPTION 'result_required' USING ERRCODE = '22023';
  END IF;
  _ttl := GREATEST(60, LEAST(COALESCE(p_result_ttl_seconds, 86400), 7 * 86400));

  IF p_purpose IS NULL OR p_binding IS NULL OR p_binding !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'purpose_and_binding_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _row FROM public.ai_document_operations
   WHERE operation_id = p_operation_id FOR UPDATE;
  IF NOT FOUND OR _row.user_id <> p_user_id
     OR _row.purpose <> p_purpose
     OR _row.binding_digest <> p_binding THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'binding_conflict');
  END IF;
  IF _row.state = 'committed' THEN
    RETURN jsonb_build_object('status', 'replay', 'result', _row.result);
  END IF;
  IF _row.state <> 'reserved' THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'not_reserved');
  END IF;
  IF _row.lease_owner IS DISTINCT FROM p_operation_id THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'lease_not_owned');
  END IF;
  -- Резултат от модел БЕЗ трайно записано начало на модела е невъзможен.
  IF _row.model_started_at IS NULL THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'model_not_started');
  END IF;

  -- =========================================================================
  -- ВСЯКА проверка, която може да се провали, е ПРЕДИ първия запис. След първия
  -- запис всеки провал е RAISE (връщане назад), никога тихо RETURN.
  -- =========================================================================

  -- Името за ai_usage е СТРОГО определено от предназначението на реда.
  _expected_usage := CASE _row.purpose
    WHEN 'correct_uploaded' THEN 'correct-uploaded'
    WHEN 'generate_linked_document' THEN 'generate-linked-document'
    WHEN 'negotiation_strategy' THEN 'negotiation-strategy'
    WHEN 'ocr_contract' THEN 'ocr-contract'
    ELSE NULL
  END;
  _usage := NULLIF(btrim(COALESCE(p_usage_function, '')), '');
  IF _usage IS NOT NULL AND (_expected_usage IS NULL OR _usage <> _expected_usage) THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'usage_function_mismatch');
  END IF;

  -- Бизнес промяна: САМО за negotiation_strategy и САМО върху собствения,
  -- обвързан анализ със същата версия на източника и подписан плик.
  _kind := COALESCE(p_business->>'kind', '');
  IF _kind = 'negotiation_strategy' THEN
    IF _row.purpose <> 'negotiation_strategy' THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'business_purpose_mismatch');
    END IF;
    _analysis_id := NULLIF(p_business->>'analysis_id', '')::uuid;
    IF _analysis_id IS NULL OR _row.resource_id IS NULL OR _analysis_id <> _row.resource_id THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'business_resource_mismatch');
    END IF;
    IF _row.resource_version IS NOT NULL
       AND COALESCE(p_business->>'source_version', '') <> _row.resource_version THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'business_version_mismatch');
    END IF;
    _envelope := p_business->'envelope';
    -- Пликът е самата стратегия плюс подписаното доказателство `__evidence`.
    IF _envelope IS NULL OR jsonb_typeof(_envelope) <> 'object'
       OR jsonb_typeof(_envelope->'__evidence') <> 'object'
       OR COALESCE(_envelope->'__evidence'->>'signature', '') !~ '^[0-9a-f]{64}$'
       OR jsonb_typeof(_envelope->'__evidence'->'sources') <> 'array'
       OR jsonb_array_length(_envelope->'__evidence'->'sources') < 1 THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'business_envelope_invalid');
    END IF;
    IF NOT EXISTS (
      SELECT 1 FROM public.risk_analyses
       WHERE id = _analysis_id AND user_id = p_user_id
    ) THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'business_not_owned');
    END IF;
  ELSIF _kind <> '' AND _kind <> 'none' THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'business_kind_unknown');
  END IF;

  -- ------------------------- оттук НАДОЛУ са ЗАПИСИ -------------------------
  IF _kind = 'negotiation_strategy' THEN
    UPDATE public.risk_analyses
       SET negotiation_strategy = _envelope,
           negotiation_generated_at = COALESCE(
             NULLIF(p_business->>'generated_at', '')::timestamptz, now())
     WHERE id = _analysis_id AND user_id = p_user_id;
    GET DIAGNOSTICS _updated = ROW_COUNT;
    IF _updated <> 1 THEN
      RAISE EXCEPTION 'ai_document_business_rowcount' USING ERRCODE = '40003';
    END IF;
  END IF;

  -- Точно-еднократно счетоводство: уникалният индекс прави повторението нулево.
  IF _usage IS NOT NULL THEN
    INSERT INTO public.ai_usage (user_id, function_name, operation_id)
    VALUES (p_user_id, _usage, p_operation_id)
    ON CONFLICT (operation_id, function_name) WHERE operation_id IS NOT NULL DO NOTHING;
  END IF;

  IF _row.wave_ops > 0 THEN
    _wave := public.quota_wave_commit(
      p_operation_id := p_operation_id,
      p_user_id := p_user_id,
      p_result := jsonb_build_object('purpose', _row.purpose, 'ops', _row.wave_ops)
    );
    IF COALESCE(_wave->>'status', '') <> 'committed' THEN
      -- Бизнес промяната вече е записана: единственият честен изход е връщане
      -- назад на ЦЯЛАТА транзакция.
      RAISE EXCEPTION 'ai_document_wave_commit_failed' USING ERRCODE = '40003';
    END IF;
  END IF;

  UPDATE public.ai_document_operations
     SET state = 'committed',
         committed_at = now(),
         lease_expires_at = NULL,
         result = p_result,
         result_expires_at = now() + make_interval(secs => _ttl),
         wave_state = CASE WHEN wave_ops > 0 THEN 'committed' ELSE wave_state END,
         updated_at = now()
   WHERE operation_id = p_operation_id;
  GET DIAGNOSTICS _updated = ROW_COUNT;
  IF _updated <> 1 THEN
    RAISE EXCEPTION 'ai_document_commit_rowcount' USING ERRCODE = '40003';
  END IF;

  RETURN jsonb_build_object('status', 'committed', 'result', p_result);
END;
$function$;

CREATE OR REPLACE FUNCTION public.sweep_expired_ai_document_operation_results(p_limit integer, p_dry_run boolean)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _due integer := 0;
  _cleared integer := 0;
BEGIN
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT count(*) INTO _due FROM public.ai_document_operations
   WHERE result IS NOT NULL AND result_expires_at IS NOT NULL
     AND result_expires_at <= now();

  IF COALESCE(p_dry_run, false) THEN
    RETURN jsonb_build_object('due', _due, 'cleared', 0, 'dry_run', true);
  END IF;

  WITH victims AS (
    SELECT operation_id FROM public.ai_document_operations
     WHERE result IS NOT NULL AND result_expires_at IS NOT NULL
       AND result_expires_at <= now()
     ORDER BY result_expires_at
     LIMIT GREATEST(COALESCE(p_limit, 500), 1)
     FOR UPDATE SKIP LOCKED
  ), cleared AS (
    UPDATE public.ai_document_operations o
       SET result = NULL, result_expires_at = NULL, updated_at = now()
      FROM victims v
     WHERE o.operation_id = v.operation_id
     RETURNING o.operation_id
  )
  SELECT count(*) INTO _cleared FROM cleared;

  RETURN jsonb_build_object('due', _due, 'cleared', _cleared, 'dry_run', false);
END;
$function$;

REVOKE ALL ON TABLE public.product_reconciliation_events FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.product_reconciliation_resolutions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.product_reconciliation_terminal_calls FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.product_reconciliation_events TO service_role;
GRANT ALL ON TABLE public.product_reconciliation_resolutions TO service_role;
GRANT ALL ON TABLE public.product_reconciliation_terminal_calls TO service_role;

REVOKE ALL ON FUNCTION public.assistant_turn_cancel(uuid, uuid, text)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.ai_document_operation_commit(
  uuid, uuid, text, text, jsonb, integer, text, jsonb
) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.sweep_expired_ai_document_operation_results(integer, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_turn_cancel(uuid, uuid, text)
  TO service_role;
GRANT EXECUTE ON FUNCTION public.ai_document_operation_commit(
  uuid, uuid, text, text, jsonb, integer, text, jsonb
) TO service_role;
GRANT EXECUTE ON FUNCTION public.sweep_expired_ai_document_operation_results(integer, boolean)
  TO service_role;

COMMIT;
