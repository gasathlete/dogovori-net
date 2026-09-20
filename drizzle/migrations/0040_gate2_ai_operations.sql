-- =============================================================================
-- 0040 — GATE 2: ТРАЙЕН ЛЕДЖЪР ЗА ТОЧНО ЕДНО ИЗПЪЛНЕНИЕ НА ЧЕТИРИ ПЪТЯ С МОДЕЛ
--
-- Обхват (САМО тези четири удостоверени, потребителски задействани пътя):
--   correct_uploaded         — Pro поправка на качен договор (дневен лимит)
--   generate_linked_document — свързан документ към родителски договор
--   negotiation_strategy     — преговорна стратегия върху собствен анализ
--   ocr_contract             — OCR на до 12 страници (атомарна вълна от квоти)
--
-- Какво добавя:
--   1) public.ai_document_operations — трайно състояние на ЕДНА операция:
--      каноничнo обвързване (потребител + предназначение + точен собствен
--      ресурс + непроменима версия/отпечатък + всички опции, влияещи на
--      резултата), отпечатък на входа, състояние, лизинг, начало на модела,
--      минимален товар за повторение с изтичане, изравняване.
--   2) Точно-еднократно счетоводство: ai_usage.operation_id + УНИКАЛЕН индекс,
--      така че дневното отчитане и записът на употреба НЕ се дублират при
--      повторен опит или повторение.
--   3) САМО-ЧЕТЯЩО търсене (ai_document_operation_lookup) — нищо не пише.
--   4) Атомарна резервация, включително ВСИЧКО-ИЛИ-НИЩО резервация на вълна от
--      операции за OCR (точният брой платими допълнителни страници), чрез
--      вложено извикване на доказания quota_wave_reserve в СЪЩАТА транзакция.
--   5) ai_document_operation_mark_model_started — след него всяка несигурност е
--      ИЗРАВНЯВАНЕ: никога автоматично възстановяване и никога втори модел.
--   6) Атомарен commit — товарът за повторение, записът за употреба и точно
--      ЕДНА бизнес промяна (подписаният плик на стратегията) в една транзакция.
--   7) Отмяна САМО при доказан провал ПРЕДИ модела, с точно възстановяване на
--      резервираната вълна.
--   8) Изравняване на застояли операции, заличаване на изтекъл товар,
--      само-четящо преброяване и заличаване по искане на потребител.
--
-- Всичко е SECURITY DEFINER, schema-qualified, САМО за service_role.
-- Миграция 0039 НЕ се пипа. Тази миграция НЕ е приложена в тази сесия.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Точно-еднократно счетоводство върху ai_usage
-- ---------------------------------------------------------------------------
ALTER TABLE public.ai_usage
  ADD COLUMN IF NOT EXISTS operation_id uuid;

