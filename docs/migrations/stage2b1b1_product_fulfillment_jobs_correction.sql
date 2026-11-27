-- Stage 2B1B1 КОРЕКЦИЯ — micro-USD разход, строг курсор/ключ/наем и продуктови
-- преходи за платеното изпълнение.
--
-- Защо е отделен файл: `drizzle/migrations/0019_product_fulfillment_jobs.sql`
-- вече е приет и защитен, затова НЕ се пренаписва. Тази миграция се прилага
-- ВЕДНАГА след 0019 и я привежда в съответствие със сървърната политика
-- `2b1b1.2` (единица micro-USD, продуктови последователности, изведен ключ на
-- стъпка, освобождаване на наем).
--
-- Миграцията е само схема и функции: не попълва, не поправя и не изтрива нито
-- един продуктов или клиентски ред. При несъответствие се отказва (fail closed).
-- Нищо тук НЕ е изпълнено — виж docs/migrations/STAGE2A_ROLLOUT_ORDER.md.
--
-- Разходът се води в цели micro-USD (1 000 000 = 1 USD) — точно единицата, която
-- сървърната политика изчислява. НЯМА курс и НЯМА валутно преобразуване.

BEGIN;

-- ---------------------------------------------------------------------------
-- A) Единицата на разхода: milli-cents -> micro-USD (преименуване, без загуба)
-- ---------------------------------------------------------------------------
DO $$ BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'product_fulfillment_jobs'
       AND column_name = 'budget_hard_cost_milli_cents'
  ) THEN
    ALTER TABLE public.product_fulfillment_jobs
      RENAME COLUMN budget_hard_cost_milli_cents TO budget_hard_cost_micro_usd;
  END IF;
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
     WHERE table_schema = 'public' AND table_name = 'product_fulfillment_jobs'
       AND column_name = 'usage_cost_milli_cents'
  ) THEN
    ALTER TABLE public.product_fulfillment_jobs
      RENAME COLUMN usage_cost_milli_cents TO usage_cost_micro_usd;
  END IF;
END $$;

-- Отделни граници за вход и изход: общата сума вече не е единствената защита.
ALTER TABLE public.product_fulfillment_jobs
  ADD COLUMN IF NOT EXISTS budget_max_input_tokens bigint NOT NULL DEFAULT 0;
ALTER TABLE public.product_fulfillment_jobs
  ADD COLUMN IF NOT EXISTS budget_max_output_tokens bigint NOT NULL DEFAULT 0;

-- Разходът на ВСЯКА контролна точка също е в micro-USD.
ALTER TABLE public.product_fulfillment_checkpoints
  ADD COLUMN IF NOT EXISTS usage_cost_micro_usd bigint NOT NULL DEFAULT 0;

-- ---------------------------------------------------------------------------
-- B) Строги ограничения: етап = етап на курсора, цели неотрицателни индекси,
--    крайна постоянна грешка, разход в границите
-- ---------------------------------------------------------------------------
ALTER TABLE public.product_fulfillment_jobs
  DROP CONSTRAINT IF EXISTS product_fulfillment_jobs_state_ck;
ALTER TABLE public.product_fulfillment_jobs
  ADD CONSTRAINT product_fulfillment_jobs_state_ck CHECK (
    attempt >= 0 AND attempt <= 20
    AND (lease_token IS NULL) = (lease_expires_at IS NULL)
    AND (error_class IS NULL OR error_class IN ('retryable', 'permanent'))
    AND (error_code IS NULL OR length(error_code) <= 64)
    AND length(btrim(generation_policy_version)) > 0
    AND jsonb_typeof(cursor) = 'object'
    AND jsonb_typeof(cursor -> 'batch_index') = 'number'
    AND jsonb_typeof(cursor -> 'chunk_index') = 'number'
    AND (cursor -> 'batch_index')::numeric >= 0
    AND (cursor -> 'chunk_index')::numeric >= 0
    AND (cursor -> 'batch_index')::numeric = trunc((cursor -> 'batch_index')::numeric)
    AND (cursor -> 'chunk_index')::numeric = trunc((cursor -> 'chunk_index')::numeric)
    -- Етапът НИКОГА не се разминава с курсора.
    AND cursor ->> 'stage' = stage
    -- Завършена задача не държи наем.
    AND (stage NOT IN ('completed', 'failed') OR lease_token IS NULL)
    AND (stage <> 'completed' OR completed_at IS NOT NULL)
    -- Постоянната грешка е КРАЙНА: стои във 'failed'.
    AND (error_class IS DISTINCT FROM 'permanent' OR stage = 'failed')
  );

