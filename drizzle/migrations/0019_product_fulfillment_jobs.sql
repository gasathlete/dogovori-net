-- Stage 2B1B1 — трайно състояние на платеното изпълнение: задачи, наем,
-- контролни точки и content-free разход.
--
-- Защо е тук, а не в `supabase/migrations`: тази папка е защитена и всяка
-- промяна в нея се ИЗПЪЛНЯВА веднага. Този етап е само източник: нищо не е
-- приложено. Виж docs/migrations/STAGE2A_ROLLOUT_ORDER.md за точния ред.
--
-- Миграцията е само схема: не пипа, не попълва и не изтрива продуктови или
-- клиентски редове. При несъответствие се отказва (fail closed).

BEGIN;

-- ---------------------------------------------------------------------------
-- A) Версия на политиката в заявката и в платеното право
-- ---------------------------------------------------------------------------
ALTER TABLE public.product_checkout_intakes
  ADD COLUMN IF NOT EXISTS generation_policy_version text;

ALTER TABLE public.product_entitlements
  ADD COLUMN IF NOT EXISTS generation_policy_version text;

-- ---------------------------------------------------------------------------
-- B) Задачата — точно една на платено право
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_fulfillment_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id uuid NOT NULL UNIQUE
    REFERENCES public.product_entitlements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  intake_id uuid NOT NULL
    REFERENCES public.product_checkout_intakes(id) ON DELETE RESTRICT,
  product_id text NOT NULL,
  -- Обвързването с резултатния договор v2 и с ЦЕЛИЯ източник.
  result_schema_version integer NOT NULL DEFAULT 2,
  source_document_id uuid NOT NULL
    REFERENCES public.uploaded_contracts(id) ON DELETE RESTRICT,
  source_hash text NOT NULL,
  source_kind text NOT NULL,
  source_char_count integer NOT NULL,
  source_char_unit text NOT NULL,
  source_updated_at timestamptz NOT NULL,
  source_page_count integer,
  -- Състояние и детерминистичен курсор.
  stage text NOT NULL DEFAULT 'queued',
  cursor jsonb NOT NULL DEFAULT jsonb_build_object(
    'stage', 'queued', 'batch_index', 0, 'chunk_index', 0),
  attempt integer NOT NULL DEFAULT 0,
  lease_token uuid,
  lease_expires_at timestamptz,
  idempotency_key text,
  -- Безопасен клас на грешката, без съдържание.
  error_class text,
  error_code text,
  generation_policy_version text NOT NULL,
  -- Изчислените граници и натрупаният разход — само числа.
  budget_max_calls integer NOT NULL DEFAULT 0,
  budget_max_tokens bigint NOT NULL DEFAULT 0,
  budget_hard_cost_milli_cents bigint NOT NULL DEFAULT 0,
  usage_calls integer NOT NULL DEFAULT 0,
  usage_input_tokens bigint NOT NULL DEFAULT 0,
  usage_output_tokens bigint NOT NULL DEFAULT 0,
  usage_cost_milli_cents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

