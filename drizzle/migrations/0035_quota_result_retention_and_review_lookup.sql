-- Задържане на точните резултати в леджъра на квотата + само-четящо търсене на
-- завършена ревизия (0035 / 20260920193000).
--
-- 1) ГРАНИЦА НА ЗАДЪРЖАНЕ ЗА quota_operations.result_ref. Точният отговор се
--    пази САМО за да е вярно повторението при загубена връзка. Досега товарът
--    (текст на договор, пропуск за ревизия) оставаше без срок. Сега получава
--    изрична граница: 24 часа за отговори със съдържание и до доказуемия срок
--    на артефакта за чисто счетоводни/артефактни метаданни. След границата
--    търсенето връща типизирано „отговорът вече не се пази" — никога празен и
--    никога друг товар.
--
-- 2) САМО-ЧЕТЯЩО ТЪРСЕНЕ НА РЕВИЗИЯ. review_operation_reserve резервира; той не
--    може да се ползва преди безплатните проверки. Новата функция чете
--    състоянието по ЦЯЛОТО подписано обвързване без никакъв страничен ефект: не
--    резервира, не отменя, не изгаря пропуска.
--
-- 3) МЕТАЧ И ИЗТРИВАНЕ ПО ПОТРЕБИТЕЛ. Метачът изчиства САМО товара и запазва
--    минималните счетоводни данни срещу повторно ползване на ключа; има режим
--    само за преброяване. Изтриването по потребител може да изчисти товара.
--
-- Всички обекти са САМО сървърни (service_role).
--
-- ТАЗИ МИГРАЦИЯ НЕ Е ПРИЛОЖЕНА към базата.

-- ---------------------------------------------------------------------------
-- 1) Срок на товара в леджъра на квотата.
-- ---------------------------------------------------------------------------
ALTER TABLE public.quota_operations
  ADD COLUMN IF NOT EXISTS result_ref_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS quota_operations_result_expiry_idx
  ON public.quota_operations (result_ref_expires_at)
  WHERE result_ref IS NOT NULL;

-- Артефактните метаданни (кофа/път/име на файл) живеят точно толкова, колкото
-- е доказуемият срок на самия артефакт — нито ден повече.
CREATE OR REPLACE FUNCTION public.artifact_metadata_retention_seconds()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $function$ SELECT 604800 $function$;

REVOKE ALL ON FUNCTION public.artifact_metadata_retention_seconds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.artifact_metadata_retention_seconds() TO service_role;

-- Товар със СЪДЪРЖАНИЕ (текст на документ, анализ, пропуск за ревизия) се
-- задържа за краткия прозорец за повторен опит.
CREATE OR REPLACE FUNCTION public.quota_result_is_content_bearing(p_result_ref jsonb)
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $function$
  SELECT p_result_ref IS NOT NULL
     AND (
       p_result_ref ? 'contract'
       OR p_result_ref ? 'analysis'
       OR p_result_ref ? 'response'
       OR p_result_ref ? 'text'
       OR p_result_ref ? 'clauses'
       OR p_result_ref ? 'corrections'
       OR p_result_ref ? 'review_grant'
     )
$function$;