ALTER TABLE public.product_fulfillment_jobs
  DROP CONSTRAINT IF EXISTS product_fulfillment_jobs_usage_ck;
ALTER TABLE public.product_fulfillment_jobs
  ADD CONSTRAINT product_fulfillment_jobs_usage_ck CHECK (
    budget_max_calls >= 0 AND budget_max_tokens >= 0
    AND budget_max_input_tokens >= 0 AND budget_max_output_tokens >= 0
    AND budget_hard_cost_micro_usd >= 0
    AND usage_calls >= 0 AND usage_input_tokens >= 0 AND usage_output_tokens >= 0
    AND usage_cost_micro_usd >= 0
    AND usage_calls <= budget_max_calls
    AND usage_input_tokens <= budget_max_input_tokens
    AND usage_output_tokens <= budget_max_output_tokens
    AND usage_input_tokens + usage_output_tokens <= budget_max_tokens
    AND usage_cost_micro_usd <= budget_hard_cost_micro_usd
  );

ALTER TABLE public.product_fulfillment_checkpoints
  DROP CONSTRAINT IF EXISTS product_fulfillment_checkpoints_shape_ck;
ALTER TABLE public.product_fulfillment_checkpoints
  ADD CONSTRAINT product_fulfillment_checkpoints_shape_ck CHECK (
    length(btrim(cursor_key)) > 0
    AND length(cursor_key) <= 120
    AND stage IN (
      'queued', 'awaiting_generation', 'passport', 'review', 'corrections',
      'negotiation', 'messages', 'synthesis', 'completed', 'failed')
    AND status = 'complete'
    AND sequence >= 0
    AND (payload_digest IS NULL OR payload_digest ~ '^[0-9a-f]{64}$')
    AND usage_calls >= 0 AND usage_input_tokens >= 0 AND usage_output_tokens >= 0
    AND usage_cost_micro_usd >= 0
    -- Ключът на стъпката ВИНАГИ носи точно етапа на стъпката.
    AND cursor_key LIKE stage || ':%'
  );

-- ---------------------------------------------------------------------------
-- C) Продуктовата последователност е единственият законен ред на етапите
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.product_job_stage_sequence(p_product_id text)
RETURNS text[]
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT CASE p_product_id
    WHEN 'contract_check' THEN ARRAY[
      'queued', 'awaiting_generation', 'passport', 'review', 'synthesis', 'completed']
    WHEN 'contract_improve' THEN ARRAY[
      'queued', 'awaiting_generation', 'passport', 'review', 'corrections',
      'synthesis', 'completed']
    WHEN 'negotiation_package' THEN ARRAY[
      'queued', 'awaiting_generation', 'passport', 'review', 'corrections',
      'negotiation', 'messages', 'synthesis', 'completed']
    ELSE NULL::text[]
  END;
$$;

-- Ключът на една стъпка се извежда САМО от курсора — никога от извикващия.
CREATE OR REPLACE FUNCTION public.product_job_cursor_key(p_cursor jsonb)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = '' AS $$
  SELECT (p_cursor ->> 'stage') || ':' ||
         trunc((p_cursor -> 'batch_index')::numeric)::text || ':' ||
         trunc((p_cursor -> 'chunk_index')::numeric)::text;
$$;

-- ---------------------------------------------------------------------------
-- D) Никакъв стар изменящ подпис не остава извикваем
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.claim_product_job(uuid,uuid,text,text,integer,bigint,bigint,integer);
DROP FUNCTION IF EXISTS public.record_product_job_checkpoint(uuid,uuid,text,text,jsonb,integer,bigint,bigint,bigint,text,boolean);

