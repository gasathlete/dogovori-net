-- Само-четящо търсене на вече завършена операция + граница на задържане на
-- точните отговори (0034 / 20260920183000).
--
-- 1) НОРМАЛЕН ПОВТОРЕН ОПИТ ПО ЗАВЪРШЕНА ОПЕРАЦИЯ. Досега единственият път да
--    се разбере, че операцията вече е завършила, беше през quota_reserve — а
--    той се извиква СЛЕД правното заземяване. Ако заземяването е временно
--    недостъпно, клиент с вече готов и вече таксуван резултат получаваше 503 и
--    оставаше без своя резултат. Новата функция чете състоянието БЕЗ никакъв
--    страничен ефект: не резервира, не освобождава, не таксува.
--
-- 2) ЗАДЪРЖАНЕ НА ТОЧНИТЕ ОТГОВОРИ. Трайните отговори (анонимна доставка и
--    ревизия) съществуват само за да е точно повторението при загубена връзка.
--    Затова получават изрична граница от 24 часа. След нея повторението връща
--    типизирано „отговорът вече не се пази", никога празен или друг отговор, а
--    метачът изчиства САМО товара, като запазва минималните счетоводни данни
--    срещу повторно ползване на ключа.
--
-- Всички обекти са САМО сървърни (service_role).
--
-- ТАЗИ МИГРАЦИЯ НЕ Е ПРИЛОЖЕНА към базата.

-- ---------------------------------------------------------------------------
-- 1) САМО-ЧЕТЯЩО търсене на завършена операция в леджъра на квотата.
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
    -- Връща се САМО трайно записаният резултат.
    RETURN jsonb_build_object(
      'status', 'committed',
      'result_ref', _row.result_ref,
      'charged', _row.charged,
      'source', _row.source
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
-- 2) Изрична граница на задържане за ТОЧНИТЕ отговори.
-- ---------------------------------------------------------------------------
ALTER TABLE public.anon_delivery_operations
  ADD COLUMN IF NOT EXISTS response_expires_at timestamptz;
ALTER TABLE public.review_operations
  ADD COLUMN IF NOT EXISTS response_expires_at timestamptz;

CREATE INDEX IF NOT EXISTS anon_delivery_response_expiry_idx
  ON public.anon_delivery_operations (response_expires_at)
  WHERE response IS NOT NULL;
CREATE INDEX IF NOT EXISTS review_operations_response_expiry_idx
  ON public.review_operations (response_expires_at)
  WHERE response IS NOT NULL;

-- Товарът на потвърдена операция вече не е безсрочен: проверката „committed има
-- отговор" важи само докато отговорът НЕ е изтекъл.
ALTER TABLE public.anon_delivery_operations
  DROP CONSTRAINT IF EXISTS anon_delivery_committed_response_chk;
ALTER TABLE public.anon_delivery_operations
  ADD CONSTRAINT anon_delivery_committed_response_chk
  CHECK (
    state <> 'committed'
    OR response IS NOT NULL
    OR response_expires_at IS NOT NULL
  );

ALTER TABLE public.review_operations
  DROP CONSTRAINT IF EXISTS review_operations_committed_response_chk;
ALTER TABLE public.review_operations
  ADD CONSTRAINT review_operations_committed_response_chk
  CHECK (
    state <> 'committed'
    OR response IS NOT NULL
    OR response_expires_at IS NOT NULL
  );

-- 24 часа са достатъчен прозорец за повторен опит след загубена връзка.
CREATE OR REPLACE FUNCTION public.exact_response_retention_seconds()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $function$ SELECT 86400 $function$;

REVOKE ALL ON FUNCTION public.exact_response_retention_seconds() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.exact_response_retention_seconds() TO service_role;