REVOKE ALL ON FUNCTION public.quota_result_is_content_bearing(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quota_result_is_content_bearing(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 1а) quota_commit записва срока заедно с товара.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quota_commit(p_operation_id uuid, p_result_ref jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _op public.quota_operations%ROWTYPE;
  _ref jsonb;
  _expires timestamptz;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  SELECT * INTO _op FROM public.quota_operations
   WHERE operation_id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_operation');
  END IF;
  IF _op.state = 'committed' THEN
    -- Повторното потвърждение НЕ удължава срока и НЕ подменя товара.
    IF _op.result_ref IS NOT NULL
       AND _op.result_ref_expires_at IS NOT NULL
       AND _op.result_ref_expires_at <= now() THEN
      RETURN jsonb_build_object('ok', true, 'replay', true, 'state', 'committed',
                                'charged', _op.charged, 'result_ref', NULL,
                                'reason', 'response_expired');
    END IF;
    RETURN jsonb_build_object('ok', true, 'replay', true, 'state', 'committed',
                              'charged', _op.charged, 'result_ref', _op.result_ref);
  END IF;
  IF _op.state = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'commit_after_cancel', 'state', 'cancelled');
  END IF;

  _ref := COALESCE(p_result_ref, _op.result_ref);
  IF _ref IS NULL THEN
    _expires := NULL;
  ELSIF public.quota_result_is_content_bearing(_ref) THEN
    _expires := now() + make_interval(secs => public.exact_response_retention_seconds());
  ELSE
    _expires := now() + make_interval(secs => public.artifact_metadata_retention_seconds());
  END IF;

  UPDATE public.quota_operations
     SET state = 'committed', committed_at = now(), updated_at = now(),
         lease_expires_at = NULL,
         result_ref = _ref,
         result_ref_expires_at = _expires
   WHERE operation_id = p_operation_id;

  RETURN jsonb_build_object('ok', true, 'replay', false, 'state', 'committed',
                            'charged', _op.charged,
                            'result_ref', _ref);
END;
$function$;

REVOKE ALL ON FUNCTION public.quota_commit(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quota_commit(uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.quota_commit(uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.quota_commit(uuid, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 1б) Търсенето уважава срока: изтекъл товар НИКОГА не се връща като „готов".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quota_operation_lookup(
  p_operation_id uuid,
  p_user_id uuid,
  p_kind text,
  p_purpose text,
  p_session_id uuid DEFAULT NULL,
  p_doc_key text DEFAULT NULL,
  p_batch_id uuid DEFAULT NULL,
  p_request_digest text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.quota_operations%ROWTYPE;
  _purpose text;
  _doc_key text;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'operation_id and user_id are required' USING ERRCODE = '22023';
  END IF;
  IF p_kind NOT IN ('contract','template','analysis') THEN
    RAISE EXCEPTION 'invalid kind' USING ERRCODE = '22023';
  END IF;
  IF p_request_digest IS NULL OR p_request_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'request_digest_required' USING ERRCODE = '22023';
  END IF;

  _purpose := COALESCE(NULLIF(btrim(p_purpose), ''), 'unspecified');
  _doc_key := NULLIF(btrim(p_doc_key), '');

  SELECT * INTO _row FROM public.quota_operations
   WHERE operation_id = p_operation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'absent');
  END IF;

  -- ПЪЛНО ОБВЪРЗВАНЕ: всяко разминаване е конфликт. Никога чужд резултат.
  IF _row.user_id <> p_user_id
     OR _row.kind <> p_kind
     OR _row.purpose <> _purpose
     OR _row.session_id IS DISTINCT FROM p_session_id
     OR _row.doc_key IS DISTINCT FROM _doc_key
     OR _row.batch_id IS DISTINCT FROM p_batch_id
     OR _row.request_digest IS DISTINCT FROM p_request_digest THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'idempotency_key_conflict');
  END IF;

  IF _row.state = 'committed' THEN
    -- Изтекъл товар: типизирано „вече не се пази", с ясно искане за НОВА
    -- заявка. Операцията си остава платена и НЕ се таксува втори път.
    IF _row.result_ref IS NULL
       OR (_row.result_ref_expires_at IS NOT NULL AND _row.result_ref_expires_at <= now()) THEN
      RETURN jsonb_build_object(
        'status', 'response_expired',
        'reason', 'new_request_required',
        'charged', _row.charged
      );
    END IF;
    RETURN jsonb_build_object(
      'status', 'committed',
      'result_ref', _row.result_ref,
      'charged', _row.charged,
      'source', _row.source,
      'result_ref_expires_at', _row.result_ref_expires_at
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
    RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'lease_expired');
  END IF;

  IF COALESCE((_row.detail->>'reconciliation_required')::boolean, false) THEN
    RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'reconciliation_required');
  END IF;
  IF _row.cancelled_at IS NULL THEN
    RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'cancellation_unproven');
  END IF;

  -- Доказано отменена операция: нормален нов опит по същия ключ.
  RETURN jsonb_build_object('status', 'absent', 'reason', 'cancelled');
END;
$function$;