-- ---------------------------------------------------------------------------
-- E) Атомарно заявяване на НАЙ-МНОГО една ограничена стъпка
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_product_job(
  p_entitlement_id uuid,
  p_user_id uuid,
  p_policy_version text,
  p_budget_max_calls integer,
  p_budget_max_input_tokens bigint,
  p_budget_max_output_tokens bigint,
  p_budget_max_tokens bigint,
  p_budget_hard_cost_micro_usd bigint,
  p_lease_seconds integer DEFAULT 600
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ent public.product_entitlements;
  v_snapshot_count integer;
  v_job public.product_fulfillment_jobs;
  v_token uuid := gen_random_uuid();
  v_updated integer;
  v_key text;
BEGIN
  IF p_policy_version IS NULL OR length(btrim(p_policy_version)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'policy_changed');
  END IF;

  -- Заключваме платеното право: две едновременни заявки не могат да го поемат.
  SELECT * INTO v_ent
    FROM public.product_entitlements
   WHERE id = p_entitlement_id AND user_id = p_user_id
     FOR UPDATE;
  IF v_ent.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_ent.status NOT IN ('paid', 'processing', 'failed') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_claimable');
  END IF;
  IF v_ent.generation_policy_version IS NULL
     OR v_ent.generation_policy_version <> p_policy_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'policy_changed');
  END IF;
  IF public.product_job_stage_sequence(v_ent.product_id) IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_claimable');
  END IF;

  -- Доказателството за плащане идва по ДВОЙКИ: право И order snapshot.
  SELECT count(*) INTO v_snapshot_count
    FROM public.order_snapshots
   WHERE purchase_kind = 'product'
     AND product_intake_id = v_ent.intake_id
     AND stripe_session_id = v_ent.stripe_session_id
     AND lower(product_source_hash) = lower(v_ent.source_hash)
     AND payment_status = 'paid';
  IF v_snapshot_count <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'half_state');
  END IF;

  SELECT * INTO v_job
    FROM public.product_fulfillment_jobs
   WHERE entitlement_id = p_entitlement_id
     FOR UPDATE;

  IF v_job.id IS NULL THEN
    v_key := p_entitlement_id::text || ':' || p_policy_version || ':queued:0:0';
    INSERT INTO public.product_fulfillment_jobs (
      entitlement_id, user_id, intake_id, product_id, result_schema_version,
      source_document_id, source_hash, source_kind, source_char_count,
      source_char_unit, source_updated_at, source_page_count,
      generation_policy_version, budget_max_calls, budget_max_input_tokens,
      budget_max_output_tokens, budget_max_tokens, budget_hard_cost_micro_usd,
      stage, cursor, attempt, lease_token, lease_expires_at, idempotency_key
    ) VALUES (
      p_entitlement_id, p_user_id, v_ent.intake_id, v_ent.product_id, 2,
      v_ent.source_document_id, lower(v_ent.source_hash), v_ent.source_kind,
      v_ent.source_char_count, v_ent.source_char_unit, v_ent.source_updated_at,
      v_ent.source_page_count, p_policy_version, COALESCE(p_budget_max_calls, 0),
      COALESCE(p_budget_max_input_tokens, 0), COALESCE(p_budget_max_output_tokens, 0),
      COALESCE(p_budget_max_tokens, 0), COALESCE(p_budget_hard_cost_micro_usd, 0),
      'queued',
      jsonb_build_object('stage', 'queued', 'batch_index', 0, 'chunk_index', 0),
      1, v_token, now() + make_interval(secs => GREATEST(p_lease_seconds, 30)),
      v_key
    )
    RETURNING * INTO v_job;
    -- Състоянието на правото остава съгласувано с задачата.
    UPDATE public.product_entitlements
       SET status = 'processing', updated_at = now()
     WHERE id = p_entitlement_id AND status IN ('paid', 'failed');
    RETURN jsonb_build_object(
      'ok', true, 'job_id', v_job.id, 'lease_token', v_token,
      'stage', v_job.stage, 'cursor', v_job.cursor, 'attempt', v_job.attempt,
      'idempotency_key', v_job.idempotency_key, 'created', true);
  END IF;

  -- Сравнението със съществуващата задача е ПЪЛНО.
  IF v_job.generation_policy_version <> p_policy_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'policy_changed');
  END IF;
  IF v_job.user_id <> p_user_id
     OR v_job.result_schema_version <> 2
     OR v_job.source_document_id <> v_ent.source_document_id
     OR lower(v_job.source_hash) <> lower(v_ent.source_hash)
     OR v_job.source_updated_at <> v_ent.source_updated_at
     OR v_job.source_kind <> v_ent.source_kind
     OR v_job.source_char_count <> v_ent.source_char_count
     OR v_job.source_char_unit <> v_ent.source_char_unit
     OR COALESCE(v_job.source_page_count, -1) <> COALESCE(v_ent.source_page_count, -1)
     OR v_job.product_id <> v_ent.product_id
     OR v_job.intake_id <> v_ent.intake_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'source_changed');
  END IF;
  IF v_job.budget_max_calls <> COALESCE(p_budget_max_calls, 0)
     OR v_job.budget_max_input_tokens <> COALESCE(p_budget_max_input_tokens, 0)
     OR v_job.budget_max_output_tokens <> COALESCE(p_budget_max_output_tokens, 0)
     OR v_job.budget_max_tokens <> COALESCE(p_budget_max_tokens, 0)
     OR v_job.budget_hard_cost_micro_usd <> COALESCE(p_budget_hard_cost_micro_usd, 0) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'policy_changed');
  END IF;
  IF v_job.stage = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_completed');
  END IF;
  -- Постоянната грешка е КРАЙНА: не се връща тихо в 'queued'.
  IF v_job.stage = 'failed' OR v_job.error_class = 'permanent' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'failed_permanent');
  END IF;
  IF v_job.lease_token IS NOT NULL AND v_job.lease_expires_at > now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'lease_active',
                              'stage', v_job.stage, 'cursor', v_job.cursor);
  END IF;
  IF v_job.attempt >= 20 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'attempts_exhausted');
  END IF;

  -- Ключът за идемпотентност се изчислява ТУК, от правото, политиката и
  -- ДЕЙСТВИТЕЛНО записания курсор. Възобновяването е на СЪЩИЯ курсор.
  v_key := p_entitlement_id::text || ':' || p_policy_version || ':' ||
           public.product_job_cursor_key(v_job.cursor);

  UPDATE public.product_fulfillment_jobs
     SET lease_token = v_token,
         lease_expires_at = now() + make_interval(secs => GREATEST(p_lease_seconds, 30)),
         attempt = attempt + 1,
         idempotency_key = v_key,
         error_class = NULL,
         error_code = NULL,
         updated_at = now()
   WHERE id = v_job.id
     AND (lease_token IS NULL OR lease_expires_at <= now());
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'lease_active');
  END IF;

  UPDATE public.product_entitlements
     SET status = 'processing', updated_at = now()
   WHERE id = p_entitlement_id AND status IN ('paid', 'failed');

  -- Връщаме състоянието СЛЕД заявяването, за да няма подвеждащ стар етап.
  SELECT * INTO v_job
    FROM public.product_fulfillment_jobs
   WHERE id = v_job.id;

  RETURN jsonb_build_object(
    'ok', true, 'job_id', v_job.id, 'lease_token', v_token,
    'stage', v_job.stage, 'cursor', v_job.cursor, 'attempt', v_job.attempt,
    'idempotency_key', v_job.idempotency_key, 'created', false);
