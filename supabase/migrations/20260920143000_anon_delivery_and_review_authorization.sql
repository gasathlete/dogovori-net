-- Трайно право на анонимна доставка и оторизация на ревизията
-- (0032 / 20260920143000).
--
-- Какво добавя:
-- 1) public.anon_delivery_operations + RPC-та за РЕЗЕРВАЦИЯ, ПОТВЪРЖДАВАНЕ и
--    ОТМЯНА на една анонимна доставка. Броят доставки се пази трайно (а не в
--    брояч за натоварване), обвързан е с идентичност + задължителен UUID на
--    заявката + каноничен малки букви SHA-256 отпечатък, и пази ТОЧНИЯ отговор,
--    за да е повторението истинско повторение, а не ново повикване към модел.
--    НЕ се съхранява IP, нито текст на въпроса.
-- 2) public.review_grant_nonces + RPC за АТОМАРНА ЕДНОКРАТНА консумация на
--    пропуск за ревизия. Оторизацията вече не минава през общ ограничител за
--    натоварване.
--
-- Всички обекти са САМО сървърни (service_role). RLS е включена и няма нито
-- една политика за anon/authenticated.
--
-- ТАЗИ МИГРАЦИЯ НЕ Е ПРИЛОЖЕНА към базата.

-- ---------------------------------------------------------------------------
-- 1) Трайни операции за анонимна доставка.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.anon_delivery_operations (
  operation_id uuid PRIMARY KEY,
  identity_hash text NOT NULL,
  request_digest text NOT NULL,
  purpose text NOT NULL DEFAULT 'anon-assistant',
  state text NOT NULL DEFAULT 'reserved',
  response jsonb,
  window_start timestamptz NOT NULL DEFAULT now(),
  window_seconds integer NOT NULL,
  cap integer NOT NULL,
  lease_expires_at timestamptz NOT NULL,
  committed_at timestamptz,
  cancelled_at timestamptz,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT anon_delivery_state_chk
    CHECK (state IN ('reserved', 'committed', 'cancelled')),
  CONSTRAINT anon_delivery_identity_hex_chk
    CHECK (identity_hash ~ '^[0-9a-f]{32,128}$'),
  CONSTRAINT anon_delivery_digest_hex_chk
    CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT anon_delivery_cap_chk CHECK (cap > 0 AND cap <= 100),
  CONSTRAINT anon_delivery_window_chk
    CHECK (window_seconds >= 60 AND window_seconds <= 7776000),
  CONSTRAINT anon_delivery_committed_response_chk
    CHECK (state <> 'committed' OR response IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS anon_delivery_identity_state_idx
  ON public.anon_delivery_operations (identity_hash, state, committed_at);
CREATE INDEX IF NOT EXISTS anon_delivery_lease_idx
  ON public.anon_delivery_operations (identity_hash, state, lease_expires_at);

ALTER TABLE public.anon_delivery_operations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.anon_delivery_operations FROM PUBLIC;
REVOKE ALL ON public.anon_delivery_operations FROM anon;
REVOKE ALL ON public.anon_delivery_operations FROM authenticated;
GRANT ALL ON public.anon_delivery_operations TO service_role;

-- РЕЗЕРВАЦИЯ: не изразходва право, но атомарно заема едно от местата за
-- доставка. Пет едновременни резервации могат да съществуват, шестата се
-- отказва ПРЕДИ повикване към модела.
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
    -- Всяко несъответствие в обвързването е КОНФЛИКТ: нищо не се доставя и
    -- чужд отговор никога не се подава.
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

  -- Доставените отговори в прозореца + активните резервации заемат места.
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

-- ПОТВЪРЖДАВАНЕ: резервираното място става ДОСТАВЕНО и точният отговор се
-- запазва. Шеста доставка е невъзможна.
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

  IF _row.state = 'committed' THEN
    RETURN jsonb_build_object(
      'ok', true, 'replay', true, 'state', 'committed', 'response', _row.response
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

  UPDATE public.anon_delivery_operations
     SET state = 'committed',
         response = p_response,
         committed_at = now(),
         cancelled_at = NULL,
         updated_at = now()
   WHERE operation_id = p_operation_id;

  RETURN jsonb_build_object(
    'ok', true,
    'replay', false,
    'state', 'committed',
    'delivered', _delivered + 1,
    'remaining', GREATEST(0, _row.cap - _delivered - 1),
    'cap', _row.cap
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.anon_delivery_commit(uuid, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anon_delivery_commit(uuid, text, text, jsonb, text) TO service_role;

-- ОТМЯНА: освобождава заетото място, не изразходва право и запазва
-- обвързването. Недоказана отмяна е ИЗРАВНЯВАНЕ, никога успех.
CREATE OR REPLACE FUNCTION public.anon_delivery_cancel(
  p_operation_id uuid,
  p_identity_hash text,
  p_request_digest text,
  p_reason text DEFAULT NULL,
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
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL THEN
    RAISE EXCEPTION 'operation_id_required' USING ERRCODE = '22023';
  END IF;

  _purpose := COALESCE(NULLIF(btrim(p_purpose), ''), 'anon-assistant');
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
  IF _row.state = 'committed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_committed');
  END IF;
  IF _row.state = 'cancelled' THEN
    RETURN jsonb_build_object(
      'ok', _row.cancelled_at IS NOT NULL, 'replay', true, 'state', 'cancelled'
    );
  END IF;

  UPDATE public.anon_delivery_operations
     SET state = 'cancelled',
         response = NULL,
         cancelled_at = now(),
         lease_expires_at = now(),
         updated_at = now(),
         detail = _row.detail
                  || jsonb_build_object('cancel_reason', COALESCE(p_reason, 'undelivered'))
   WHERE operation_id = p_operation_id;

  RETURN jsonb_build_object('ok', true, 'replay', false, 'state', 'cancelled');
END;
$function$;

REVOKE ALL ON FUNCTION public.anon_delivery_cancel(uuid, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anon_delivery_cancel(uuid, text, text, text, text) TO service_role;

-- Четене на трайното състояние (оставащо право) без изразходване.
CREATE OR REPLACE FUNCTION public.anon_delivery_state(
  p_identity_hash text,
  p_purpose text DEFAULT 'anon-assistant',
  p_cap integer DEFAULT 5,
  p_window_seconds integer DEFAULT 2592000
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _purpose text;
  _cap integer;
  _window integer;
  _delivered integer;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_identity_hash IS NULL OR p_identity_hash !~ '^[0-9a-f]{32,128}$' THEN
    RAISE EXCEPTION 'identity_hash_required' USING ERRCODE = '22023';
  END IF;
  _purpose := COALESCE(NULLIF(btrim(p_purpose), ''), 'anon-assistant');
  _cap := GREATEST(1, LEAST(COALESCE(p_cap, 5), 100));
  _window := GREATEST(60, LEAST(COALESCE(p_window_seconds, 2592000), 7776000));

  SELECT count(*) INTO _delivered
    FROM public.anon_delivery_operations
   WHERE identity_hash = p_identity_hash
     AND purpose = _purpose
     AND state = 'committed'
     AND committed_at > now() - make_interval(secs => _window);

  RETURN jsonb_build_object(
    'ok', true,
    'delivered', _delivered,
    'remaining', GREATEST(0, _cap - _delivered),
    'cap', _cap
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.anon_delivery_state(text, text, integer, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anon_delivery_state(text, text, integer, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Трайна еднократност на пропуска за ревизия.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.review_grant_nonces (
  nonce uuid PRIMARY KEY,
  aud text NOT NULL,
  subject text,
  owner_id text,
  content_digest text NOT NULL,
  operation text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_grant_nonce_digest_hex_chk
    CHECK (content_digest ~ '^[0-9a-f]{64}$')
);

CREATE INDEX IF NOT EXISTS review_grant_nonces_expiry_idx
  ON public.review_grant_nonces (expires_at);

ALTER TABLE public.review_grant_nonces ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.review_grant_nonces FROM PUBLIC;
REVOKE ALL ON public.review_grant_nonces FROM anon;
REVOKE ALL ON public.review_grant_nonces FROM authenticated;
GRANT ALL ON public.review_grant_nonces TO service_role;

CREATE OR REPLACE FUNCTION public.review_grant_nonce_consume(
  p_nonce uuid,
  p_aud text,
  p_subject text,
  p_owner_id text,
  p_content_digest text,
  p_operation text,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _inserted integer;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_nonce IS NULL OR p_aud IS NULL OR p_operation IS NULL
     OR p_expires_at IS NULL THEN
    RAISE EXCEPTION 'nonce_payload_required' USING ERRCODE = '22023';
  END IF;
  IF p_content_digest IS NULL OR p_content_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'content_digest_required' USING ERRCODE = '22023';
  END IF;
  IF p_expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'expired');
  END IF;

  INSERT INTO public.review_grant_nonces (
    nonce, aud, subject, owner_id, content_digest, operation, expires_at
  ) VALUES (
    p_nonce, p_aud, p_subject, p_owner_id, p_content_digest, p_operation, p_expires_at
  )
  ON CONFLICT (nonce) DO NOTHING;

  GET DIAGNOSTICS _inserted = ROW_COUNT;
  IF _inserted = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'replayed');
  END IF;
  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.review_grant_nonce_consume(uuid, text, text, text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_grant_nonce_consume(uuid, text, text, text, text, text, timestamptz) TO service_role;
