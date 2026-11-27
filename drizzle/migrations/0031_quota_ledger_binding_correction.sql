-- Корекция на леджъра на операциите (0031 / 20260920123000).
--
-- КОРИГИРАЩА МИГРАЦИЯ към 0029 (леджър на операциите).
--
-- Какво поправя:
-- 1) request_digest беше проверяван само по ДЪЛЖИНА (64 знака). Сега е
--    задължителен малки букви шестнадесетичен SHA-256: ^[0-9a-f]{64}$.
-- 2) quota_reserve нямаше обвързване с batch_id и връщаше ok:false за вече
--    ДОКАЗАНО отменена операция, с което нормалният „Опитайте отново" на
--    клиента (същият UUID) оставаше без изход.
-- 3) storage_artifacts нямаше обвързване с операция, затова вече каченият
--    точен файл не можеше да бъде намерен и подаден повторно.
--
-- ТАЗИ МИГРАЦИЯ НЕ Е ПРИЛОЖЕНА към базата.

-- ---------------------------------------------------------------------------
-- 1) Строг шестнадесетичен отпечатък на заявката.
-- ---------------------------------------------------------------------------
ALTER TABLE public.quota_operations
  DROP CONSTRAINT IF EXISTS quota_operations_request_digest_check;
ALTER TABLE public.quota_operations
  DROP CONSTRAINT IF EXISTS quota_operations_request_digest_hex_chk;
ALTER TABLE public.quota_operations
  ADD CONSTRAINT quota_operations_request_digest_hex_chk
  CHECK (request_digest ~ '^[0-9a-f]{64}$');

-- ---------------------------------------------------------------------------
-- 2) Обвързване на временните файлове с операцията.
--    Така повторение по същия ключ намира ТОЧНО същия обект и не генерира
--    наново върху вече таксувана резервация.
-- ---------------------------------------------------------------------------
ALTER TABLE public.storage_artifacts
  ADD COLUMN IF NOT EXISTS operation_id uuid,
  ADD COLUMN IF NOT EXISTS purpose text,
  ADD COLUMN IF NOT EXISTS request_digest text,
  ADD COLUMN IF NOT EXISTS ready_at timestamptz;

ALTER TABLE public.storage_artifacts
  DROP CONSTRAINT IF EXISTS storage_artifacts_request_digest_hex_chk;
ALTER TABLE public.storage_artifacts
  ADD CONSTRAINT storage_artifacts_request_digest_hex_chk
  CHECK (request_digest IS NULL OR request_digest ~ '^[0-9a-f]{64}$');

-- Един артефакт на операция: вторият опит не създава втори ред.
CREATE UNIQUE INDEX IF NOT EXISTS storage_artifacts_operation_key
  ON public.storage_artifacts (operation_id)
  WHERE operation_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS storage_artifacts_ready_idx
  ON public.storage_artifacts (operation_id, ready_at)
  WHERE deleted_at IS NULL;

-- Мутациите са само сървърни.
REVOKE INSERT, UPDATE, DELETE ON public.storage_artifacts FROM authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.storage_artifacts FROM anon;
REVOKE SELECT ON public.storage_artifacts FROM authenticated;
REVOKE SELECT ON public.storage_artifacts FROM anon;
GRANT ALL ON public.storage_artifacts TO service_role;

-- ---------------------------------------------------------------------------
-- 3) quota_reserve с ПЪЛНО обвързване (вкл. batch_id) и точно едно
--    пре-резервиране на ДОКАЗАНО отменена операция със същото обвързване.
--
--    Старият подпис се премахва изрично, за да няма двусмислено претоварване.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.quota_reserve(uuid, uuid, text, text, uuid, text, text, integer);