END $$;

-- ---------------------------------------------------------------------------
-- F) Освобождаване на наем БЕЗ контролна точка
--    Заявена стъпка, за която в този етап няма работа (адаптерът за генерация
--    още не съществува), НЕ бива да заключва задачата за 600 секунди.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.release_product_job_lease(
  p_job_id uuid,
  p_lease_token uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.product_fulfillment_jobs
     SET lease_token = NULL,
         lease_expires_at = NULL,
         updated_at = now()
   WHERE id = p_job_id
     AND lease_token = p_lease_token;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_updated = 1);
END $$;

-- ---------------------------------------------------------------------------
-- G) Една завършена стъпка се записва точно веднъж; курсорът само напредва по
--    ПРОДУКТОВАТА последователност; разходът и точката падат ЗАЕДНО.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_product_job_checkpoint(
  p_job_id uuid,
  p_lease_token uuid,
  p_next_cursor jsonb,
  p_usage_calls integer DEFAULT 0,
  p_usage_input_tokens bigint DEFAULT 0,
  p_usage_output_tokens bigint DEFAULT 0,
  p_usage_cost_micro_usd bigint DEFAULT 0,
  p_payload_digest text DEFAULT NULL,
  p_release_lease boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_job public.product_fulfillment_jobs;
  v_seq integer;
  v_inserted integer;
  v_next_stage text;
  v_seq_arr text[];
  v_stage_pos integer;
  v_current_pos integer;
  v_key text;
  v_next_batch numeric;
  v_next_chunk numeric;
  v_release boolean := COALESCE(p_release_lease, true);
BEGIN
  SELECT * INTO v_job
    FROM public.product_fulfillment_jobs
   WHERE id = p_job_id
     FOR UPDATE;
  IF v_job.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_job.lease_token IS NULL OR v_job.lease_token <> p_lease_token
     OR v_job.lease_expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'lease_invalid');
  END IF;
  IF v_job.stage IN ('completed', 'failed') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'terminal');
  END IF;
  IF v_job.cursor ->> 'stage' IS DISTINCT FROM v_job.stage THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stage_inconsistent');
  END IF;

  -- Следващият курсор трябва да е ЦЯЛ, с цели неотрицателни индекси.
  IF p_next_cursor IS NULL
     OR jsonb_typeof(p_next_cursor) <> 'object'
     OR p_next_cursor ->> 'stage' IS NULL
     OR jsonb_typeof(p_next_cursor -> 'batch_index') <> 'number'
     OR jsonb_typeof(p_next_cursor -> 'chunk_index') <> 'number' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cursor_invalid');
  END IF;
  v_next_batch := (p_next_cursor -> 'batch_index')::numeric;
  v_next_chunk := (p_next_cursor -> 'chunk_index')::numeric;
  IF v_next_batch < 0 OR v_next_chunk < 0
     OR v_next_batch <> trunc(v_next_batch) OR v_next_chunk <> trunc(v_next_chunk) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cursor_invalid');
  END IF;

  -- Законният преход е ПРОДУКТОВ: същият етап или точно следващият.
  v_next_stage := p_next_cursor ->> 'stage';
  v_seq_arr := public.product_job_stage_sequence(v_job.product_id);
  IF v_seq_arr IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unsupported_product');
  END IF;
  IF v_next_stage = 'failed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'use_fail_product_job');
  END IF;
  v_stage_pos := array_position(v_seq_arr, v_next_stage);
  v_current_pos := array_position(v_seq_arr, v_job.stage);
  IF v_current_pos IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'stage_inconsistent');
  END IF;
  IF v_stage_pos IS NULL
     OR v_stage_pos < v_current_pos
     OR v_stage_pos > v_current_pos + 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cursor_not_advancing');
  END IF;
  IF v_stage_pos = v_current_pos THEN
    -- Същият етап: индексите трябва СТРОГО да напредват. Нов ключ не може да
    -- запише повторен или пренебрежим курсор.
    IF NOT (
      v_next_batch > (v_job.cursor -> 'batch_index')::numeric
      OR (
        v_next_batch = (v_job.cursor -> 'batch_index')::numeric
        AND v_next_chunk > (v_job.cursor -> 'chunk_index')::numeric
      )
    ) THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'cursor_not_advancing');
    END IF;
  ELSE
    -- Нов етап започва от нула, за да не наследява чужди индекси.
    IF v_next_batch <> 0 OR v_next_chunk <> 0 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'cursor_not_advancing');
    END IF;
  END IF;

  -- Разходът НЕ може да надхвърли изчислените граници: спираме ПРЕДИ запис, за
  -- да паднат заедно и контролната точка, и начисляването.
  IF v_job.usage_calls + COALESCE(p_usage_calls, 0) > v_job.budget_max_calls
     OR v_job.usage_input_tokens + COALESCE(p_usage_input_tokens, 0)
        > v_job.budget_max_input_tokens
     OR v_job.usage_output_tokens + COALESCE(p_usage_output_tokens, 0)
        > v_job.budget_max_output_tokens
     OR v_job.usage_input_tokens + COALESCE(p_usage_input_tokens, 0)
        + v_job.usage_output_tokens + COALESCE(p_usage_output_tokens, 0)
        > v_job.budget_max_tokens
     OR v_job.usage_cost_micro_usd + COALESCE(p_usage_cost_micro_usd, 0)
        > v_job.budget_hard_cost_micro_usd THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'budget_exceeded');
  END IF;

  -- Ключът на стъпката се извежда от ТОЧНИЯ курсор, не от извикващия.
  v_key := public.product_job_cursor_key(p_next_cursor);

  SELECT COALESCE(max(sequence), -1) + 1 INTO v_seq
    FROM public.product_fulfillment_checkpoints
   WHERE job_id = p_job_id;

  INSERT INTO public.product_fulfillment_checkpoints (
    job_id, entitlement_id, cursor_key, stage, sequence, status,
    payload_digest, usage_calls, usage_input_tokens, usage_output_tokens,
    usage_cost_micro_usd
  ) VALUES (
    p_job_id, v_job.entitlement_id, v_key, v_next_stage, v_seq, 'complete',
    p_payload_digest, COALESCE(p_usage_calls, 0), COALESCE(p_usage_input_tokens, 0),
    COALESCE(p_usage_output_tokens, 0), COALESCE(p_usage_cost_micro_usd, 0)
  )
  ON CONFLICT (job_id, cursor_key) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    -- ТОЧНО същата стъпка вече е записана: разходът НЕ се начислява втори път,
    -- а наемът се освобождава/задържа според заявеното — без да се заклещи.
    IF v_release THEN
      UPDATE public.product_fulfillment_jobs
         SET lease_token = NULL, lease_expires_at = NULL, updated_at = now()
       WHERE id = p_job_id AND lease_token = p_lease_token;
    END IF;
    RETURN jsonb_build_object('ok', true, 'already_recorded', true,
                              'stage', v_job.stage, 'cursor', v_job.cursor,
                              'cursor_key', v_key, 'lease_released', v_release);
  END IF;

  UPDATE public.product_fulfillment_jobs
     SET stage = v_next_stage,
         cursor = jsonb_build_object(
                    'stage', v_next_stage,
                    'batch_index', trunc(v_next_batch),
                    'chunk_index', trunc(v_next_chunk)),
         completed_at = CASE
                          WHEN v_next_stage = 'completed'
                          THEN COALESCE(completed_at, now())
                          ELSE completed_at
                        END,
         usage_calls = usage_calls + COALESCE(p_usage_calls, 0),
         usage_input_tokens = usage_input_tokens + COALESCE(p_usage_input_tokens, 0),
         usage_output_tokens = usage_output_tokens + COALESCE(p_usage_output_tokens, 0),
         usage_cost_micro_usd = usage_cost_micro_usd + COALESCE(p_usage_cost_micro_usd, 0),
         -- Завършена задача НИКОГА не остава с наем.
         lease_token = CASE
                         WHEN v_release OR v_next_stage = 'completed'
                         THEN NULL ELSE lease_token END,
         lease_expires_at = CASE
                              WHEN v_release OR v_next_stage = 'completed'
                              THEN NULL ELSE lease_expires_at END,
         updated_at = now()
   WHERE id = p_job_id;

  RETURN jsonb_build_object('ok', true, 'already_recorded', false,
                            'sequence', v_seq, 'stage', v_next_stage,
                            'cursor_key', v_key, 'lease_released', v_release);
