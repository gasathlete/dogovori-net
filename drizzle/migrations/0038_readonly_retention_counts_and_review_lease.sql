-- =============================================================================
-- 0038 — истински dry-run за retention + точно-еднократна резервация на
-- ревизия и при изтекъл лизинг.
--
-- 0033, 0036 и 0037 НЕ се редактират. Тук:
--   1) public.retention_due_counts()          — НОВА, STABLE, само-четяща.
--   2) public.review_operation_reserve(...)   — преопределена: изтекъл лизинг
--      НЕ дава втора резервация; потвърдено повторение проверява товара.
--   3) public.owned_review_operation_reserve(...) — същото за собственика.
--
-- Всички: SECURITY DEFINER, schema-qualified, SET search_path,
-- REVOKE от PUBLIC/anon/authenticated, GRANT само на service_role.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) САМО-ЧЕТЯЩИ дължими бройки за retention. НЕ пише, НЕ маркира, НЕ отменя.
--    Позволява `?count_only=1` да е истински dry-run.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retention_due_counts()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'anon_due', (
      SELECT count(*) FROM public.anon_delivery_operations
       WHERE response IS NOT NULL
         AND response_expires_at IS NOT NULL
         AND response_expires_at <= now()
    ),
    'review_due', (
      SELECT count(*) FROM public.review_operations
       WHERE response IS NOT NULL
         AND response_expires_at IS NOT NULL
         AND response_expires_at <= now()
    ),
    'quota_results_due', (
      SELECT count(*) FROM public.quota_operations
       WHERE result_ref IS NOT NULL
         AND result_ref_expires_at IS NOT NULL
         AND result_ref_expires_at <= now()
    ),
    'wave_results_due', (
      SELECT count(*) FROM public.quota_wave_operations
       WHERE result IS NOT NULL
         AND result_expires_at IS NOT NULL
         AND result_expires_at <= now()
    ),
    'wave_stale_due', (
      SELECT count(*) FROM public.quota_wave_operations
       WHERE state = 'reserved'
         AND lease_expires_at IS NOT NULL
         AND lease_expires_at <= now()
         AND COALESCE(detail->>'reconciliation_flagged', '') <> 'true'
    ),
    'operations_stale_due', (
      SELECT count(*) FROM public.quota_operations
       WHERE state = 'reserved'
         AND lease_expires_at IS NOT NULL
         AND lease_expires_at <= now()
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.retention_due_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retention_due_counts() FROM anon;
REVOKE ALL ON FUNCTION public.retention_due_counts() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.retention_due_counts() TO service_role;

-- ---------------------------------------------------------------------------
-- 2) РЕЗЕРВАЦИЯ по подписан пропуск — същият подпис и права като в 0033.
--    Изтекъл лизинг вече НЕ отваря втора резервация: това е изравняване.
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
    -- ПЪЛНО обвързване: всяко разминаване е конфликт, никога чужд резултат.
    IF _row.aud <> p_aud
       OR COALESCE(_row.subject, '') <> COALESCE(p_subject, '')
       OR COALESCE(_row.owner_id, '') <> COALESCE(p_owner_id, '')
       OR _row.content_digest <> p_content_digest
       OR _row.operation <> p_operation THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'binding_conflict');
    END IF;

    IF _row.state = 'committed' THEN
      -- Потвърденото повторение е валидно САМО докато точният товар е налице.
      IF _row.response IS NULL
         OR (_row.response_expires_at IS NOT NULL AND _row.response_expires_at <= now()) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'response_expired',
                                   'state', 'committed', 'new_request_required', true);
      END IF;
      RETURN jsonb_build_object(
        'ok', true, 'replay', true, 'state', 'committed', 'response', _row.response
      );
    END IF;

    IF _row.state = 'reserved' THEN
      IF _row.lease_expires_at IS NOT NULL AND _row.lease_expires_at > now() THEN
        RETURN jsonb_build_object(
          'ok', false,
          'reason', 'in_progress',
          'state', 'reserved',
          'retry_after_seconds',
            GREATEST(1, CEIL(EXTRACT(EPOCH FROM (_row.lease_expires_at - now()))))::int
        );
      END IF;
      -- ИЗТЕКЪЛ/ЛИПСВАЩ ЛИЗИНГ: не е доказано дали моделът вече е изпълнен.
      -- Редът, лизингът и товарът остават непокътнати; втори модел няма.
      RETURN jsonb_build_object('ok', false, 'reason', 'lease_expired',
                                 'state', 'reserved', 'reconciliation', true);
    END IF;

    IF _row.state = 'cancelled'
       AND COALESCE((_row.detail->>'reconciliation_required')::boolean, false) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'reconciliation_required');
    END IF;

    IF _row.state = 'cancelled' AND _row.cancelled_at IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'cancellation_unproven');
    END IF;

    -- Доказано отменена операция: същият пропуск може да опита отново.
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
REVOKE ALL ON FUNCTION public.review_operation_reserve(uuid, text, text, text, text, text, timestamptz, integer) FROM anon;
REVOKE ALL ON FUNCTION public.review_operation_reserve(uuid, text, text, text, text, text, timestamptz, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.review_operation_reserve(uuid, text, text, text, text, text, timestamptz, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 3) РЕЗЕРВАЦИЯ за доказан собственик — същият подпис и права като в 0036.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owned_review_operation_reserve(
  p_operation_id uuid,
  p_owner_id uuid,
  p_document_id uuid,
  p_document_version text,
  p_document_hash text,
  p_content_digest text,
  p_purpose text,
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
  _grant_expires timestamptz;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL OR p_owner_id IS NULL OR p_document_id IS NULL
     OR p_purpose IS NULL THEN
    RAISE EXCEPTION 'owned_binding_required' USING ERRCODE = '22023';
  END IF;
  IF p_content_digest IS NULL OR p_content_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'content_digest_required' USING ERRCODE = '22023';
  END IF;

  _lease := GREATEST(30, LEAST(COALESCE(p_lease_seconds, 180), 900));
  _grant_expires := now() + make_interval(secs => public.owned_review_grant_ttl_seconds());

  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  SELECT * INTO _row FROM public.review_operations
   WHERE nonce = p_operation_id FOR UPDATE;

  IF FOUND THEN
    IF _row.aud <> 'owned-review'
       OR _row.owned_owner_id IS DISTINCT FROM p_owner_id
       OR _row.owned_document_id IS DISTINCT FROM p_document_id
       OR COALESCE(_row.owned_document_version, '') <> COALESCE(p_document_version, '')
       OR COALESCE(_row.owned_document_hash, '') <> COALESCE(p_document_hash, '')
       OR _row.content_digest <> p_content_digest
       OR _row.operation <> p_purpose THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'binding_conflict', 'status', 'conflict');
    END IF;

    IF _row.state = 'committed' THEN
      IF _row.response IS NULL
         OR (_row.response_expires_at IS NOT NULL AND _row.response_expires_at <= now()) THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'response_expired', 'state', 'committed',
                                   'new_request_required', true);
      END IF;
      RETURN jsonb_build_object(
        'ok', true, 'replay', true, 'state', 'committed', 'response', _row.response
      );
    END IF;

    IF _row.state = 'reserved' THEN
      IF _row.lease_expires_at IS NOT NULL AND _row.lease_expires_at > now() THEN
        RETURN jsonb_build_object(
          'ok', false,
          'reason', 'in_progress',
          'state', 'reserved',
          'retry_after_seconds',
            GREATEST(1, CEIL(EXTRACT(EPOCH FROM (_row.lease_expires_at - now()))))::int
        );
      END IF;
      -- ИЗТЕКЪЛ/ЛИПСВАЩ ЛИЗИНГ: изравняване без нова резервация и без модел.
      RETURN jsonb_build_object('ok', false, 'reason', 'lease_expired',
                                 'state', 'reserved', 'reconciliation', true);
    END IF;

    IF _row.state = 'cancelled'
       AND COALESCE((_row.detail->>'reconciliation_required')::boolean, false) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'reconciliation_required');
    END IF;
    IF _row.state = 'cancelled' AND _row.cancelled_at IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'cancellation_unproven');
    END IF;

    UPDATE public.review_operations
       SET state = 'reserved',
           response = NULL,
           response_expires_at = NULL,
           grant_expires_at = _grant_expires,
           lease_expires_at = now() + make_interval(secs => _lease),
           cancelled_at = NULL,
           committed_at = NULL,
           updated_at = now(),
           detail = (_row.detail - 'cancel_reason')
                    || jsonb_build_object('retried_at', to_jsonb(now()))
     WHERE nonce = p_operation_id;

    RETURN jsonb_build_object('ok', true, 'replay', false, 'state', 'reserved', 'retry', true);
  END IF;

  INSERT INTO public.review_operations (
    nonce, aud, subject, owner_id, content_digest, operation,
    grant_expires_at, state, lease_expires_at,
    owned_owner_id, owned_document_id, owned_document_version, owned_document_hash
  ) VALUES (
    p_operation_id, 'owned-review', NULL, p_owner_id::text, p_content_digest, p_purpose,
    _grant_expires, 'reserved', now() + make_interval(secs => _lease),
    p_owner_id, p_document_id, p_document_version, p_document_hash
  );

  RETURN jsonb_build_object('ok', true, 'replay', false, 'state', 'reserved', 'retry', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.owned_review_operation_reserve(uuid, uuid, uuid, text, text, text, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owned_review_operation_reserve(uuid, uuid, uuid, text, text, text, text, integer) FROM anon;
REVOKE ALL ON FUNCTION public.owned_review_operation_reserve(uuid, uuid, uuid, text, text, text, text, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.owned_review_operation_reserve(uuid, uuid, uuid, text, text, text, text, integer) TO service_role;
