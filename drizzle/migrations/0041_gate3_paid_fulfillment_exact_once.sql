-- ===========================================================================
-- GATE 3 — ТОЧНО ЕДИН ПЛАТЕН РЕЗУЛТАТ ОТ ЕДНА ПОКУПКА
-- ---------------------------------------------------------------------------
-- Тази миграция НЕ пипа вече приложените функции от 0018–0026. Тя добавя
-- ЕДНА липсваща трайна граница: състояние „неизяснено“ (reconciliation).
--
-- Защо е нужно: когато извикването на доставчика е заявено, но резултатът му
-- НЕ е доказано записан (загубен отговор, изтекло време, прекъсване), нито
-- едно от съществуващите състояния не е вярно:
--   * „повторим провал“ би позволил втора заявка по същата самоличност;
--   * „окончателен провал“ на уточнението би ОСВОБОДИЛ включеното уточнение и
--     би позволил второ платено извикване на модел.
-- Затова добавяме изрично неизяснено състояние, което:
--   1) се вписва САМО от служебната роля и САМО от притежателя на наема;
--   2) ЗАМРАЗЯВА реда — никаква промяна, докато оператор не го разреши;
--   3) блокира нова задача/ново уточнение за същото платено право;
--   4) НИКОГА не връща, не възстановява и не преиздава платено право.
--
-- Никъде не се записва текст на документ, изход на модел или лични данни —
-- само затворени кодове и идентификатори на извикване.
--
-- Тази миграция е ИЗХОДЕН КОД и НЕ Е ПРИЛОЖЕНА.
-- ===========================================================================

-- ---------------------------------------------------------------------------
-- 1) Нови, само допълващи колони. Съществуващите CHECK ограничения остават
--    непокътнати: състоянието `status` НЕ се разширява, а наемът НЕ се пипа.
-- ---------------------------------------------------------------------------
ALTER TABLE public.product_fulfillment_jobs
  ADD COLUMN IF NOT EXISTS reconciliation_required_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciliation_code text,
  ADD COLUMN IF NOT EXISTS reconciliation_call_id text,
  ADD COLUMN IF NOT EXISTS reconciliation_resolved_at timestamptz;

ALTER TABLE public.product_result_refinements
  ADD COLUMN IF NOT EXISTS reconciliation_required_at timestamptz,
  ADD COLUMN IF NOT EXISTS reconciliation_code text,
  ADD COLUMN IF NOT EXISTS reconciliation_call_id text,
  ADD COLUMN IF NOT EXISTS reconciliation_resolved_at timestamptz;