END $$;

-- ---------------------------------------------------------------------------
-- H) Провал: постоянният е КРАЕН, повторяемият възобновява СЪЩИЯ курсор
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fail_product_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_error_class text,
  p_error_code text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_updated integer;
  v_entitlement uuid;
BEGIN
  IF p_error_class IS NULL OR p_error_class NOT IN ('retryable', 'permanent') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_error_class');
  END IF;
  UPDATE public.product_fulfillment_jobs
     SET stage = CASE WHEN p_error_class = 'permanent' THEN 'failed' ELSE stage END,
         -- Етапът и курсорът остават съгласувани и при постоянна грешка.
         cursor = CASE
                    WHEN p_error_class = 'permanent'
                    THEN jsonb_set(cursor, '{stage}', '"failed"'::jsonb)
                    ELSE cursor
                  END,
         error_class = p_error_class,
         error_code = left(COALESCE(p_error_code, 'unknown'), 64),
         lease_token = NULL,
         lease_expires_at = NULL,
         updated_at = now()
   WHERE id = p_job_id
     AND lease_token = p_lease_token
     AND stage NOT IN ('completed', 'failed')
  RETURNING entitlement_id INTO v_entitlement;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 1 AND p_error_class = 'permanent' THEN
    -- Постоянната грешка се вижда и в състоянието на правото.
    UPDATE public.product_entitlements
       SET status = 'failed', updated_at = now()
     WHERE id = v_entitlement AND status IN ('paid', 'processing');
  END IF;
  RETURN jsonb_build_object('ok', v_updated = 1);
END $$;

-- ---------------------------------------------------------------------------
-- I) Права: изменящите функции са само за службата
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.claim_product_job(uuid,uuid,text,integer,bigint,bigint,bigint,bigint,integer)',
    'public.record_product_job_checkpoint(uuid,uuid,jsonb,integer,bigint,bigint,bigint,text,boolean)',
    'public.release_product_job_lease(uuid,uuid)',
    'public.fail_product_job(uuid,uuid,text,text)',
    'public.product_checkpoint_immutable()',
    'public.product_job_stage_sequence(text)',
    'public.product_job_cursor_key(jsonb)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.product_job_status(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.product_job_status(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.product_job_status(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.product_job_status(uuid) TO service_role;

COMMIT;