DO $$ BEGIN
  ALTER TABLE public.product_fulfillment_jobs
    ADD CONSTRAINT product_fulfillment_jobs_product_ck
    CHECK (product_id IN ('contract_check', 'contract_improve', 'negotiation_package'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.product_fulfillment_jobs
    ADD CONSTRAINT product_fulfillment_jobs_stage_ck
    CHECK (stage IN (
      'queued', 'awaiting_generation', 'passport', 'review', 'corrections',
      'negotiation', 'messages', 'synthesis', 'completed', 'failed'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Обвързването с източника е ЦЯЛО или задачата не съществува.
DO $$ BEGIN
  ALTER TABLE public.product_fulfillment_jobs
    ADD CONSTRAINT product_fulfillment_jobs_source_ck CHECK (
      result_schema_version = 2
      AND source_hash ~ '^[0-9a-f]{64}$'
      AND source_kind IN ('pdf', 'docx')
      AND source_char_count BETWEEN 80 AND 60000
      AND source_char_unit = 'unicode_code_points'
      AND (source_page_count IS NULL OR source_page_count > 0)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.product_fulfillment_jobs
    ADD CONSTRAINT product_fulfillment_jobs_state_ck CHECK (
      attempt >= 0 AND attempt <= 20
      AND (lease_token IS NULL) = (lease_expires_at IS NULL)
      AND (error_class IS NULL OR error_class IN ('retryable', 'permanent'))
      AND (error_code IS NULL OR length(error_code) <= 64)
      AND length(btrim(generation_policy_version)) > 0
      AND jsonb_typeof(cursor) = 'object'
      AND cursor ->> 'stage' IS NOT NULL
      AND jsonb_typeof(cursor -> 'batch_index') = 'number'
      AND jsonb_typeof(cursor -> 'chunk_index') = 'number'
      -- Завършена задача не държи наем.
      AND (stage NOT IN ('completed', 'failed') OR lease_token IS NULL)
      AND (stage <> 'completed' OR completed_at IS NOT NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Разходът не може да надхвърли изчислените граници.
DO $$ BEGIN
  ALTER TABLE public.product_fulfillment_jobs
    ADD CONSTRAINT product_fulfillment_jobs_usage_ck CHECK (
      budget_max_calls >= 0 AND budget_max_tokens >= 0
      AND budget_hard_cost_milli_cents >= 0
      AND usage_calls >= 0 AND usage_input_tokens >= 0 AND usage_output_tokens >= 0
      AND usage_cost_milli_cents >= 0
      AND usage_calls <= budget_max_calls
      AND usage_input_tokens + usage_output_tokens <= budget_max_tokens
      AND usage_cost_milli_cents <= budget_hard_cost_milli_cents
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS product_fulfillment_jobs_user_idx
  ON public.product_fulfillment_jobs (user_id);

-- Браузърът НЕ получава права върху таблицата: истината се чете само през
-- функция със собствена проверка на собственика.
REVOKE ALL ON public.product_fulfillment_jobs FROM PUBLIC;
REVOKE ALL ON public.product_fulfillment_jobs FROM anon;
REVOKE ALL ON public.product_fulfillment_jobs FROM authenticated;
GRANT ALL ON public.product_fulfillment_jobs TO service_role;
ALTER TABLE public.product_fulfillment_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_fulfillment_jobs FORCE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- C) Контролни точки — притежание на службата, само добавяне, неизменни
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_fulfillment_checkpoints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id uuid NOT NULL
    REFERENCES public.product_fulfillment_jobs(id) ON DELETE CASCADE,
  entitlement_id uuid NOT NULL
    REFERENCES public.product_entitlements(id) ON DELETE CASCADE,
  cursor_key text NOT NULL,
  stage text NOT NULL,
  sequence integer NOT NULL,
  status text NOT NULL DEFAULT 'complete',
  -- Само отпечатък и числа. НИКОГА текст на документа или откъс.
  payload_digest text,
  usage_calls integer NOT NULL DEFAULT 0,
  usage_input_tokens bigint NOT NULL DEFAULT 0,
  usage_output_tokens bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
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
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Една завършена стъпка съществува ТОЧНО веднъж.
CREATE UNIQUE INDEX IF NOT EXISTS product_fulfillment_checkpoints_step_uq
  ON public.product_fulfillment_checkpoints (job_id, cursor_key);

REVOKE ALL ON public.product_fulfillment_checkpoints FROM PUBLIC;
REVOKE ALL ON public.product_fulfillment_checkpoints FROM anon;
REVOKE ALL ON public.product_fulfillment_checkpoints FROM authenticated;
GRANT ALL ON public.product_fulfillment_checkpoints TO service_role;
ALTER TABLE public.product_fulfillment_checkpoints ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_fulfillment_checkpoints FORCE ROW LEVEL SECURITY;

-- Записаната контролна точка е неизменна дори за service_role.
CREATE OR REPLACE FUNCTION public.product_checkpoint_immutable()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  RAISE EXCEPTION 'product_fulfillment_checkpoints is append-only';
END $$;

DROP TRIGGER IF EXISTS product_fulfillment_checkpoints_no_update
  ON public.product_fulfillment_checkpoints;
CREATE TRIGGER product_fulfillment_checkpoints_no_update
  BEFORE UPDATE OR DELETE ON public.product_fulfillment_checkpoints
  FOR EACH ROW EXECUTE FUNCTION public.product_checkpoint_immutable();

-- ---------------------------------------------------------------------------
-- D) Атомарно заявяване на най-много една ограничена стъпка
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_product_job(
  p_entitlement_id uuid,
  p_user_id uuid,
  p_policy_version text,
  p_idempotency_key text,
  p_budget_max_calls integer,
  p_budget_max_tokens bigint,
  p_budget_hard_cost_milli_cents bigint,
  p_lease_seconds integer DEFAULT 600
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ent public.product_entitlements;
  v_snapshot_count integer;
  v_job public.product_fulfillment_jobs;
  v_token uuid := gen_random_uuid();
  v_updated integer;
BEGIN
  IF p_policy_version IS NULL OR length(btrim(p_policy_version)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'policy_missing');
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

  -- Доказателството за плащане идва по двойки: право И order snapshot.
  SELECT count(*) INTO v_snapshot_count
    FROM public.order_snapshots
   WHERE purchase_kind = 'product'
     AND product_intake_id = v_ent.intake_id
     AND stripe_session_id = v_ent.stripe_session_id
     AND product_source_hash = v_ent.source_hash
     AND payment_status = 'paid';
  IF v_snapshot_count <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'half_state');
  END IF;

  SELECT * INTO v_job
    FROM public.product_fulfillment_jobs
   WHERE entitlement_id = p_entitlement_id
     FOR UPDATE;

  IF v_job.id IS NULL THEN
    INSERT INTO public.product_fulfillment_jobs (
      entitlement_id, user_id, intake_id, product_id, result_schema_version,
      source_document_id, source_hash, source_kind, source_char_count,
      source_char_unit, source_updated_at, source_page_count,
      generation_policy_version, budget_max_calls, budget_max_tokens,
      budget_hard_cost_milli_cents, stage, attempt, lease_token, lease_expires_at,
      idempotency_key
    ) VALUES (
      p_entitlement_id, p_user_id, v_ent.intake_id, v_ent.product_id, 2,
      v_ent.source_document_id, v_ent.source_hash, v_ent.source_kind,
      v_ent.source_char_count, v_ent.source_char_unit, v_ent.source_updated_at,
      v_ent.source_page_count, p_policy_version, COALESCE(p_budget_max_calls, 0),
      COALESCE(p_budget_max_tokens, 0), COALESCE(p_budget_hard_cost_milli_cents, 0),
      'queued', 1, v_token, now() + make_interval(secs => GREATEST(p_lease_seconds, 30)),
      p_idempotency_key
    )
    RETURNING * INTO v_job;
    RETURN jsonb_build_object(
      'ok', true, 'job_id', v_job.id, 'lease_token', v_token,
      'stage', v_job.stage, 'cursor', v_job.cursor, 'attempt', v_job.attempt,
      'created', true);
  END IF;

  IF v_job.generation_policy_version <> p_policy_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'policy_changed');
  END IF;
  IF v_job.source_hash <> v_ent.source_hash
     OR v_job.source_updated_at <> v_ent.source_updated_at
     OR v_job.source_kind <> v_ent.source_kind
     OR v_job.source_char_count <> v_ent.source_char_count
     OR v_job.source_char_unit <> v_ent.source_char_unit
     OR COALESCE(v_job.source_page_count, -1) <> COALESCE(v_ent.source_page_count, -1)
     OR v_job.product_id <> v_ent.product_id
     OR v_job.intake_id <> v_ent.intake_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'source_changed');
  END IF;
  IF v_job.stage = 'completed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_completed');
  END IF;
  IF v_job.lease_token IS NOT NULL AND v_job.lease_expires_at > now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'lease_active',
                              'stage', v_job.stage, 'cursor', v_job.cursor);
  END IF;
  IF v_job.attempt >= 20 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'attempts_exhausted');
  END IF;

  UPDATE public.product_fulfillment_jobs
     SET lease_token = v_token,
         lease_expires_at = now() + make_interval(secs => GREATEST(p_lease_seconds, 30)),
         attempt = attempt + 1,
         idempotency_key = p_idempotency_key,
         error_class = NULL,
         error_code = NULL,
         stage = CASE WHEN stage = 'failed' THEN 'queued' ELSE stage END,
         updated_at = now()
   WHERE id = v_job.id
     AND (lease_token IS NULL OR lease_expires_at <= now());
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> 1 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'lease_active');
  END IF;

  RETURN jsonb_build_object(
    'ok', true, 'job_id', v_job.id, 'lease_token', v_token,
    'stage', v_job.stage, 'cursor', v_job.cursor, 'attempt', v_job.attempt + 1,
    'created', false);