-- Затворен списък на причините: никога свободен текст от доставчик или грешка.
DO $$ BEGIN
  ALTER TABLE public.product_fulfillment_jobs
    ADD CONSTRAINT product_fulfillment_jobs_reconciliation_shape CHECK (
      (reconciliation_required_at IS NULL AND reconciliation_code IS NULL
        AND reconciliation_call_id IS NULL AND reconciliation_resolved_at IS NULL)
      OR (reconciliation_required_at IS NOT NULL AND reconciliation_code IN (
        'call_completion_unknown','call_record_unknown','provider_outcome_unknown'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.product_result_refinements
    ADD CONSTRAINT product_result_refinements_reconciliation_shape CHECK (
      (reconciliation_required_at IS NULL AND reconciliation_code IS NULL
        AND reconciliation_call_id IS NULL AND reconciliation_resolved_at IS NULL)
      OR (reconciliation_required_at IS NOT NULL AND reconciliation_code IN (
        'call_completion_unknown','call_record_unknown','provider_outcome_unknown',
        'persist_unknown','output_unusable'))
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Най-много ЕДНО неразрешено неизяснено състояние на платено право.
CREATE UNIQUE INDEX IF NOT EXISTS product_fulfillment_jobs_one_unresolved
  ON public.product_fulfillment_jobs (entitlement_id)
  WHERE reconciliation_required_at IS NOT NULL AND reconciliation_resolved_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS product_result_refinements_one_unresolved
  ON public.product_result_refinements (entitlement_id)
  WHERE reconciliation_required_at IS NOT NULL AND reconciliation_resolved_at IS NULL;

-- ---------------------------------------------------------------------------
-- 2) Одитна следа на неизяснените състояния. Само служебна роля.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_reconciliation_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  subject_id uuid NOT NULL,
  entitlement_id uuid NOT NULL REFERENCES public.product_entitlements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  event text NOT NULL,
  code text NOT NULL,
  call_id text,
  operator_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind IN ('job','refinement')),
  CHECK (event IN ('marked','resolved')),
  CHECK (length(btrim(code)) BETWEEN 1 AND 60),
  CHECK (call_id IS NULL OR length(btrim(call_id)) BETWEEN 1 AND 240),
  CHECK (operator_note IS NULL OR length(btrim(operator_note)) BETWEEN 1 AND 500)
);
GRANT ALL ON public.product_reconciliation_events TO service_role;
ALTER TABLE public.product_reconciliation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_reconciliation_events FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS product_reconciliation_events_entitlement
  ON public.product_reconciliation_events (entitlement_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3) Замразяване: докато има неразрешено неизяснено състояние, редът НЕ се
--    променя и НЕ се трие. Вдигането става само през разрешаващата функция,
--    която вдига локален флаг в СЪЩАТА транзакция.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.enforce_product_job_reconciliation_freeze()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.reconciliation_required_at IS NOT NULL AND OLD.reconciliation_resolved_at IS NULL THEN
      RAISE EXCEPTION 'product_job_reconciliation_frozen';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.reconciliation_required_at IS NOT NULL AND OLD.reconciliation_resolved_at IS NULL
     AND COALESCE(current_setting('app.product_reconcile', true), '') <> 'on' THEN
    RAISE EXCEPTION 'product_job_reconciliation_frozen';
  END IF;
  -- Вписването и вдигането минават САМО през посветените функции.
  IF (NEW.reconciliation_required_at IS DISTINCT FROM OLD.reconciliation_required_at
      OR NEW.reconciliation_code IS DISTINCT FROM OLD.reconciliation_code
      OR NEW.reconciliation_call_id IS DISTINCT FROM OLD.reconciliation_call_id
      OR NEW.reconciliation_resolved_at IS DISTINCT FROM OLD.reconciliation_resolved_at)
     AND COALESCE(current_setting('app.product_reconcile', true), '') <> 'on' THEN
    RAISE EXCEPTION 'product_job_reconciliation_guarded';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_product_refinement_reconciliation_freeze()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.reconciliation_required_at IS NOT NULL AND OLD.reconciliation_resolved_at IS NULL THEN
      RAISE EXCEPTION 'product_refinement_reconciliation_frozen';
    END IF;
    RETURN OLD;
  END IF;
  IF OLD.reconciliation_required_at IS NOT NULL AND OLD.reconciliation_resolved_at IS NULL
     AND COALESCE(current_setting('app.product_reconcile', true), '') <> 'on' THEN
    RAISE EXCEPTION 'product_refinement_reconciliation_frozen';
  END IF;
  IF (NEW.reconciliation_required_at IS DISTINCT FROM OLD.reconciliation_required_at
      OR NEW.reconciliation_code IS DISTINCT FROM OLD.reconciliation_code
      OR NEW.reconciliation_call_id IS DISTINCT FROM OLD.reconciliation_call_id
      OR NEW.reconciliation_resolved_at IS DISTINCT FROM OLD.reconciliation_resolved_at)
     AND COALESCE(current_setting('app.product_reconcile', true), '') <> 'on' THEN
    RAISE EXCEPTION 'product_refinement_reconciliation_guarded';
  END IF;
  RETURN NEW;
END $$;

-- Нова задача/ново уточнение не може да се роди, докато същото платено право
-- има неразрешено неизяснено състояние.
CREATE OR REPLACE FUNCTION public.enforce_product_job_no_unresolved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.product_fulfillment_jobs j
    WHERE j.entitlement_id = NEW.entitlement_id
      AND j.reconciliation_required_at IS NOT NULL
      AND j.reconciliation_resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION 'product_job_reconciliation_pending';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_product_refinement_no_unresolved()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.product_result_refinements r
    WHERE r.entitlement_id = NEW.entitlement_id
      AND r.reconciliation_required_at IS NOT NULL
      AND r.reconciliation_resolved_at IS NULL
  ) THEN
    RAISE EXCEPTION 'product_refinement_reconciliation_pending';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS product_job_reconciliation_freeze ON public.product_fulfillment_jobs;
CREATE TRIGGER product_job_reconciliation_freeze
  BEFORE UPDATE OR DELETE ON public.product_fulfillment_jobs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_job_reconciliation_freeze();

DROP TRIGGER IF EXISTS product_job_no_unresolved ON public.product_fulfillment_jobs;
CREATE TRIGGER product_job_no_unresolved
  BEFORE INSERT ON public.product_fulfillment_jobs
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_job_no_unresolved();