-- Една операция може да породи НАЙ-МНОГО един запис за употреба на функция.
CREATE UNIQUE INDEX IF NOT EXISTS ai_usage_operation_function_uniq
  ON public.ai_usage (operation_id, function_name)
  WHERE operation_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Леджърът
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.ai_document_operations (
  operation_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  purpose text NOT NULL CHECK (purpose IN (
    'correct_uploaded',
    'generate_linked_document',
    'negotiation_strategy',
    'ocr_contract'
  )),
  -- Каноничен SHA-256 (малки букви) върху потребител, предназначение, точния
  -- собствен ресурс, непроменимата версия/отпечатък и ВСИЧКИ опции, влияещи
  -- на резултата. НИКАКВО сурово съдържание не влиза в таблицата.
  binding_digest text NOT NULL CHECK (binding_digest ~ '^[0-9a-f]{64}$'),
  -- Отпечатък САМО на входа/версията (без опции) — за проследимост при смяна
  -- на документа. Също само отпечатък.
  input_digest text CHECK (input_digest IS NULL OR input_digest ~ '^[0-9a-f]{64}$'),
  resource_id uuid,
  resource_version text,
  state text NOT NULL CHECK (state IN ('reserved', 'committed', 'cancelled', 'reconciliation')),
  charged boolean NOT NULL DEFAULT false,
  -- Резервирана вълна от операции (OCR). Точният брой платими страници.
  wave_ops integer NOT NULL DEFAULT 0 CHECK (wave_ops >= 0),
  wave_allocation jsonb,
  wave_state text CHECK (wave_state IS NULL OR wave_state IN ('reserved', 'committed', 'cancelled')),
  lease_owner uuid,
  lease_expires_at timestamptz,
  model_started_at timestamptz,
  committed_at timestamptz,
  cancelled_at timestamptz,
  -- Минималният товар за ТОЧНО повторение, с ограничен срок на пазене.
  result jsonb,
  result_expires_at timestamptz,
  reconciliation_required boolean NOT NULL DEFAULT false,
  -- Кратък, непотребителски код за произход/грешка. НИКОГА текст на документ.
  detail text CHECK (detail IS NULL OR detail ~ '^[a-z0-9_]{1,64}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Едно НЕРАЗРЕШЕНО изравняване държи точното обвързване: нов operation_id НЕ
-- може да заобиколи неразрешено изравняване за същия потребител, същото
-- предназначение и същия ресурс/версия/обвързване.
CREATE UNIQUE INDEX IF NOT EXISTS ai_document_operations_unresolved_binding_uniq
  ON public.ai_document_operations (user_id, purpose, binding_digest)
  WHERE state = 'reconciliation' OR reconciliation_required;

CREATE INDEX IF NOT EXISTS ai_document_operations_user_idx
  ON public.ai_document_operations (user_id, purpose, created_at DESC);

CREATE INDEX IF NOT EXISTS ai_document_operations_stale_idx
  ON public.ai_document_operations (state, lease_expires_at)
  WHERE state = 'reserved';

CREATE INDEX IF NOT EXISTS ai_document_operations_payload_idx
  ON public.ai_document_operations (result_expires_at)
  WHERE result IS NOT NULL;

-- Таблицата НЕ е част от Data API: никаква привилегия за анонимни и за
-- удостоверени роли. Достъпът е САМО през функциите по-долу.
REVOKE ALL ON TABLE public.ai_document_operations FROM PUBLIC;
REVOKE ALL ON TABLE public.ai_document_operations FROM anon;
REVOKE ALL ON TABLE public.ai_document_operations FROM authenticated;
GRANT ALL ON public.ai_document_operations TO service_role;
ALTER TABLE public.ai_document_operations ENABLE ROW LEVEL SECURITY;
-- Никакви политики: таблицата е достъпна САМО през service_role функциите.

-- ---------------------------------------------------------------------------
-- 3) САМО-ЧЕТЯЩО търсене. НЕ пише, НЕ маркира, НЕ отменя.
--    Извиква се ПРЕДИ ограниченията на честотата, ключа на доставчика,
--    квотата, RAG, ai_usage и всяка бизнес промяна.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_document_operation_lookup(
  p_operation_id uuid,
  p_user_id uuid,
  p_purpose text,
  p_binding text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.ai_document_operations%ROWTYPE;
  _blocked integer := 0;
BEGIN
  IF p_operation_id IS NULL OR p_user_id IS NULL OR p_purpose IS NULL
     OR p_binding IS NULL OR p_binding !~ '^[0-9a-f]{64}$' THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT * INTO _row FROM public.ai_document_operations
   WHERE operation_id = p_operation_id;

  IF NOT FOUND THEN
    -- Неразрешено изравняване по СЪЩОТО обвързване блокира нов ключ.
    SELECT count(*) INTO _blocked FROM public.ai_document_operations
     WHERE user_id = p_user_id
       AND purpose = p_purpose
       AND binding_digest = p_binding
       AND (state = 'reconciliation' OR reconciliation_required);
    IF _blocked > 0 THEN
      RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'binding_unresolved');
    END IF;
    RETURN jsonb_build_object('status', 'absent');
  END IF;

  IF _row.user_id <> p_user_id
     OR _row.purpose <> p_purpose
     OR _row.binding_digest <> p_binding THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'binding_conflict');
  END IF;

  IF _row.reconciliation_required OR _row.state = 'reconciliation' THEN
    RETURN jsonb_build_object('status', 'reconciliation', 'reason', COALESCE(_row.detail, 'flagged'));
  END IF;

  IF _row.state = 'committed' THEN
    IF _row.result IS NULL OR _row.result_expires_at IS NULL
       OR _row.result_expires_at <= now() THEN
      RETURN jsonb_build_object('status', 'response_expired', 'new_request_required', true);
    END IF;
    RETURN jsonb_build_object(
      'status', 'committed',
      'result', _row.result,
      'charged', _row.charged,
      'wave_ops', _row.wave_ops
    );
  END IF;

  IF _row.state = 'reserved' THEN
    IF _row.lease_expires_at IS NULL OR _row.lease_expires_at <= now() THEN
      RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'lease_expired');
    END IF;
    RETURN jsonb_build_object(
      'status', 'in_progress',
      'model_started', _row.model_started_at IS NOT NULL,
      'retry_after_seconds',
        GREATEST(1, CEIL(EXTRACT(EPOCH FROM (_row.lease_expires_at - now()))))::int
    );
  END IF;

  IF _row.state = 'cancelled' THEN
    IF _row.cancelled_at IS NULL THEN
      RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'cancellation_unproven');
    END IF;
    RETURN jsonb_build_object('status', 'absent', 'cancelled', true);
  END IF;

  RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'unknown_state');