-- ---------------------------------------------------------------------------
-- 2а) Анонимна доставка: резервация с уважена граница на задържане.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.anon_delivery_reserve(
  p_operation_id uuid,
  p_identity_hash text,
  p_request_digest text,
  p_purpose text DEFAULT 'anon-assistant',
  p_cap integer DEFAULT 5,
  p_window_seconds integer DEFAULT 2592000,
  p_lease_seconds integer DEFAULT 300
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.anon_delivery_operations%ROWTYPE;
  _purpose text;
  _cap integer;
  _window integer;
  _lease integer;
  _delivered integer;
  _active integer;
  _retry boolean := false;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'operation_id_required' USING ERRCODE = '22023';
  END IF;
  IF p_identity_hash IS NULL OR p_identity_hash !~ '^[0-9a-f]{32,128}$' THEN
    RAISE EXCEPTION 'identity_hash_required' USING ERRCODE = '22023';
  END IF;
  IF p_request_digest IS NULL OR p_request_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'request_digest_required' USING ERRCODE = '22023';
  END IF;

  _purpose := COALESCE(NULLIF(btrim(p_purpose), ''), 'anon-assistant');
  _cap := GREATEST(1, LEAST(COALESCE(p_cap, 5), 100));
  _window := GREATEST(60, LEAST(COALESCE(p_window_seconds, 2592000), 7776000));
  _lease := GREATEST(30, LEAST(COALESCE(p_lease_seconds, 300), 1800));

  PERFORM pg_advisory_xact_lock(hashtextextended(_purpose || '|' || p_identity_hash, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  SELECT * INTO _row FROM public.anon_delivery_operations
   WHERE operation_id = p_operation_id FOR UPDATE;

  IF FOUND THEN
    IF _row.identity_hash <> p_identity_hash
       OR _row.request_digest <> p_request_digest
       OR _row.purpose <> _purpose THEN
      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'binding_conflict',
        'state', _row.state
      );
    END IF;

    IF _row.state = 'committed' THEN
      -- Изтекъл или изчистен товар НЕ се замества с празен/друг отговор.
      IF _row.response IS NULL
         OR (_row.response_expires_at IS NOT NULL AND _row.response_expires_at <= now()) THEN
        RETURN jsonb_build_object(
          'ok', false,
          'reason', 'response_expired',
          'state', 'committed',
          'operation_id', _row.operation_id
        );
      END IF;
      RETURN jsonb_build_object(
        'ok', true,
        'replay', true,
        'state', 'committed',
        'response', _row.response,
        'delivered', true,
        'operation_id', _row.operation_id
      );
    END IF;

    IF _row.state = 'reserved' AND _row.lease_expires_at > now() THEN
      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'in_progress',
        'state', 'reserved',
        'retry_after_seconds',
          GREATEST(1, CEIL(EXTRACT(EPOCH FROM (_row.lease_expires_at - now()))))::int
      );
    END IF;

    IF _row.state = 'cancelled'
       AND COALESCE((_row.detail->>'reconciliation_required')::boolean, false) THEN
      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'reconciliation_required',
        'state', 'cancelled'
      );
    END IF;

    IF _row.state = 'cancelled' AND _row.cancelled_at IS NULL THEN
      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'cancellation_unproven',
        'state', 'cancelled'
      );
    END IF;

    _retry := true;
  END IF;

  SELECT count(*) INTO _delivered
    FROM public.anon_delivery_operations
   WHERE identity_hash = p_identity_hash
     AND purpose = _purpose
     AND state = 'committed'
     AND committed_at > now() - make_interval(secs => _window);

  SELECT count(*) INTO _active
    FROM public.anon_delivery_operations
   WHERE identity_hash = p_identity_hash
     AND purpose = _purpose
     AND state = 'reserved'
     AND lease_expires_at > now()
     AND operation_id <> p_operation_id;

  IF _delivered + _active >= _cap THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'limit_reached',
      'delivered', _delivered,
      'remaining', 0,
      'cap', _cap
    );
  END IF;

  IF _retry THEN
    UPDATE public.anon_delivery_operations
       SET state = 'reserved',
           response = NULL,
           response_expires_at = NULL,
           window_seconds = _window,
           cap = _cap,
           lease_expires_at = now() + make_interval(secs => _lease),
           cancelled_at = NULL,
           committed_at = NULL,
           updated_at = now(),
           detail = (_row.detail - 'cancel_reason')
                    || jsonb_build_object('retried_at', to_jsonb(now()))
     WHERE operation_id = p_operation_id;
  ELSE
    INSERT INTO public.anon_delivery_operations (
      operation_id, identity_hash, request_digest, purpose, state,
      window_seconds, cap, lease_expires_at
    ) VALUES (
      p_operation_id, p_identity_hash, p_request_digest, _purpose, 'reserved',
      _window, _cap, now() + make_interval(secs => _lease)
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'replay', false,
    'state', 'reserved',
    'retry', _retry,
    'delivered', _delivered,
    'remaining', GREATEST(0, _cap - _delivered - _active - 1),
    'cap', _cap,
    'operation_id', p_operation_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.anon_delivery_reserve(uuid, text, text, text, integer, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anon_delivery_reserve(uuid, text, text, text, integer, integer, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 2б) Анонимна доставка: потвърждаване, което записва и границата на задържане.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.anon_delivery_commit(
  p_operation_id uuid,
  p_identity_hash text,
  p_request_digest text,
  p_response jsonb,
  p_purpose text DEFAULT 'anon-assistant'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.anon_delivery_operations%ROWTYPE;
  _purpose text;
  _delivered integer;
  _remaining integer;
  _final jsonb;
  _expires timestamptz;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL OR p_response IS NULL THEN
    RAISE EXCEPTION 'commit_payload_required' USING ERRCODE = '22023';
  END IF;

  _purpose := COALESCE(NULLIF(btrim(p_purpose), ''), 'anon-assistant');
  PERFORM pg_advisory_xact_lock(hashtextextended(_purpose || '|' || p_identity_hash, 0));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  SELECT * INTO _row FROM public.anon_delivery_operations
   WHERE operation_id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_operation');
  END IF;
  IF _row.identity_hash <> p_identity_hash
     OR _row.request_digest <> p_request_digest
     OR _row.purpose <> _purpose THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'binding_conflict');
  END IF;

  -- ПЪРВИЯТ траен отговор е ЕДИНСТВЕНИЯТ отговор.
  IF _row.state = 'committed' THEN
    IF _row.response IS NULL
       OR (_row.response_expires_at IS NOT NULL AND _row.response_expires_at <= now()) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'response_expired', 'state', 'committed');
    END IF;
    RETURN jsonb_build_object(
      'ok', true,
      'replay', true,
      'state', 'committed',
      'response', _row.response,
      'remaining', COALESCE((_row.response->>'remaining')::int, 0)
    );
  END IF;
  IF _row.state <> 'reserved' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_reserved', 'state', _row.state);
  END IF;

  SELECT count(*) INTO _delivered
    FROM public.anon_delivery_operations
   WHERE identity_hash = p_identity_hash
     AND purpose = _purpose
     AND state = 'committed'
     AND committed_at > now() - make_interval(secs => _row.window_seconds);

  IF _delivered >= _row.cap THEN
    RETURN jsonb_build_object(
      'ok', false, 'reason', 'limit_reached', 'delivered', _delivered, 'remaining', 0
    );
  END IF;

  _remaining := GREATEST(0, _row.cap - _delivered - 1);
  _final := p_response || jsonb_build_object('remaining', _remaining);
  _expires := now() + make_interval(secs => public.exact_response_retention_seconds());

  UPDATE public.anon_delivery_operations
     SET state = 'committed',
         response = _final,
         response_expires_at = _expires,
         committed_at = now(),
         cancelled_at = NULL,
         updated_at = now()
   WHERE operation_id = p_operation_id;

  RETURN jsonb_build_object(
    'ok', true,
    'replay', false,
    'state', 'committed',
    'delivered', _delivered + 1,
    'remaining', _remaining,
    'response', _final,
    'response_expires_at', to_jsonb(_expires),
    'cap', _row.cap
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.anon_delivery_commit(uuid, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anon_delivery_commit(uuid, text, text, jsonb, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2в) Ревизия: резервация и потвърждаване с уважена граница на задържане.
--     TTL на самия пропуск (10 минути) НЕ се променя.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.review_operation_reserve(
  p_nonce uuid,
  p_aud text,
  p_subject text,
  p_owner_id text,
  p_content_digest text,
  p_operation text,
  p_expires_at timestamptz,
  p_lease_seconds integer DEFAULT 180
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.review_operations%ROWTYPE;
  _lease integer;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_nonce IS NULL OR p_aud IS NULL OR p_operation IS NULL
     OR p_expires_at IS NULL THEN
    RAISE EXCEPTION 'grant_payload_required' USING ERRCODE = '22023';
  END IF;
  IF p_content_digest IS NULL OR p_content_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'content_digest_required' USING ERRCODE = '22023';
  END IF;

  _lease := GREATEST(30, LEAST(COALESCE(p_lease_seconds, 180), 900));
  PERFORM pg_advisory_xact_lock(hashtextextended(p_nonce::text, 0));

  SELECT * INTO _row FROM public.review_operations
   WHERE nonce = p_nonce FOR UPDATE;

  IF FOUND THEN
    IF _row.aud <> p_aud
       OR COALESCE(_row.subject, '') <> COALESCE(p_subject, '')
       OR COALESCE(_row.owner_id, '') <> COALESCE(p_owner_id, '')
       OR _row.content_digest <> p_content_digest
       OR _row.operation <> p_operation THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'binding_conflict');
    END IF;

    IF _row.state = 'committed' THEN
      IF _row.response IS NULL
         OR (_row.response_expires_at IS NOT NULL AND _row.response_expires_at <= now()) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'response_expired', 'state', 'committed');
      END IF;
      RETURN jsonb_build_object(
        'ok', true, 'replay', true, 'state', 'committed', 'response', _row.response
      );
    END IF;

    IF _row.state = 'reserved' AND _row.lease_expires_at > now() THEN
      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'in_progress',
        'state', 'reserved',
        'retry_after_seconds',
          GREATEST(1, CEIL(EXTRACT(EPOCH FROM (_row.lease_expires_at - now()))))::int
      );
    END IF;

    IF _row.state = 'cancelled'
       AND COALESCE((_row.detail->>'reconciliation_required')::boolean, false) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'reconciliation_required');
    END IF;

    IF _row.state = 'cancelled' AND _row.cancelled_at IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'cancellation_unproven');
    END IF;

    IF p_expires_at <= now() THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'expired');
    END IF;

    UPDATE public.review_operations
       SET state = 'reserved',
           response = NULL,
           response_expires_at = NULL,
           grant_expires_at = p_expires_at,
           lease_expires_at = now() + make_interval(secs => _lease),
           cancelled_at = NULL,
           committed_at = NULL,
           updated_at = now(),
           detail = (_row.detail - 'cancel_reason')
                    || jsonb_build_object('retried_at', to_jsonb(now()))
     WHERE nonce = p_nonce;

    RETURN jsonb_build_object(
      'ok', true, 'replay', false, 'state', 'reserved', 'retry', true
    );
  END IF;

  IF p_expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  INSERT INTO public.review_operations (
    nonce, aud, subject, owner_id, content_digest, operation,
    grant_expires_at, state, lease_expires_at
  ) VALUES (
    p_nonce, p_aud, p_subject, p_owner_id, p_content_digest, p_operation,
    p_expires_at, 'reserved', now() + make_interval(secs => _lease)
  );

  RETURN jsonb_build_object(
    'ok', true, 'replay', false, 'state', 'reserved', 'retry', false
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.review_operation_reserve(uuid, text, text, text, text, text, timestamptz, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_operation_reserve(uuid, text, text, text, text, text, timestamptz, integer) TO service_role;

CREATE OR REPLACE FUNCTION public.review_operation_commit(
  p_nonce uuid,
  p_content_digest text,
  p_response jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.review_operations%ROWTYPE;
  _expires timestamptz;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_nonce IS NULL OR p_response IS NULL THEN
    RAISE EXCEPTION 'commit_payload_required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_nonce::text, 0));

  SELECT * INTO _row FROM public.review_operations
   WHERE nonce = p_nonce FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_operation');
  END IF;
  IF _row.content_digest <> p_content_digest THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'binding_conflict');
  END IF;
  IF _row.state = 'committed' THEN
    IF _row.response IS NULL
       OR (_row.response_expires_at IS NOT NULL AND _row.response_expires_at <= now()) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'response_expired', 'state', 'committed');
    END IF;
    RETURN jsonb_build_object(
      'ok', true, 'replay', true, 'state', 'committed', 'response', _row.response
    );
  END IF;
  IF _row.state <> 'reserved' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_reserved', 'state', _row.state);
  END IF;

  _expires := now() + make_interval(secs => public.exact_response_retention_seconds());

  UPDATE public.review_operations
     SET state = 'committed',
         response = p_response,
         response_expires_at = _expires,
         committed_at = now(),
         cancelled_at = NULL,
         updated_at = now()
   WHERE nonce = p_nonce;

  RETURN jsonb_build_object(
    'ok', true, 'replay', false, 'state', 'committed', 'response', p_response,
    'response_expires_at', to_jsonb(_expires)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.review_operation_commit(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_operation_commit(uuid, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) Метач на ИЗТЕКЛИ товари. Изчиства САМО отговора; счетоводните и
--    анти-повторните данни остават. Права и квоти не се пипат.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sweep_expired_exact_responses(
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
  _anon_due integer := 0;
  _review_due integer := 0;
  _anon_cleared integer := 0;
  _review_cleared integer := 0;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  _limit := GREATEST(1, LEAST(COALESCE(p_limit, 500), 5000));

  SELECT count(*) INTO _anon_due FROM public.anon_delivery_operations
   WHERE response IS NOT NULL
     AND response_expires_at IS NOT NULL
     AND response_expires_at <= now();

  SELECT count(*) INTO _review_due FROM public.review_operations
   WHERE response IS NOT NULL
     AND response_expires_at IS NOT NULL
     AND response_expires_at <= now();

  IF COALESCE(p_dry_run, false) THEN
    RETURN jsonb_build_object(
      'dry_run', true,
      'anon_due', _anon_due,
      'review_due', _review_due,
      'anon_cleared', 0,
      'review_cleared', 0
    );
  END IF;

  WITH due AS (
    SELECT operation_id FROM public.anon_delivery_operations
     WHERE response IS NOT NULL
       AND response_expires_at IS NOT NULL
       AND response_expires_at <= now()
     ORDER BY response_expires_at
     LIMIT _limit
  ), cleared AS (
    UPDATE public.anon_delivery_operations o
       SET response = NULL, updated_at = now()
      FROM due
     WHERE o.operation_id = due.operation_id
    RETURNING o.operation_id
  )
  SELECT count(*) INTO _anon_cleared FROM cleared;

  WITH due AS (
    SELECT nonce FROM public.review_operations
     WHERE response IS NOT NULL
       AND response_expires_at IS NOT NULL
       AND response_expires_at <= now()
     ORDER BY response_expires_at
     LIMIT _limit
  ), cleared AS (
    UPDATE public.review_operations r
       SET response = NULL, updated_at = now()
      FROM due
     WHERE r.nonce = due.nonce
    RETURNING r.nonce
  )
  SELECT count(*) INTO _review_cleared FROM cleared;

  RETURN jsonb_build_object(
    'dry_run', false,
    'anon_due', _anon_due,
    'review_due', _review_due,
    'anon_cleared', _anon_cleared,
    'review_cleared', _review_cleared
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.sweep_expired_exact_responses(integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sweep_expired_exact_responses(integer, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.sweep_expired_exact_responses(integer, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_expired_exact_responses(integer, boolean) TO service_role;

-- Изтриване по искане на потребител: товарът се изчиства веднага, без да се
-- губи анти-повторната следа на ключа.
CREATE OR REPLACE FUNCTION public.erase_anon_delivery_payloads(
  p_identity_hash text
)
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
  IF p_identity_hash IS NULL OR p_identity_hash !~ '^[0-9a-f]{32,128}$' THEN
    RAISE EXCEPTION 'identity_hash_required' USING ERRCODE = '22023';
  END IF;

  WITH cleared AS (
    UPDATE public.anon_delivery_operations
       SET response = NULL,
           response_expires_at = LEAST(COALESCE(response_expires_at, now()), now()),
           updated_at = now()
     WHERE identity_hash = p_identity_hash
       AND response IS NOT NULL
    RETURNING operation_id
  )
  SELECT count(*) INTO _cleared FROM cleared;

  RETURN jsonb_build_object('ok', true, 'cleared', _cleared);
END;
$function$;

REVOKE ALL ON FUNCTION public.erase_anon_delivery_payloads(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erase_anon_delivery_payloads(text) FROM anon;
REVOKE ALL ON FUNCTION public.erase_anon_delivery_payloads(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.erase_anon_delivery_payloads(text) TO service_role;

CREATE OR REPLACE FUNCTION public.erase_review_operation_payloads(
  p_owner_id text
)
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
  IF p_owner_id IS NULL OR btrim(p_owner_id) = '' THEN
    RAISE EXCEPTION 'owner_id_required' USING ERRCODE = '22023';
  END IF;

  WITH cleared AS (
    UPDATE public.review_operations
       SET response = NULL,
           response_expires_at = LEAST(COALESCE(response_expires_at, now()), now()),
           updated_at = now()
     WHERE owner_id = p_owner_id
       AND response IS NOT NULL
    RETURNING nonce
  )
  SELECT count(*) INTO _cleared FROM cleared;

  RETURN jsonb_build_object('ok', true, 'cleared', _cleared);
END;
$function$;

REVOKE ALL ON FUNCTION public.erase_review_operation_payloads(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.erase_review_operation_payloads(text) FROM anon;
REVOKE ALL ON FUNCTION public.erase_review_operation_payloads(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.erase_review_operation_payloads(text) TO service_role;
