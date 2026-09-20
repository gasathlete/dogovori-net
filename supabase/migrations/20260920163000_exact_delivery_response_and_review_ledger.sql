-- Точен траен отговор при анонимна доставка и ТРАЕН ЛЕДЖЪР на ревизията
-- (0033 / 20260920163000).
--
-- Поправя два начина, по които нормален потребител опира до задънена улица:
--
-- 1) ПОТВЪРЖДАВАНЕ НА АНОНИМНА ДОСТАВКА. Досега окончателният отговор се
--    сглобяваше в кода СЛЕД записа, а в базата оставаше отговор с предварително
--    изчислено оставащо право. Повторението затова не беше точно. Сега
--    `anon_delivery_commit` сглобява ОКОНЧАТЕЛНИЯ отговор (с авторитетното
--    оставащо право) в същата транзакция, запазва точно него и го връща — и при
--    първото потвърждаване, и при всяко повторение. При състезание между два
--    едновременни записа вторият получава ТОЧНО първия траен отговор.
--
-- 2) ПРОПУСКЪТ ЗА РЕВИЗИЯ вече не е „изгарящ" nonce, а трайна операция със
--    състояния reserved/committed/cancelled, лизинг, ПЪЛНО обвързване на
--    пропуска и ТОЧНИЯ резултат от ревизията. Така отказ преди модела
--    (потвърждение за чувствителни данни, ограничител, липсващо заземяване,
--    грешка на gateway-а) НЕ изразходва единствения пропуск, а повторният опит
--    със същия пропуск или връща точния вече направен резултат, или прави
--    ревизията отново — без второ платено повикване към модел.
--
-- Всички обекти са САМО сървърни (service_role). RLS е включена и няма нито
-- една политика за anon/authenticated.
--
-- ТАЗИ МИГРАЦИЯ НЕ Е ПРИЛОЖЕНА към базата.

-- ---------------------------------------------------------------------------
-- 1) Точен траен отговор при потвърждаване на анонимна доставка.
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

  -- ОКОНЧАТЕЛНИЯТ отговор се сглобява ТУК, с авторитетното оставащо право, и
  -- се запазва в същата транзакция.
  _remaining := GREATEST(0, _row.cap - _delivered - 1);
  _final := p_response || jsonb_build_object('remaining', _remaining);

  UPDATE public.anon_delivery_operations
     SET state = 'committed',
         response = _final,
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
    'cap', _row.cap
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.anon_delivery_commit(uuid, text, text, jsonb, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.anon_delivery_commit(uuid, text, text, jsonb, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) ТРАЕН ЛЕДЖЪР НА РЕВИЗИЯТА (вместо „изгарящ" nonce).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.review_operations (
  nonce uuid PRIMARY KEY,
  aud text NOT NULL,
  subject text,
  owner_id text,
  content_digest text NOT NULL,
  operation text NOT NULL,
  grant_expires_at timestamptz NOT NULL,
  state text NOT NULL DEFAULT 'reserved',
  response jsonb,
  lease_expires_at timestamptz NOT NULL,
  committed_at timestamptz,
  cancelled_at timestamptz,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT review_operations_state_chk
    CHECK (state IN ('reserved', 'committed', 'cancelled')),
  CONSTRAINT review_operations_digest_hex_chk
    CHECK (content_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT review_operations_committed_response_chk
    CHECK (state <> 'committed' OR response IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS review_operations_state_idx
  ON public.review_operations (state, lease_expires_at);
CREATE INDEX IF NOT EXISTS review_operations_expiry_idx
  ON public.review_operations (grant_expires_at);

ALTER TABLE public.review_operations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON public.review_operations FROM PUBLIC;
REVOKE ALL ON public.review_operations FROM anon;
REVOKE ALL ON public.review_operations FROM authenticated;
GRANT ALL ON public.review_operations TO service_role;

-- РЕЗЕРВАЦИЯ непосредствено ПРЕДИ платеното повикване към модела.
--  - вече потвърдена операция → ТОЧНИЯТ вече направен резултат, без модел;
--  - активна резервация → in_progress (никакво второ повикване);
--  - доказано отменена/изтекъл лизинг → същият пропуск може да опита отново;
--  - несъответствие в обвързването → конфликт;
--  - изтекъл пропуск → expired.
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
    -- ПЪЛНО обвързване: всяко разминаване е конфликт, никога чужд резултат.
    IF _row.aud <> p_aud
       OR COALESCE(_row.subject, '') <> COALESCE(p_subject, '')
       OR COALESCE(_row.owner_id, '') <> COALESCE(p_owner_id, '')
       OR _row.content_digest <> p_content_digest
       OR _row.operation <> p_operation THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'binding_conflict');
    END IF;

    IF _row.state = 'committed' THEN
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

    -- Доказано отменена операция или изтекъл лизинг: същият пропуск опитва пак.
    IF p_expires_at <= now() THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'expired');
    END IF;

    UPDATE public.review_operations
       SET state = 'reserved',
           response = NULL,
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

-- ПОТВЪРЖДАВАНЕ: точният резултат от ревизията става траен. Повторното
-- потвърждаване връща ПЪРВИЯ траен резултат, без второ повикване към модел.
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
    RETURN jsonb_build_object(
      'ok', true, 'replay', true, 'state', 'committed', 'response', _row.response
    );
  END IF;
  IF _row.state <> 'reserved' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_reserved', 'state', _row.state);
  END IF;

  UPDATE public.review_operations
     SET state = 'committed',
         response = p_response,
         committed_at = now(),
         cancelled_at = NULL,
         updated_at = now()
   WHERE nonce = p_nonce;

  RETURN jsonb_build_object(
    'ok', true, 'replay', false, 'state', 'committed', 'response', p_response
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.review_operation_commit(uuid, text, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_operation_commit(uuid, text, jsonb) TO service_role;

-- ОТМЯНА при ДОКАЗАН неуспех (модел/gateway/парсване/запис): освобождава
-- резервацията, за да може СЪЩИЯТ пропуск да опита отново. Вече потвърден
-- резултат НИКОГА не се отменя.
CREATE OR REPLACE FUNCTION public.review_operation_cancel(
  p_nonce uuid,
  p_content_digest text,
  p_reason text DEFAULT NULL,
  p_reconciliation_required boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.review_operations%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_nonce IS NULL THEN
    RAISE EXCEPTION 'nonce_required' USING ERRCODE = '22023';
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
    RETURN jsonb_build_object('ok', false, 'reason', 'already_committed');
  END IF;
  IF _row.state = 'cancelled' THEN
    RETURN jsonb_build_object(
      'ok', _row.cancelled_at IS NOT NULL, 'replay', true, 'state', 'cancelled'
    );
  END IF;

  UPDATE public.review_operations
     SET state = 'cancelled',
         response = NULL,
         cancelled_at = now(),
         lease_expires_at = now(),
         updated_at = now(),
         detail = _row.detail
                  || jsonb_build_object(
                       'cancel_reason', COALESCE(p_reason, 'not_delivered'),
                       'reconciliation_required',
                         COALESCE(p_reconciliation_required, false)
                     )
   WHERE nonce = p_nonce;

  RETURN jsonb_build_object('ok', true, 'replay', false, 'state', 'cancelled');
END;
$function$;

REVOKE ALL ON FUNCTION public.review_operation_cancel(uuid, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.review_operation_cancel(uuid, text, text, boolean) TO service_role;