REVOKE ALL ON FUNCTION public.quota_operation_lookup(uuid, uuid, text, text, uuid, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quota_operation_lookup(uuid, uuid, text, text, uuid, text, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.quota_operation_lookup(uuid, uuid, text, text, uuid, text, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.quota_operation_lookup(uuid, uuid, text, text, uuid, text, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) САМО-ЧЕТЯЩО търсене на завършена ревизия по подписаното обвързване.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_operation_lookup(
  p_nonce uuid,
  p_aud text,
  p_subject text,
  p_owner_id text,
  p_content_digest text,
  p_operation text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.review_operations%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_nonce IS NULL OR p_aud IS NULL OR p_operation IS NULL THEN
    RAISE EXCEPTION 'grant_payload_required' USING ERRCODE = '22023';
  END IF;
  IF p_content_digest IS NULL OR p_content_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'content_digest_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _row FROM public.review_operations WHERE nonce = p_nonce;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'absent');
  END IF;

  IF _row.aud <> p_aud
     OR COALESCE(_row.subject, '') <> COALESCE(p_subject, '')
     OR COALESCE(_row.owner_id, '') <> COALESCE(p_owner_id, '')
     OR _row.content_digest <> p_content_digest
     OR _row.operation <> p_operation THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'binding_conflict');
  END IF;

  IF _row.state = 'committed' THEN
    IF _row.response IS NULL
       OR (_row.response_expires_at IS NOT NULL AND _row.response_expires_at <= now()) THEN
      RETURN jsonb_build_object('status', 'response_expired', 'reason', 'new_request_required');
    END IF;
    RETURN jsonb_build_object('status', 'committed', 'response', _row.response);
  END IF;

  IF _row.state = 'reserved' AND _row.lease_expires_at > now() THEN
    RETURN jsonb_build_object(
      'status', 'in_progress',
      'retry_after_seconds',
        GREATEST(1, CEIL(EXTRACT(EPOCH FROM (_row.lease_expires_at - now()))))::int
    );
  END IF;

  IF _row.state = 'reserved' THEN
    RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'lease_expired');
  END IF;

  IF COALESCE((_row.detail->>'reconciliation_required')::boolean, false) THEN
    RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'reconciliation_required');
  END IF;
  IF _row.cancelled_at IS NULL THEN
    RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'cancellation_unproven');
  END IF;

  RETURN jsonb_build_object('status', 'absent', 'reason', 'cancelled');
END;
$function$;