END $$;

-- Една завършена стъпка се записва точно веднъж и курсорът само напредва.
CREATE OR REPLACE FUNCTION public.record_product_job_checkpoint(
  p_job_id uuid,
  p_lease_token uuid,
  p_cursor_key text,
  p_stage text,
  p_next_cursor jsonb,
  p_usage_calls integer DEFAULT 0,
  p_usage_input_tokens bigint DEFAULT 0,
  p_usage_output_tokens bigint DEFAULT 0,
  p_usage_cost_milli_cents bigint DEFAULT 0,
  p_payload_digest text DEFAULT NULL,
  p_release_lease boolean DEFAULT true
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_job public.product_fulfillment_jobs;
  v_seq integer;
  v_inserted integer;
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

  SELECT COALESCE(max(sequence), -1) + 1 INTO v_seq
    FROM public.product_fulfillment_checkpoints
   WHERE job_id = p_job_id;

  INSERT INTO public.product_fulfillment_checkpoints (
    job_id, entitlement_id, cursor_key, stage, sequence, status,
    payload_digest, usage_calls, usage_input_tokens, usage_output_tokens
  ) VALUES (
    p_job_id, v_job.entitlement_id, p_cursor_key, p_stage, v_seq, 'complete',
    p_payload_digest, COALESCE(p_usage_calls, 0), COALESCE(p_usage_input_tokens, 0),
    COALESCE(p_usage_output_tokens, 0)
  )
  ON CONFLICT (job_id, cursor_key) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted = 0 THEN
    -- Същата стъпка вече е завършена: не се повтаря и не се начислява отново.
    RETURN jsonb_build_object('ok', true, 'already_recorded', true,
                              'stage', v_job.stage, 'cursor', v_job.cursor);
  END IF;

  UPDATE public.product_fulfillment_jobs
     SET stage = COALESCE(p_next_cursor ->> 'stage', stage),
         cursor = COALESCE(p_next_cursor, cursor),
         usage_calls = usage_calls + COALESCE(p_usage_calls, 0),
         usage_input_tokens = usage_input_tokens + COALESCE(p_usage_input_tokens, 0),
         usage_output_tokens = usage_output_tokens + COALESCE(p_usage_output_tokens, 0),
         usage_cost_milli_cents = usage_cost_milli_cents + COALESCE(p_usage_cost_milli_cents, 0),
         lease_token = CASE WHEN p_release_lease THEN NULL ELSE lease_token END,
         lease_expires_at = CASE WHEN p_release_lease THEN NULL ELSE lease_expires_at END,
         updated_at = now()
   WHERE id = p_job_id;

  RETURN jsonb_build_object('ok', true, 'already_recorded', false, 'sequence', v_seq);
END $$;

CREATE OR REPLACE FUNCTION public.fail_product_job(
  p_job_id uuid,
  p_lease_token uuid,
  p_error_class text,
  p_error_code text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_error_class IS NULL OR p_error_class NOT IN ('retryable', 'permanent') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_error_class');
  END IF;
  UPDATE public.product_fulfillment_jobs
     SET stage = CASE WHEN p_error_class = 'permanent' THEN 'failed' ELSE stage END,
         error_class = p_error_class,
         error_code = left(COALESCE(p_error_code, 'unknown'), 64),
         lease_token = NULL,
         lease_expires_at = NULL,
         updated_at = now()
   WHERE id = p_job_id
     AND lease_token = p_lease_token
     AND stage <> 'completed';
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_updated = 1);
END $$;

-- Браузърът вижда САМО безопасно състояние на СВОЯТА задача.
CREATE OR REPLACE FUNCTION public.product_job_status(p_entitlement_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
           'stage', j.stage,
           'processing', (j.lease_token IS NOT NULL AND j.lease_expires_at > now()),
           'attempt', j.attempt,
           'error_class', j.error_class,
           'updated_at', j.updated_at
         )
    FROM public.product_fulfillment_jobs j
   WHERE j.entitlement_id = p_entitlement_id
     AND j.user_id = auth.uid();
$$;

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.claim_product_job(uuid,uuid,text,text,integer,bigint,bigint,integer)',
    'public.record_product_job_checkpoint(uuid,uuid,text,text,jsonb,integer,bigint,bigint,bigint,text,boolean)',
    'public.fail_product_job(uuid,uuid,text,text)',
    'public.product_checkpoint_immutable()'
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