CREATE OR REPLACE FUNCTION public.quota_reserve(
  p_operation_id uuid,
  p_user_id uuid,
  p_kind text,
  p_purpose text,
  p_session_id uuid DEFAULT NULL,
  p_doc_key text DEFAULT NULL,
  p_batch_id uuid DEFAULT NULL,
  p_request_digest text DEFAULT NULL,
  p_lease_seconds integer DEFAULT 900
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _existing public.quota_operations%ROWTYPE;
  _reuse public.quota_session_charges%ROWTYPE;
  _result jsonb;
  _charged boolean := false;
  _source text := 'session_reuse';
  _used_bonus boolean := false;
  _purpose text;
  _doc_key text;
  _lease integer;
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
  _lease := GREATEST(60, LEAST(COALESCE(p_lease_seconds, 900), 3600));

  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));
  IF _doc_key IS NOT NULL AND p_session_id IS NOT NULL THEN
    PERFORM pg_advisory_xact_lock(hashtextextended(
      p_user_id::text || '|' || p_session_id::text || '|' || _doc_key || '|' || p_kind, 0));
  END IF;

  SELECT * INTO _existing FROM public.quota_operations
   WHERE operation_id = p_operation_id FOR UPDATE;
  IF FOUND THEN
    -- ПЪЛНО ОБВЪРЗВАНЕ, вече включително batch_id. Всяко несъответствие е
    -- конфликт — без таксуване и без подаване на чужд резултат.
    IF _existing.user_id <> p_user_id
       OR _existing.kind <> p_kind
       OR _existing.purpose <> _purpose
       OR _existing.session_id IS DISTINCT FROM p_session_id
       OR _existing.doc_key IS DISTINCT FROM _doc_key
       OR _existing.batch_id IS DISTINCT FROM p_batch_id
       OR _existing.request_digest IS DISTINCT FROM p_request_digest THEN
      RAISE EXCEPTION 'idempotency_key_conflict' USING ERRCODE = '23505';
    END IF;

    IF _existing.state <> 'cancelled' THEN
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
    -- е доказана. Неизравнена отмяна НИКОГА не се таксува втори път.
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

  IF _doc_key IS NOT NULL AND p_session_id IS NOT NULL THEN
    SELECT * INTO _reuse FROM public.quota_session_charges
     WHERE user_id = p_user_id
       AND session_id = p_session_id
       AND doc_key = _doc_key
       AND kind = p_kind
       AND created_at > now() - interval '24 hours'
     ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF _reuse.user_id IS NOT NULL THEN
    _charged := false;
    _source := 'session_reuse';
  ELSE
    _result := public.consume_quota_for(p_user_id, p_kind);
    IF NOT COALESCE((_result->>'ok')::boolean, false) THEN
      RETURN _result || jsonb_build_object('charged', false, 'replay', false);
    END IF;
    _charged := true;
    _source := COALESCE(_result->>'source', 'unknown');
    _used_bonus := COALESCE((_result->>'used_bonus')::boolean, false);
    IF _doc_key IS NOT NULL AND p_session_id IS NOT NULL THEN
      INSERT INTO public.quota_session_charges (user_id, session_id, doc_key, kind)
        VALUES (p_user_id, p_session_id, _doc_key, p_kind)
        ON CONFLICT (user_id, session_id, doc_key, kind) DO NOTHING;
    END IF;
  END IF;

  IF _retry THEN
    -- Пълно и последователно пренаписване на състоянието от НОВОТО атомарно
    -- решение за квота. Нищо от отменения опит не остава.
    UPDATE public.quota_operations
       SET state = 'reserved',
           charged = _charged,
           source = _source,
           used_bonus = _used_bonus,
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
      p_operation_id, p_user_id, p_kind, _purpose,
      'reserved', _charged, _source, _used_bonus, p_session_id, _doc_key,
      p_batch_id, p_request_digest, now() + make_interval(secs => _lease)
    );
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'replay', false, 'state', 'reserved',
    'charged', _charged, 'source', _source, 'used_bonus', _used_bonus,
    'result_ref', NULL,
    'retry', _retry,
    'operation_id', p_operation_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.quota_reserve(uuid, uuid, text, text, uuid, text, uuid, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quota_reserve(uuid, uuid, text, text, uuid, text, uuid, text, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Обвързване на готов артефакт с операция (само сървърно).
--    Идемпотентно: същата операция + същият път е повторение, не втори ред.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.storage_artifact_bind(
  p_operation_id uuid,
  p_user_id uuid,
  p_bucket text,
  p_storage_path text,
  p_purpose text,
  p_request_digest text,
  p_expires_at timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.storage_artifacts%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL OR p_user_id IS NULL
     OR p_bucket IS NULL OR p_storage_path IS NULL THEN
    RAISE EXCEPTION 'artifact_binding_incomplete' USING ERRCODE = '22023';
  END IF;
  IF p_request_digest IS NULL OR p_request_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'request_digest_required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  SELECT * INTO _row FROM public.storage_artifacts
   WHERE operation_id = p_operation_id FOR UPDATE;

  IF FOUND THEN
    -- Вече обвързан артефакт НИКОГА не се пренасочва към друг обект: точно
    -- същото обвързване е повторение, различен bucket/път е конфликт.
    IF _row.user_id IS DISTINCT FROM p_user_id
       OR _row.purpose IS DISTINCT FROM p_purpose
       OR _row.request_digest IS DISTINCT FROM p_request_digest
       OR _row.bucket IS DISTINCT FROM p_bucket
       OR _row.storage_path IS DISTINCT FROM p_storage_path THEN
      RAISE EXCEPTION 'artifact_binding_conflict' USING ERRCODE = '23505';
    END IF;
    UPDATE public.storage_artifacts
       SET ready_at = COALESCE(ready_at, now()),
           expires_at = GREATEST(expires_at, p_expires_at)
     WHERE id = _row.id;
    RETURN jsonb_build_object('ok', true, 'replay', true, 'bucket', p_bucket, 'path', p_storage_path);
  END IF;

  INSERT INTO public.storage_artifacts (
    user_id, bucket, storage_path, scope, expires_at,
    operation_id, purpose, request_digest, ready_at
  ) VALUES (
    p_user_id, p_bucket, p_storage_path, 'request', p_expires_at,
    p_operation_id, p_purpose, p_request_digest, now()
  );

  RETURN jsonb_build_object('ok', true, 'replay', false, 'bucket', p_bucket, 'path', p_storage_path);
END;
$function$;

REVOKE ALL ON FUNCTION public.storage_artifact_bind(uuid, uuid, text, text, text, text, timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_artifact_bind(uuid, uuid, text, text, text, text, timestamptz) TO service_role;

CREATE OR REPLACE FUNCTION public.storage_artifact_lookup(p_operation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.storage_artifacts%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _row FROM public.storage_artifacts
   WHERE operation_id = p_operation_id AND deleted_at IS NULL;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  RETURN jsonb_build_object(
    'found', true,
    'user_id', _row.user_id,
    'bucket', _row.bucket,
    'path', _row.storage_path,
    'purpose', _row.purpose,
    'request_digest', _row.request_digest,
    'ready', _row.ready_at IS NOT NULL
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.storage_artifact_lookup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.storage_artifact_lookup(uuid) TO service_role;