END;
$function$;

REVOKE ALL ON FUNCTION public.ai_document_operation_lookup(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_document_operation_lookup(uuid, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.ai_document_operation_lookup(uuid, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_document_operation_lookup(uuid, uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Атомарна резервация.
--
-- Всичко-или-нищо: когато p_wave_ops > 0 (OCR), резервацията на вълната минава
-- през доказания quota_wave_reserve в СЪЩАТА транзакция. Ако вълната не може да
-- бъде резервирана ЦЯЛА, НИЩО не се записва — нито ред в леджъра, нито частично
-- изразходвана квота.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_document_operation_reserve(
  p_operation_id uuid,
  p_user_id uuid,
  p_purpose text,
  p_binding text,
  p_input_digest text,
  p_resource_id uuid,
  p_resource_version text,
  p_lease_seconds integer,
  p_wave_ops integer,
  p_wave_kind text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.ai_document_operations%ROWTYPE;
  _lease integer;
  _wave_ops integer;
  _wave jsonb;
  _wave_status text;
  _blocked integer := 0;
  _rows integer := 0;
BEGIN
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'operation_id_and_user_required' USING ERRCODE = '22023';
  END IF;
  IF p_purpose IS NULL OR p_purpose NOT IN (
       'correct_uploaded', 'generate_linked_document',
       'negotiation_strategy', 'ocr_contract') THEN
    RAISE EXCEPTION 'purpose_invalid' USING ERRCODE = '22023';
  END IF;
  IF p_binding IS NULL OR p_binding !~ '^[0-9a-f]{64}$' THEN
    RAISE EXCEPTION 'binding_required' USING ERRCODE = '22023';
  END IF;

  _lease := GREATEST(60, LEAST(COALESCE(p_lease_seconds, 300), 1800));
  _wave_ops := GREATEST(0, COALESCE(p_wave_ops, 0));

  PERFORM pg_advisory_xact_lock(hashtext(p_operation_id::text));

  SELECT * INTO _row FROM public.ai_document_operations
   WHERE operation_id = p_operation_id FOR UPDATE;

  IF FOUND THEN
    IF _row.user_id <> p_user_id
       OR _row.purpose <> p_purpose
       OR _row.binding_digest <> p_binding THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'binding_conflict');
    END IF;
    IF _row.reconciliation_required OR _row.state = 'reconciliation' THEN
      RETURN jsonb_build_object('status', 'reconciliation', 'reason', COALESCE(_row.detail, 'flagged'));
    END IF;
    IF _row.state = 'committed' THEN
      IF _row.result IS NULL OR _row.result_expires_at IS NULL
         OR _row.result_expires_at <= now() THEN
        RETURN jsonb_build_object('status', 'response_expired', 'new_request_required', true);
      END IF;
      RETURN jsonb_build_object('status', 'committed', 'result', _row.result,
        'charged', _row.charged, 'wave_ops', _row.wave_ops);
    END IF;
    IF _row.state = 'reserved' THEN
      IF _row.lease_expires_at IS NOT NULL AND _row.lease_expires_at > now() THEN
        RETURN jsonb_build_object(
          'status', 'in_progress',
          'model_started', _row.model_started_at IS NOT NULL,
          'retry_after_seconds',
            GREATEST(1, CEIL(EXTRACT(EPOCH FROM (_row.lease_expires_at - now()))))::int
        );
      END IF;
      -- ИЗТЕКЪЛ ЛИЗИНГ: предходната резервация НЕ е доказано отменена. Второ
      -- резервиране би могло да таксува два пъти — затова само изравняване.
      RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'lease_expired');
    END IF;
    IF _row.state = 'cancelled' THEN
      IF _row.cancelled_at IS NULL THEN
        RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'cancellation_unproven');
      END IF;
      IF _row.wave_ops > 0 AND COALESCE(_row.wave_state, '') <> 'cancelled' THEN
        RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'restoration_unproven');
      END IF;
      -- Доказано отменена И доказано възстановена: същият ключ може отново.
    END IF;
  ELSE
    -- Нов ключ НЕ заобикаля НЕРАЗРЕШЕНО състояние по същото обвързване. Това
    -- включва и ИЗТЕКЛА резервация, която още не е обработена от метача: иначе
    -- пресен operation_id би могъл да таксува втори път същия вход.
    SELECT count(*) INTO _blocked FROM public.ai_document_operations
     WHERE user_id = p_user_id
       AND purpose = p_purpose
       AND binding_digest = p_binding
       AND (
            state = 'reconciliation'
         OR reconciliation_required
         OR (state = 'reserved'
             AND (lease_expires_at IS NULL OR lease_expires_at <= now()))
       );
    IF _blocked > 0 THEN
      RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'binding_unresolved');
    END IF;
    -- Жива резервация по СЪЩОТО обвързване с друг ключ: един победител.
    SELECT count(*) INTO _blocked FROM public.ai_document_operations
     WHERE user_id = p_user_id
       AND purpose = p_purpose
       AND binding_digest = p_binding
       AND state = 'reserved'
       AND lease_expires_at > now();
    IF _blocked > 0 THEN
      RETURN jsonb_build_object(
        'status', 'in_progress', 'reason', 'binding_in_progress',
        'model_started', true, 'retry_after_seconds', 5);
    END IF;
  END IF;

  -- АТОМАРНА ВЪЛНА (OCR): всичко-или-нищо, в същата транзакция.
  IF _wave_ops > 0 THEN
    _wave := public.quota_wave_reserve(
      p_operation_id := p_operation_id,
      p_user_id := p_user_id,
      p_kind := COALESCE(NULLIF(btrim(COALESCE(p_wave_kind, '')), ''), 'analysis'),
      p_purpose := p_purpose,
      p_session_id := NULL,
      p_doc_key := NULL,
      p_batch_id := NULL,
      p_request_digest := p_binding,
      p_ops_count := _wave_ops,
      p_lease_seconds := _lease
    );
    _wave_status := _wave->>'status';
    IF _wave_status IS DISTINCT FROM 'reserved' THEN
      -- Нищо не се записва: няма ред в леджъра и няма частично изразходвана
      -- квота. Отказът е чист.
      RETURN jsonb_build_object(
        'status', CASE
          WHEN _wave_status = 'denied' THEN 'quota_exhausted'
          WHEN _wave_status IN ('in_progress', 'reconciliation', 'conflict',
                                'response_expired', 'replay', 'unavailable') THEN _wave_status
          ELSE 'unavailable'
        END,
        'reason', COALESCE(_wave->>'reason', _wave_status)
      );
    END IF;
  END IF;

  INSERT INTO public.ai_document_operations AS o (
    operation_id, user_id, purpose, binding_digest, input_digest,
    resource_id, resource_version, state, charged,
    wave_ops, wave_allocation, wave_state,
    lease_owner, lease_expires_at, model_started_at,
    committed_at, cancelled_at, result, result_expires_at,
    reconciliation_required, detail, created_at, updated_at
  ) VALUES (
    p_operation_id, p_user_id, p_purpose, p_binding, NULLIF(p_input_digest, ''),
    p_resource_id, NULLIF(btrim(COALESCE(p_resource_version, '')), ''), 'reserved',
    _wave_ops > 0,
    _wave_ops,
    CASE WHEN _wave_ops > 0 THEN _wave->'allocation' ELSE NULL END,
    CASE WHEN _wave_ops > 0 THEN 'reserved' ELSE NULL END,
    p_operation_id, now() + make_interval(secs => _lease), NULL,
    NULL, NULL, NULL, NULL,
    false, NULL, now(), now()
  )
  ON CONFLICT (operation_id) DO UPDATE
     SET state = 'reserved',
         charged = _wave_ops > 0,
         wave_ops = _wave_ops,
         wave_allocation = CASE WHEN _wave_ops > 0 THEN _wave->'allocation' ELSE NULL END,
         wave_state = CASE WHEN _wave_ops > 0 THEN 'reserved' ELSE NULL END,
         lease_owner = p_operation_id,
         lease_expires_at = now() + make_interval(secs => _lease),
         model_started_at = NULL,
         committed_at = NULL,
         cancelled_at = NULL,
         result = NULL,
         result_expires_at = NULL,
         reconciliation_required = false,
         detail = NULL,
         updated_at = now()
   WHERE o.state = 'cancelled';

  GET DIAGNOSTICS _rows = ROW_COUNT;
  IF _rows <> 1 THEN
    -- Състоянието се е променило между проверката и записа. Тук ВЕЧЕ може да е
    -- резервирана вълна, затова се отменя ЦЯЛАТА транзакция: никога не остава
    -- резервирана вълна без ред в леджъра.
    RAISE EXCEPTION 'ai_document_reserve_race' USING ERRCODE = '40001';
  END IF;

  RETURN jsonb_build_object(
    'status', 'reserved',
    'wave_ops', _wave_ops,
    'lease_seconds', _lease
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.ai_document_operation_reserve(uuid, uuid, text, text, text, uuid, text, integer, integer, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_document_operation_reserve(uuid, uuid, text, text, text, uuid, text, integer, integer, text) FROM anon;
REVOKE ALL ON FUNCTION public.ai_document_operation_reserve(uuid, uuid, text, text, text, uuid, text, integer, integer, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_document_operation_reserve(uuid, uuid, text, text, text, uuid, text, integer, integer, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5) ТРАЙНО начало на модела. НИКОЕ повикване към доставчик не може да се случи
--    преди този ред да е записан.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_document_operation_mark_model_started(
  p_operation_id uuid,
  p_user_id uuid,
  p_purpose text,
  p_binding text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.ai_document_operations%ROWTYPE;
BEGIN
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
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
  IF _row.state <> 'reserved' THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'not_reserved');
  END IF;
  -- Лизингът трябва да е СОБСТВЕН на тази операция.
  IF _row.lease_owner IS DISTINCT FROM p_operation_id THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'lease_not_owned');
  END IF;
  IF _row.model_started_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_started');
  END IF;
  IF _row.lease_expires_at IS NULL OR _row.lease_expires_at <= now() THEN
    UPDATE public.ai_document_operations
       SET state = 'reconciliation', reconciliation_required = true,
           lease_expires_at = NULL,
           detail = 'lease_expired_before_model', updated_at = now()
     WHERE operation_id = p_operation_id;
    RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'lease_expired');
  END IF;
  UPDATE public.ai_document_operations
     SET model_started_at = now(), updated_at = now()
   WHERE operation_id = p_operation_id;
  RETURN jsonb_build_object('status', 'ok');
END;
$function$;

REVOKE ALL ON FUNCTION public.ai_document_operation_mark_model_started(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_document_operation_mark_model_started(uuid, uuid, text, text) FROM anon;
REVOKE ALL ON FUNCTION public.ai_document_operation_mark_model_started(uuid, uuid, text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_document_operation_mark_model_started(uuid, uuid, text, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 6) Изравняване при несигурност СЛЕД стартиран модел.
--    Това НЕ е отмяна: НЕ възстановява вълна и НЕ позволява втори модел.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_document_operation_mark_reconciliation(
  p_operation_id uuid,
  p_user_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.ai_document_operations%ROWTYPE;
  _reason text;
BEGIN
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  _reason := COALESCE(
    NULLIF(regexp_replace(lower(COALESCE(p_reason, '')), '[^a-z0-9_]', '_', 'g'), ''),
    'uncertain');
  SELECT * INTO _row FROM public.ai_document_operations
   WHERE operation_id = p_operation_id FOR UPDATE;
  IF NOT FOUND OR _row.user_id <> p_user_id THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  IF _row.state = 'committed' THEN
    RETURN jsonb_build_object('status', 'committed');
  END IF;
  IF _row.reconciliation_required OR _row.state = 'reconciliation' THEN
    RETURN jsonb_build_object('status', 'reconciliation', 'replay', true);
  END IF;
  -- Квотата/вълната НЕ се докосва: моделът може вече да е изпълнен.
  UPDATE public.ai_document_operations
     SET state = 'reconciliation', reconciliation_required = true,
         lease_expires_at = NULL,
         detail = left(_reason, 64), updated_at = now()
   WHERE operation_id = p_operation_id;
  RETURN jsonb_build_object('status', 'reconciliation', 'replay', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.ai_document_operation_mark_reconciliation(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_document_operation_mark_reconciliation(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.ai_document_operation_mark_reconciliation(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_document_operation_mark_reconciliation(uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 7) Атомарен commit.
--
-- В ЕДНА транзакция:
--   - товарът за точно повторение с ограничен срок;
--   - НАЙ-МНОГО един запис в ai_usage (уникален индекс по operation_id);
--   - НАЙ-МНОГО една бизнес промяна (подписаният плик на стратегията върху
--     СОБСТВЕНИЯ анализ);
--   - commit на резервираната вълна (OCR).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_document_operation_commit(
  p_operation_id uuid,
  p_user_id uuid,
  p_purpose text,
  p_binding text,
  p_result jsonb,
  p_result_ttl_seconds integer,
  p_usage_function text,
  p_business jsonb
)
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
    ON CONFLICT (operation_id, function_name) DO NOTHING;
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

REVOKE ALL ON FUNCTION public.ai_document_operation_commit(uuid, uuid, text, text, jsonb, integer, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_document_operation_commit(uuid, uuid, text, text, jsonb, integer, text, jsonb) FROM anon;
REVOKE ALL ON FUNCTION public.ai_document_operation_commit(uuid, uuid, text, text, jsonb, integer, text, jsonb) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_document_operation_commit(uuid, uuid, text, text, jsonb, integer, text, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 8) Отмяна САМО при доказан провал ПРЕДИ модела, с точно възстановяване.
--    След model_started отмяна е НЕВЪЗМОЖНА — става изравняване.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_document_operation_cancel(
  p_operation_id uuid,
  p_user_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.ai_document_operations%ROWTYPE;
  _reason text;
  _wave jsonb;
  _rows integer := 0;
BEGIN
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  _reason := COALESCE(
    NULLIF(regexp_replace(lower(COALESCE(p_reason, '')), '[^a-z0-9_]', '_', 'g'), ''),
    'cancelled');

  SELECT * INTO _row FROM public.ai_document_operations
   WHERE operation_id = p_operation_id FOR UPDATE;
  IF NOT FOUND OR _row.user_id <> p_user_id THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  IF _row.state = 'cancelled' THEN
    IF _row.wave_ops > 0 AND COALESCE(_row.wave_state, '') <> 'cancelled' THEN
      RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'restoration_unproven');
    END IF;
    RETURN jsonb_build_object('status', 'cancelled', 'replay', true, 'restored', true);
  END IF;
  IF _row.state = 'committed' THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'cancel_after_commit');
  END IF;
  IF _row.state = 'reconciliation' OR _row.reconciliation_required THEN
    RETURN jsonb_build_object('status', 'reconciliation', 'reason', COALESCE(_row.detail, 'flagged'));
  END IF;
  IF _row.model_started_at IS NOT NULL THEN
    -- Моделът може вече да е изпълнен: НЕ се възстановява нищо автоматично.
    UPDATE public.ai_document_operations
       SET state = 'reconciliation', reconciliation_required = true,
           lease_expires_at = NULL,
           detail = 'cancel_after_model_started', updated_at = now()
     WHERE operation_id = p_operation_id;
    RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'model_started');
  END IF;

  IF _row.wave_ops > 0 THEN
    _wave := public.quota_wave_cancel(
      p_operation_id := p_operation_id,
      p_user_id := p_user_id,
      p_reason := _reason
    );
    IF COALESCE(_wave->>'status', '') <> 'cancelled'
       OR jsonb_typeof(_wave->'restored') IS DISTINCT FROM 'array' THEN
      -- Възстановяването НЕ е доказано: не твърдим „без такса“.
      UPDATE public.ai_document_operations
         SET state = 'reconciliation', reconciliation_required = true,
             lease_expires_at = NULL,
             detail = 'restoration_unproven', updated_at = now()
       WHERE operation_id = p_operation_id;
      RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'restoration_unproven');
    END IF;
  END IF;

  UPDATE public.ai_document_operations
     SET state = 'cancelled',
         cancelled_at = now(),
         lease_expires_at = NULL,
         charged = false,
         wave_state = CASE WHEN wave_ops > 0 THEN 'cancelled' ELSE wave_state END,
         detail = left(_reason, 64),
         updated_at = now()
   WHERE operation_id = p_operation_id;
  GET DIAGNOSTICS _rows = ROW_COUNT;
  IF _rows <> 1 THEN
    -- Вълната вече е върната: без връщане назад бихме „забравили“ отмяната.
    RAISE EXCEPTION 'ai_document_cancel_rowcount' USING ERRCODE = '40003';
  END IF;

  RETURN jsonb_build_object('status', 'cancelled', 'replay', false, 'restored', true);
END;
$function$;

REVOKE ALL ON FUNCTION public.ai_document_operation_cancel(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_document_operation_cancel(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.ai_document_operation_cancel(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_document_operation_cancel(uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 9) Изравняване на застояли операции (метач).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.ai_document_operations_reconcile_stale(p_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _examined integer := 0;
  _flagged integer := 0;
  _r record;
BEGIN
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  FOR _r IN
    SELECT operation_id FROM public.ai_document_operations
     WHERE state = 'reserved'
       AND lease_expires_at IS NOT NULL
       AND lease_expires_at <= now()
     ORDER BY lease_expires_at
     LIMIT GREATEST(COALESCE(p_limit, 50), 1)
     FOR UPDATE SKIP LOCKED
  LOOP
    _examined := _examined + 1;
    UPDATE public.ai_document_operations
       SET state = 'reconciliation', reconciliation_required = true,
           lease_expires_at = NULL,
           detail = 'stale_lease', updated_at = now()
     WHERE operation_id = _r.operation_id;
    _flagged := _flagged + 1;
  END LOOP;
  RETURN jsonb_build_object('examined', _examined, 'flagged', _flagged);
END;
$function$;

REVOKE ALL ON FUNCTION public.ai_document_operations_reconcile_stale(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.ai_document_operations_reconcile_stale(integer) FROM anon;
REVOKE ALL ON FUNCTION public.ai_document_operations_reconcile_stale(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.ai_document_operations_reconcile_stale(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 10) Заличаване САМО на изтекъл товар — счетоводството остава.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sweep_expired_ai_document_operation_results(
  p_limit integer,
  p_dry_run boolean
)
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
       SET result = NULL, updated_at = now()
      FROM victims v
     WHERE o.operation_id = v.operation_id
     RETURNING o.operation_id
  )
  SELECT count(*) INTO _cleared FROM cleared;

  RETURN jsonb_build_object('due', _due, 'cleared', _cleared, 'dry_run', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.sweep_expired_ai_document_operation_results(integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sweep_expired_ai_document_operation_results(integer, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.sweep_expired_ai_document_operation_results(integer, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_expired_ai_document_operation_results(integer, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 11) Заличаване по искане на потребител: пада товарът, остава минималното
--     счетоводство (състояние, резервация, време) без съдържание.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_ai_document_operation_payloads(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _cleared integer := 0;
BEGIN
  IF auth.role() IS NOT NULL AND auth.role() <> 'service_role' THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('cleared', 0);
  END IF;
  WITH cleared AS (
    UPDATE public.ai_document_operations
       SET result = NULL, result_expires_at = NULL, updated_at = now()
     WHERE user_id = p_user_id AND result IS NOT NULL
     RETURNING operation_id
  )
  SELECT count(*) INTO _cleared FROM cleared;
  RETURN jsonb_build_object('cleared', _cleared);
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_ai_document_operation_payloads(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_ai_document_operation_payloads(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.purge_ai_document_operation_payloads(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_ai_document_operation_payloads(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 12) Само-четящото преброяване обхваща и новия леджър. Същият подпис, същите
--     права — САМО четене, никакво маркиране. 0039 НЕ се променя: тук само
--     разширяваме тялото на функцията.
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
    'assistant_results_due', (
      SELECT count(*) FROM public.assistant_turn_operations
       WHERE result IS NOT NULL
         AND result_expires_at IS NOT NULL
         AND result_expires_at <= now()
    ),
    'assistant_stale_due', (
      SELECT count(*) FROM public.assistant_turn_operations
       WHERE state = 'reserved'
         AND lease_expires_at IS NOT NULL
         AND lease_expires_at <= now()
    ),
    'ai_document_results_due', (
      SELECT count(*) FROM public.ai_document_operations
       WHERE result IS NOT NULL
         AND result_expires_at IS NOT NULL
         AND result_expires_at <= now()
    ),
    'ai_document_stale_due', (
      SELECT count(*) FROM public.ai_document_operations
       WHERE state = 'reserved'
         AND lease_expires_at IS NOT NULL
         AND lease_expires_at <= now()
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