DROP TRIGGER IF EXISTS product_refinement_reconciliation_freeze ON public.product_result_refinements;
CREATE TRIGGER product_refinement_reconciliation_freeze
  BEFORE UPDATE OR DELETE ON public.product_result_refinements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_refinement_reconciliation_freeze();

DROP TRIGGER IF EXISTS product_refinement_no_unresolved ON public.product_result_refinements;
CREATE TRIGGER product_refinement_no_unresolved
  BEFORE INSERT ON public.product_result_refinements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_refinement_no_unresolved();

-- ---------------------------------------------------------------------------
-- 4) Вписване на неизяснено състояние. Само притежателят на наема.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_product_job_reconciliation(
  p_job_id uuid,
  p_lease_token uuid,
  p_code text,
  p_call_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_job public.product_fulfillment_jobs;
BEGIN
  IF p_job_id IS NULL OR p_lease_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_arguments');
  END IF;
  SELECT * INTO v_job FROM public.product_fulfillment_jobs WHERE id = p_job_id FOR UPDATE;
  IF v_job.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  -- Вече неизяснено състояние е УСПЕХ за същия наем: повторното извикване не
  -- създава второ състояние и не променя записаната причина.
  IF v_job.reconciliation_required_at IS NOT NULL AND v_job.reconciliation_resolved_at IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'replay', true, 'code', v_job.reconciliation_code);
  END IF;
  IF v_job.lease_token IS DISTINCT FROM p_lease_token THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'lease_mismatch');
  END IF;

  PERFORM set_config('app.product_reconcile', 'on', true);
  UPDATE public.product_fulfillment_jobs
     SET reconciliation_required_at = now(),
         reconciliation_code = p_code,
         reconciliation_call_id = p_call_id,
         reconciliation_resolved_at = NULL,
         updated_at = now()
   WHERE id = p_job_id;
  PERFORM set_config('app.product_reconcile', 'off', true);

  INSERT INTO public.product_reconciliation_events (
    kind, subject_id, entitlement_id, user_id, event, code, call_id
  ) VALUES ('job', p_job_id, v_job.entitlement_id, v_job.user_id, 'marked', p_code, p_call_id);

  RETURN jsonb_build_object('ok', true, 'replay', false, 'code', p_code);
END $$;

CREATE OR REPLACE FUNCTION public.mark_product_refinement_reconciliation(
  p_refinement_id uuid,
  p_lease_token uuid,
  p_code text,
  p_call_id text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ref public.product_result_refinements;
BEGIN
  IF p_refinement_id IS NULL OR p_lease_token IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_arguments');
  END IF;
  SELECT * INTO v_ref FROM public.product_result_refinements WHERE id = p_refinement_id FOR UPDATE;
  IF v_ref.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF v_ref.reconciliation_required_at IS NOT NULL AND v_ref.reconciliation_resolved_at IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'replay', true, 'code', v_ref.reconciliation_code);
  END IF;
  -- Успешно уточнение НИКОГА не се обявява за неизяснено: резултатът е доказан.
  IF v_ref.status = 'succeeded' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'already_succeeded');
  END IF;
  IF v_ref.lease_token IS DISTINCT FROM p_lease_token THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'lease_mismatch');
  END IF;

  PERFORM set_config('app.product_reconcile', 'on', true);
  UPDATE public.product_result_refinements
     SET reconciliation_required_at = now(),
         reconciliation_code = p_code,
         reconciliation_call_id = p_call_id,
         reconciliation_resolved_at = NULL,
         updated_at = now()
   WHERE id = p_refinement_id;
  PERFORM set_config('app.product_reconcile', 'off', true);

  INSERT INTO public.product_reconciliation_events (
    kind, subject_id, entitlement_id, user_id, event, code, call_id
  ) VALUES ('refinement', p_refinement_id, v_ref.entitlement_id, v_ref.user_id, 'marked', p_code, p_call_id);

  RETURN jsonb_build_object('ok', true, 'replay', false, 'code', p_code);
END $$;