REVOKE ALL ON FUNCTION public.review_operation_lookup(uuid, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.review_operation_lookup(uuid, text, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.review_operation_lookup(uuid, text, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.review_operation_lookup(uuid, text, text, text, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Метач на изтеклите товари в леджъра на квотата.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sweep_expired_quota_results(
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
    FROM public.quota_operations
   WHERE result_ref IS NOT NULL
     AND result_ref_expires_at IS NOT NULL
     AND result_ref_expires_at <= now();

  IF COALESCE(p_dry_run, false) THEN
    RETURN jsonb_build_object('due', _due, 'cleared', 0, 'dry_run', true);
  END IF;

  -- Изчиства се САМО товарът. Счетоводните факти (state, charged, source,
  -- request_digest, обвързването) остават — те пазят ключа от повторно ползване.
  WITH due AS (
    SELECT operation_id FROM public.quota_operations
     WHERE result_ref IS NOT NULL
       AND result_ref_expires_at IS NOT NULL
       AND result_ref_expires_at <= now()
     ORDER BY result_ref_expires_at
     LIMIT _limit
  )
  UPDATE public.quota_operations q
     SET result_ref = NULL, updated_at = now()
    FROM due
   WHERE q.operation_id = due.operation_id;
  GET DIAGNOSTICS _cleared = ROW_COUNT;

  RETURN jsonb_build_object('due', _due, 'cleared', _cleared, 'dry_run', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.sweep_expired_quota_results(integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sweep_expired_quota_results(integer, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.sweep_expired_quota_results(integer, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_expired_quota_results(integer, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Изтриване по потребител: товарът си отива, счетоводството остава.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.erase_quota_result_payloads(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _cleared integer := 0;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id_required' USING ERRCODE = '22023';
  END IF;

  UPDATE public.quota_operations
     SET result_ref = NULL, updated_at = now()
   WHERE user_id = p_user_id
     AND result_ref IS NOT NULL;
  GET DIAGNOSTICS _cleared = ROW_COUNT;

  RETURN jsonb_build_object('cleared', _cleared);
END;
$function$;

REVOKE ALL ON FUNCTION public.erase_quota_result_payloads(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erase_quota_result_payloads(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.erase_quota_result_payloads(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.erase_quota_result_payloads(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 5) quota_reserve_no_charge: резервация БЕЗ такса за build-custom-contract.
--
--    Генерирането на чернова остава безплатно (5/дневния ai_usage брояч не се
--    променя тук); квотата „договор" се плаща по-късно, при изтегляне, чрез
--    отделна резервация. Тази функция САМО записва точно-веднъж следа в
--    леджъра — не консумира абонамент, топъп, бонус или сесийно право и не
--    докосва download_quota. Идемпотентността е ПЪЛНА: същият operation_id
--    със същото обвързване връща точно текущото състояние (reserved/
--    committed/cancelled), различно обвързване е конфликт. Никога не превръща
--    вече таксуван ред в безплатен и никога не превръща безплатен ред в
--    таксуван — при съвпадение по operation_id просто се препредава
--    записаното състояние, без пренаписване на charged/source.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quota_reserve_no_charge(
  p_operation_id uuid,
  p_user_id uuid,
  p_kind text,
  p_purpose text,
  p_session_id text DEFAULT NULL,
  p_doc_key text DEFAULT NULL,
  p_batch_id uuid DEFAULT NULL,
  p_request_digest text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _existing public.quota_operations%ROWTYPE;
  _purpose text;
  _doc_key text;
  _session_id uuid;
  _lease integer := 900;
  _retry boolean := false;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'operation_id and user_id are required' USING ERRCODE = '22023';
  END IF;
  IF p_kind NOT IN ('contract','template','analysis') THEN
    RAISE EXCEPTION 'invalid kind' USING ERRCODE = '22023';
  END IF;
  IF p_request_digest IS NULL
     OR btrim(p_request_digest) = ''
     OR p_request_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'request_digest_required' USING ERRCODE = '22023';
  END IF;

  _purpose := COALESCE(NULLIF(btrim(p_purpose), ''), 'unspecified');
  _doc_key := NULLIF(btrim(p_doc_key), '');
  BEGIN
    _session_id := NULLIF(btrim(p_session_id), '')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'invalid session_id' USING ERRCODE = '22023';
  END;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  IF _doc_key IS NOT NULL AND _session_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      p_user_id::text || '|' || _session_id::text || '|' || _doc_key || '|' || p_kind, 0));
  END IF;

  SELECT * INTO _existing FROM public.quota_operations
   WHERE operation_id = p_operation_id FOR UPDATE;
  IF FOUND THEN
    -- ПЪЛНО ОБВЪРЗВАНЕ: всяко разминаване е конфликт — без промяна на
    -- вече записаното (таксувано или не) състояние.
    IF _existing.user_id <> p_user_id
       OR _existing.kind <> p_kind
       OR _existing.purpose <> _purpose
       OR _existing.session_id IS DISTINCT FROM _session_id
       OR _existing.doc_key IS DISTINCT FROM _doc_key
       OR _existing.batch_id IS DISTINCT FROM p_batch_id
       OR _existing.request_digest IS DISTINCT FROM p_request_digest THEN
      RAISE EXCEPTION 'idempotency_key_conflict' USING ERRCODE = '23505';
    END IF;

    IF _existing.state <> 'cancelled' THEN
      -- Препредаване БЕЗ пренаписване: таксуван ред си остава таксуван,
      -- безплатен ред си остава безплатен.
      RETURN jsonb_build_object(
        'ok', true,
        'replay', true,
        'state', _existing.state,
        'charged', _existing.charged,
        'source', _existing.source,
        'used_bonus', _existing.used_bonus,
        'result_ref', _existing.result_ref,
        'operation_id', _existing.operation_id
      );
    END IF;

    -- Отменена операция: нов опит по СЪЩИЯ ключ е легитимен САМО ако отмяната
    -- е доказана (иначе чакаме изравняване, никога тихо повторно решение).
    IF COALESCE((_existing.detail->>'reconciliation_required')::boolean, false) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'reconciliation_required',
        'state', 'cancelled',
        'charged', _existing.charged,
        'replay', true,
        'operation_id', _existing.operation_id
      );
    END IF;
    IF _existing.cancelled_at IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'cancellation_unproven',
        'state', 'cancelled',
        'replay', true,
        'operation_id', _existing.operation_id
      );
    END IF;
    _retry := true;
  END IF;

  IF _retry THEN
    -- Пълно пренаписване на реда: НОВАТА резервация е отново безплатна —
    -- никакво предишно таксуване не се възстановява тук (charged вече беше
    -- false за 'no_charge' операции по конструкция).
    UPDATE public.quota_operations
       SET state = 'reserved',
           charged = false,
           source = 'no_charge',
           used_bonus = false,
           result_ref = NULL,
           lease_expires_at = now() + make_interval(secs => _lease),
           cancelled_at = NULL,
           committed_at = NULL,
           updated_at = now(),
           detail = (_existing.detail - 'cancel_reason')
                    || jsonb_build_object('retried_at', to_jsonb(now()))
     WHERE operation_id = p_operation_id;
  ELSE
    INSERT INTO public.quota_operations (
      operation_id, user_id, kind, purpose, state, charged, source,
      used_bonus, session_id, doc_key, batch_id, request_digest, lease_expires_at
    ) VALUES (
      p_operation_id, p_user_id, p_kind, _purpose, 'reserved', false, 'no_charge',
      false, _session_id, _doc_key, p_batch_id, p_request_digest,
      now() + make_interval(secs => _lease)
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'replay', false,
    'state', 'reserved',
    'charged', false,
    'source', 'no_charge',
    'used_bonus', false,
    'result_ref', NULL,
    'operation_id', p_operation_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.quota_reserve_no_charge(uuid, uuid, text, text, text, text, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quota_reserve_no_charge(uuid, uuid, text, text, text, text, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.quota_reserve_no_charge(uuid, uuid, text, text, text, text, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.quota_reserve_no_charge(uuid, uuid, text, text, text, text, uuid, text) TO service_role;
