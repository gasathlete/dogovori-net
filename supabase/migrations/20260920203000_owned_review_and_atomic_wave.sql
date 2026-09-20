-- Собствени операции по ревизия и атомарна вълна поправки
-- (0036 / 20260920203000).
--
-- КОНТЕКСТ (прочетени 0032–0035, повторно ползвани форми и речник):
--   * public.review_operations — трайният леджър на ревизията (0033),
--     допълнен с граница на задържане на отговора (0034/0035).
--   * public.quota_operations / public.quota_reserve / public.quota_commit —
--     леджърът и договорките за 24-часова граница на съдържателен товар (0029,
--     0031, 0035, public.exact_response_retention_seconds()).
--   * public.charge_corrections_wave / public.cancel_corrections_wave (0029) —
--     разрезът на източниците (план → topup) за вълните поправки. Тук се
--     ПОВТАРЯ същият разрез, но в ЕДНА транзакция за ЦЯЛАТА вълна, вместо по
--     една операция на единица.
--
-- Част А поправя: пътят за собственик-държан преглед (owned review) нямаше
-- траен запис на операцията — при загубена връзка нямаше как да се докаже
-- дали моделът вече е бил повикан.
--
-- Част Б поправя: N отделни потвърждавания за вълна поправки допускаха
-- частично потвърдена вълна (напр. 3 от 5 таксувани, после срив).
--
-- Всички нови обекти са САМО сървърни (service_role). RLS е включена и няма
-- нито една политика за anon/authenticated.
--
-- ТАЗИ МИГРАЦИЯ НЕ Е ПРИЛОЖЕНА към базата.

-- =============================================================================
-- ЧАСТ А: СОБСТВЕНИ ОПЕРАЦИИ ПО РЕВИЗИЯ (owned review operations)
-- =============================================================================
--
-- Дизайн: разширяваме СЪЩИЯ леджър public.review_operations (не нова таблица),
-- защото семантиката е идентична (reserved/committed/cancelled, лизинг, точен
-- траен отговор с 24-часова граница). Собственият (owned) път борави с
-- документ, версия и хеш вместо подписан nonce-грант; затова добавяме
-- нови NULLABLE колони, а СЪЩЕСТВУВАЩИТЕ никога не се трият/преименуват.
--
-- ВАЖНО за споделянето на operation_id (= колоната `nonce`, същият PRIMARY
-- KEY, преизползван като идемпотентен ключ и от двата пътя): собственият
-- път пише `aud = 'owned-review'` — стойност, която НЕ се използва от
-- HMAC/nonce-грант пътя (той пише истинската аудитория на гранта). Затова
-- ако едно и също operation_id вече е резервирано от грант-пътя, `aud` няма
-- да съвпадне и собствената резервация коректно получава `conflict`, без да
-- презаписва или чете чуждия ред. Обратното важи също: грант-пътят вижда
-- различен `aud` и получава собствения си `binding_conflict`. Редът остава
-- ползваем от ДВАТА пътя единствено в смисъл, че и двата могат безопасно да
-- се опитат по същия ключ — точно един от тях ще спечели реда, другият ще
-- получи детерминиран конфликт, никога чужд резултат.
ALTER TABLE public.review_operations
  ADD COLUMN IF NOT EXISTS owned_owner_id uuid,
  ADD COLUMN IF NOT EXISTS owned_document_id uuid,
  ADD COLUMN IF NOT EXISTS owned_document_version text,
  ADD COLUMN IF NOT EXISTS owned_document_hash text;

CREATE INDEX IF NOT EXISTS review_operations_owned_owner_idx
  ON public.review_operations (owned_owner_id, owned_document_id)
  WHERE owned_owner_id IS NOT NULL;

-- Фиксиран TTL на собствения грант: 600 секунди, СЪЩИЯТ, който вече се
-- използва другаде за review-grant. Не се параметризира тук нарочно, за да
-- не може извикващ код случайно да го промени по различен път.
CREATE OR REPLACE FUNCTION public.owned_review_grant_ttl_seconds()
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $function$ SELECT 600 $function$;

REVOKE ALL ON FUNCTION public.owned_review_grant_ttl_seconds() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owned_review_grant_ttl_seconds() FROM anon;
REVOKE ALL ON FUNCTION public.owned_review_grant_ttl_seconds() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.owned_review_grant_ttl_seconds() TO service_role;