-- ---------------------------------------------------------------------------
-- 5) Детерминирано ЧЕТЕНЕ преди всяка променлива стъпка. Функцията НЕ пише.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.product_reconciliation_state(
  p_user_id uuid,
  p_entitlement_id uuid
) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT jsonb_build_object(
    'ok', true,
    'job', (
      SELECT jsonb_build_object('job_id', j.id, 'code', j.reconciliation_code)
      FROM public.product_fulfillment_jobs j
      WHERE j.entitlement_id = p_entitlement_id AND j.user_id = p_user_id
        AND j.reconciliation_required_at IS NOT NULL
        AND j.reconciliation_resolved_at IS NULL
      LIMIT 1
    ),
    'refinement', (
      SELECT jsonb_build_object('refinement_id', r.id, 'code', r.reconciliation_code)
      FROM public.product_result_refinements r
      WHERE r.entitlement_id = p_entitlement_id AND r.user_id = p_user_id
        AND r.reconciliation_required_at IS NOT NULL
        AND r.reconciliation_resolved_at IS NULL
      LIMIT 1
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- 6) Разрешаване от оператор. Изисква ИЗРИЧНО решение и бележка; никога не
--    възстановява платено право и никога не подава резултат от модел.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.resolve_product_reconciliation(
  p_kind text,
  p_subject_id uuid,
  p_resolution text,
  p_operator_note text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_job public.product_fulfillment_jobs;
  v_ref public.product_result_refinements;
BEGIN
  IF p_kind NOT IN ('job','refinement') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_kind');
  END IF;
  -- `release` връща реда в работа (изяснено: доставчикът НЕ е произвел резултат).
  -- `consume` затваря опита окончателно (изяснено: извикването е било платено).
  IF p_resolution NOT IN ('release','consume') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_resolution');
  END IF;
  IF p_operator_note IS NULL OR length(btrim(p_operator_note)) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'operator_note_required');
  END IF;

  IF p_kind = 'job' THEN
    SELECT * INTO v_job FROM public.product_fulfillment_jobs WHERE id = p_subject_id FOR UPDATE;
    IF v_job.id IS NULL OR v_job.reconciliation_required_at IS NULL
       OR v_job.reconciliation_resolved_at IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_unresolved');
    END IF;
    PERFORM set_config('app.product_reconcile', 'on', true);
    UPDATE public.product_fulfillment_jobs
       SET reconciliation_resolved_at = now(),
           updated_at = now()
     WHERE id = p_subject_id;
    PERFORM set_config('app.product_reconcile', 'off', true);
    INSERT INTO public.product_reconciliation_events (
      kind, subject_id, entitlement_id, user_id, event, code, call_id, operator_note
    ) VALUES ('job', p_subject_id, v_job.entitlement_id, v_job.user_id, 'resolved',
              p_resolution, v_job.reconciliation_call_id, btrim(p_operator_note));
    RETURN jsonb_build_object('ok', true, 'kind', 'job', 'resolution', p_resolution);
  END IF;

  SELECT * INTO v_ref FROM public.product_result_refinements WHERE id = p_subject_id FOR UPDATE;
  IF v_ref.id IS NULL OR v_ref.reconciliation_required_at IS NULL
     OR v_ref.reconciliation_resolved_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_unresolved');
  END IF;
  PERFORM set_config('app.product_reconcile', 'on', true);
  UPDATE public.product_result_refinements
     SET reconciliation_resolved_at = now(),
         status = CASE WHEN p_resolution = 'consume' THEN 'failed' ELSE status END,
         error_code = CASE WHEN p_resolution = 'consume'
                           THEN COALESCE(error_code, v_ref.reconciliation_code) ELSE error_code END,
         lease_token = CASE WHEN p_resolution = 'consume' THEN NULL ELSE lease_token END,
         lease_expires_at = CASE WHEN p_resolution = 'consume' THEN NULL ELSE lease_expires_at END,
         updated_at = now()
   WHERE id = p_subject_id;
  PERFORM set_config('app.product_reconcile', 'off', true);
  INSERT INTO public.product_reconciliation_events (
    kind, subject_id, entitlement_id, user_id, event, code, call_id, operator_note
  ) VALUES ('refinement', p_subject_id, v_ref.entitlement_id, v_ref.user_id, 'resolved',
            p_resolution, v_ref.reconciliation_call_id, btrim(p_operator_note));
  RETURN jsonb_build_object('ok', true, 'kind', 'refinement', 'resolution', p_resolution);
END $$;

-- ---------------------------------------------------------------------------
-- 7) Достъп: САМО служебната роля. Браузърът никога не вписва и не разрешава
--    неизяснено състояние.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.mark_product_job_reconciliation(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_product_refinement_reconciliation(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.product_reconciliation_state(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_product_reconciliation(text, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_product_job_reconciliation(uuid, uuid, text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_product_refinement_reconciliation(uuid, uuid, text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.product_reconciliation_state(uuid, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_product_reconciliation(text, uuid, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_product_job_reconciliation(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_product_refinement_reconciliation(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.product_reconciliation_state(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_product_reconciliation(text, uuid, text, text) TO service_role;