-- ---------------------------------------------------------------------------
-- A1) САМО-ЧЕТЯЩО търсене (STABLE, БЕЗ никакъв запис) по ПЪЛНОТО собствено
--     обвързване: operation_id, owner_id, document_id, document_version,
--     document_hash, content_digest, purpose (записан в колоната `operation`,
--     СЪЩАТА, която грант-пътят използва за вида на действието).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owned_review_operation_lookup(
  p_operation_id uuid,
  p_owner_id uuid,
  p_document_id uuid,
  p_document_version text,
  p_document_hash text,
  p_content_digest text,
  p_purpose text
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
  IF p_operation_id IS NULL OR p_owner_id IS NULL OR p_document_id IS NULL
     OR p_purpose IS NULL THEN
    RAISE EXCEPTION 'owned_binding_required' USING ERRCODE = '22023';
  END IF;
  IF p_content_digest IS NULL OR p_content_digest !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'content_digest_required' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _row FROM public.review_operations WHERE nonce = p_operation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'absent');
  END IF;

  IF _row.aud <> 'owned-review'
     OR _row.owned_owner_id IS DISTINCT FROM p_owner_id
     OR _row.owned_document_id IS DISTINCT FROM p_document_id
     OR COALESCE(_row.owned_document_version, '') <> COALESCE(p_document_version, '')
     OR COALESCE(_row.owned_document_hash, '') <> COALESCE(p_document_hash, '')
     OR _row.content_digest <> p_content_digest
     OR _row.operation <> p_purpose THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'binding_conflict');
  END IF;

  IF _row.state = 'committed' THEN
    IF _row.response IS NULL
       OR (_row.response_expires_at IS NOT NULL AND _row.response_expires_at <= now()) THEN
      RETURN jsonb_build_object('status', 'response_expired', 'reason', 'new_request_required');
    END IF;
    RETURN jsonb_build_object('status', 'committed', 'response', _row.response);
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

  RETURN jsonb_build_object('status', 'absent', 'reason', 'cancelled');
END;
$function$;

REVOKE ALL ON FUNCTION public.owned_review_operation_lookup(uuid, uuid, uuid, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owned_review_operation_lookup(uuid, uuid, uuid, text, text, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.owned_review_operation_lookup(uuid, uuid, uuid, text, text, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.owned_review_operation_lookup(uuid, uuid, uuid, text, text, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- A2) ИДЕМПОТЕНТНА резервация с ключалка по ред (operation_id), СЪЩОТО пълно
--     обвързване. Лизингът е 30–900 сек. (СЪЩИТЕ граници като
--     review_operation_reserve); грантът е фиксиран на 600 сек.
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

-- ---------------------------------------------------------------------------
-- A3) commit/cancel: същата 24-часова граница на съдържателен товар като
--     `quota_commit` (0035, public.exact_response_retention_seconds()).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.owned_review_operation_commit(
  p_operation_id uuid,
  p_owner_id uuid,
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
  IF p_operation_id IS NULL OR p_owner_id IS NULL OR p_response IS NULL THEN
    RAISE EXCEPTION 'commit_payload_required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  SELECT * INTO _row FROM public.review_operations
   WHERE nonce = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_operation');
  END IF;
  IF _row.aud <> 'owned-review' OR _row.owned_owner_id IS DISTINCT FROM p_owner_id THEN
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
   WHERE nonce = p_operation_id;

  RETURN jsonb_build_object(
    'ok', true, 'replay', false, 'state', 'committed', 'response', p_response,
    'response_expires_at', to_jsonb(_expires)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.owned_review_operation_commit(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owned_review_operation_commit(uuid, uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.owned_review_operation_commit(uuid, uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.owned_review_operation_commit(uuid, uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.owned_review_operation_cancel(
  p_operation_id uuid,
  p_owner_id uuid,
  p_reason text DEFAULT NULL
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
  IF p_operation_id IS NULL OR p_owner_id IS NULL THEN
    RAISE EXCEPTION 'operation_id_and_owner_required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  SELECT * INTO _row FROM public.review_operations
   WHERE nonce = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_operation');
  END IF;
  IF _row.aud <> 'owned-review' OR _row.owned_owner_id IS DISTINCT FROM p_owner_id THEN
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
                  || jsonb_build_object('cancel_reason', COALESCE(p_reason, 'not_delivered'))
   WHERE nonce = p_operation_id;

  RETURN jsonb_build_object('ok', true, 'replay', false, 'state', 'cancelled');
END;
$function$;

REVOKE ALL ON FUNCTION public.owned_review_operation_cancel(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owned_review_operation_cancel(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.owned_review_operation_cancel(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.owned_review_operation_cancel(uuid, uuid, text) TO service_role;

-- =============================================================================
-- ЧАСТ Б: АТОМАРНА ВЪЛНА ПОПРАВКИ (единна операция за N единици)
-- =============================================================================
--
-- ЗАЩО НОВА ТАБЛИЦА, А НЕ public.quota_operations: quota_operations е
-- строена за ЕДНА единица квота на операция (kind IN
-- ('contract','template','analysis'), едно потребление на consume_quota_for).
-- Вълна поправки потребява N единици от ДВА кошера (план + topup) в ЕДНА
-- транзакция — различна форма на данните (allocation по източник, ops_count).
-- Затова е отделна таблица, огледална по стил (reserved/committed/cancelled,
-- лизинг, ПЪЛНО обвързване, точен траен резултат с 24-часова граница).
--
-- ИЗТОЧНИЦИ: същият разрез като charge_corrections_wave (0029) — първо
-- месечният план (plan/pro тавана), после topup баланса. За разлика от
-- charge_corrections_wave, тук НЕ се дели на 5 — p_ops_count Е точният брой
-- единици за консумиране (изчислен от извикващия код).
CREATE TABLE IF NOT EXISTS public.quota_wave_operations (
  operation_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL,
  purpose text NOT NULL,
  session_id text,
  doc_key text,
  batch_id uuid,
  request_digest text NOT NULL,
  ops_count integer NOT NULL,
  state text NOT NULL DEFAULT 'reserved',
  was_pro boolean,
  allocation jsonb NOT NULL DEFAULT '[]'::jsonb,
  result jsonb,
  result_expires_at timestamptz,
  lease_expires_at timestamptz,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  cancelled_at timestamptz,
  CONSTRAINT quota_wave_operations_state_chk
    CHECK (state IN ('reserved', 'committed', 'cancelled')),
  CONSTRAINT quota_wave_operations_digest_hex_chk
    CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  CONSTRAINT quota_wave_operations_ops_count_chk
    CHECK (ops_count > 0),
  CONSTRAINT quota_wave_operations_committed_result_chk
    CHECK (state <> 'committed' OR result IS NOT NULL OR result_expires_at IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS quota_wave_operations_state_idx
  ON public.quota_wave_operations (state, lease_expires_at);
CREATE INDEX IF NOT EXISTS quota_wave_operations_user_batch_idx
  ON public.quota_wave_operations (user_id, batch_id);

ALTER TABLE public.quota_wave_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.quota_wave_operations FROM PUBLIC;
REVOKE ALL ON public.quota_wave_operations FROM anon;
REVOKE ALL ON public.quota_wave_operations FROM authenticated;
GRANT ALL ON public.quota_wave_operations TO service_role;

-- ---------------------------------------------------------------------------
-- Б1) РЕЗЕРВАЦИЯ на ЦЯЛАТА вълна в ЕДНА транзакция, всичко-или-нищо.
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

  -- Детерминирана ключалка по операцията, ПРЕДИ да се докосне какъвто и да е
  -- ред от download_quota — избягва „мъртва хватка" при паралелни вълни.
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
      RETURN jsonb_build_object(
        'status', 'replay', 'state', 'committed',
        'allocation', _row.allocation, 'response', _row.result
      );
    END IF;

    IF _row.state = 'reserved' AND _row.lease_expires_at > now() THEN
      RETURN jsonb_build_object(
        'status', 'in_progress',
        'retry_after_seconds',
          GREATEST(1, CEIL(EXTRACT(EPOCH FROM (_row.lease_expires_at - now()))))::int
      );
    END IF;

    IF _row.state = 'cancelled' AND _row.cancelled_at IS NULL THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'cancellation_unproven');
    END IF;
    -- Доказано отменена вълна или изтекъл лизинг: същият ключ опитва отново
    -- надолу, през нормалната резервационна пътека (без ранно връщане тук).
  END IF;

  -- Заключваме РЕДА-ИЗТОЧНИК на квотата (единственият източник в тази схема)
  -- в ДЕТЕРМИНИРАН, стабилен ред (по user_id) — единствения ред за
  -- потребителя, затова „ORDER BY" е тривиален, но заключването е изрично.
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

  -- ВСИЧКО-ИЛИ-НИЩО: недостатъчен topup означава НУЛЕВА консумация, никакво
  -- частично изразходване на плана.
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
           detail = (_row.detail - 'cancel_reason')
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
  RETURN jsonb_build_object('status', 'unavailable', 'reason', SQLERRM);
END;
$function$;

REVOKE ALL ON FUNCTION public.quota_wave_reserve(uuid, uuid, text, text, text, text, uuid, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quota_wave_reserve(uuid, uuid, text, text, text, text, uuid, text, integer, integer) FROM anon;
REVOKE ALL ON FUNCTION public.quota_wave_reserve(uuid, uuid, text, text, text, text, uuid, text, integer, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.quota_wave_reserve(uuid, uuid, text, text, text, text, uuid, text, integer, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- Б2) ПОТВЪРЖДАВАНЕ: точният резултат за ЦЯЛАТА вълна, 24-часова граница.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quota_wave_commit(
  p_operation_id uuid,
  p_user_id uuid,
  p_result jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.quota_wave_operations%ROWTYPE;
  _expires timestamptz;
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
    RETURN jsonb_build_object('status', 'unavailable', 'reason', 'unknown_operation');
  END IF;
  IF _row.user_id <> p_user_id THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'binding_conflict');
  END IF;

  IF _row.state = 'committed' THEN
    IF _row.result IS NULL
       OR (_row.result_expires_at IS NOT NULL AND _row.result_expires_at <= now()) THEN
      RETURN jsonb_build_object('status', 'expired', 'reason', 'new_request_required');
    END IF;
    RETURN jsonb_build_object('status', 'committed', 'replay', true, 'result', _row.result);
  END IF;
  IF _row.state <> 'reserved' THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'not_reserved', 'state', _row.state);
  END IF;

  _expires := now() + make_interval(secs => public.exact_response_retention_seconds());

  UPDATE public.quota_wave_operations
     SET state = 'committed',
         result = p_result,
         result_expires_at = _expires,
         committed_at = now(),
         cancelled_at = NULL,
         updated_at = now()
   WHERE operation_id = p_operation_id;

  RETURN jsonb_build_object(
    'status', 'committed', 'replay', false, 'result', p_result,
    'result_expires_at', to_jsonb(_expires)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.quota_wave_commit(uuid, uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quota_wave_commit(uuid, uuid, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.quota_wave_commit(uuid, uuid, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.quota_wave_commit(uuid, uuid, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- Б3) ОТМЯНА: възстановява ТОЧНО записаното разпределение, всичко-или-нищо.
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
  _item jsonb;
  _from_plan integer := 0;
  _from_topup integer := 0;
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
    RETURN jsonb_build_object('status', 'cancelled', 'replay', true);
  END IF;

  -- Точно записаното разпределение — нито повече, нито по-малко.
  FOR _item IN SELECT * FROM jsonb_array_elements(COALESCE(_row.allocation, '[]'::jsonb))
  LOOP
    IF _item->>'source' = 'plan' THEN
      _from_plan := _from_plan + COALESCE((_item->>'amount')::integer, 0);
    ELSIF _item->>'source' = 'topup' THEN
      _from_topup := _from_topup + COALESCE((_item->>'amount')::integer, 0);
    END IF;
  END LOOP;

  PERFORM 1 FROM public.download_quota WHERE user_id = p_user_id FOR UPDATE;

  IF COALESCE(_row.was_pro, false) THEN
    UPDATE public.download_quota
       SET pro_monthly_used = GREATEST(0, COALESCE(pro_monthly_used, 0) - _from_plan),
           topup_ops_balance = COALESCE(topup_ops_balance, 0) + _from_topup,
           updated_at = now()
     WHERE user_id = p_user_id;
  ELSE
    UPDATE public.download_quota
       SET monthly_total_used = GREATEST(0, COALESCE(monthly_total_used, 0) - _from_plan),
           topup_ops_balance = COALESCE(topup_ops_balance, 0) + _from_topup,
           updated_at = now()
     WHERE user_id = p_user_id;
  END IF;

  UPDATE public.quota_wave_operations
     SET state = 'cancelled',
         cancelled_at = now(),
         lease_expires_at = now(),
         updated_at = now(),
         detail = _row.detail || jsonb_build_object('cancel_reason', COALESCE(p_reason, 'unspecified'))
   WHERE operation_id = p_operation_id;

  RETURN jsonb_build_object('status', 'cancelled', 'replay', false, 'restored', _row.allocation);
END;
$function$;

REVOKE ALL ON FUNCTION public.quota_wave_cancel(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.quota_wave_cancel(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.quota_wave_cancel(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.quota_wave_cancel(uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- ЛЕГАЦИ СЪВМЕСТИМОСТ: public.charge_corrections_wave / cancel_corrections_wave
-- / refund_quota остават НЕПРОМЕНЕНИ по подпис и поведение (0029). Новите
-- Б1–Б3 функции ги допълват за атомарни вълни, не ги заместват.
-- ---------------------------------------------------------------------------
