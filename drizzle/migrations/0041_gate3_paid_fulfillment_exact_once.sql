-- ===========================================================================
-- GATE 3 — ТОЧНО ЕДИН ПЛАТЕН РЕЗУЛТАТ ОТ ЕДНА ПОКУПКА
-- ---------------------------------------------------------------------------
-- Тази миграция НЕ пипа вече приложените функции от 0018–0026. Тя добавя
-- липсващата трайна граница: състояние „неизяснено“ (reconciliation) и
-- ИСТИНСКИ окончателни/повторими семантики за разрешаването му.
--
-- Защо е нужно: когато извикването на доставчика е заявено, но резултатът му
-- НЕ е доказано записан (загубен отговор, изтекло време, прекъсване), нито
-- едно от съществуващите състояния не е вярно:
--   * „повторим провал“ би позволил втора заявка по същата самоличност;
--   * „окончателен провал“ на уточнението би ОСВОБОДИЛ включеното уточнение и
--     би позволил второ платено извикване на модел.
--
-- Затова тук:
--   1) неизясненото състояние се вписва САМО от служебната роля и САМО от
--      притежателя на наема;
--   2) редът се ЗАМРАЗЯВА до разрешаване от оператор;
--   3) нова задача/ново уточнение за същото право е невъзможно;
--   4) `consume` е ОКОНЧАТЕЛЕН: базата прави ново извикване на доставчик
--      невъзможно за същото право/курсор/извикване, а задачата остава в
--      терминално състояние за ръчен преглед — без измислен резултат и без
--      възстановяване на платено право;
--   5) `release` е допустим САМО когато НЯМА трайно доказателство за заявено
--      или приключено извикване (тоест доказано е, че доставчикът не е
--      изпълнявал нищо) и атомарно връща точното състояние, нужно за безопасен
--      повторен опит. Във всички останали случаи `release` се ОТКАЗВА —
--      по-добре отказ, отколкото лъжа;
--   6) повторно същото решение на оператор е идемпотентно, а различно решение
--      по същия предмет се отказва;
--   7) одитът НЕ приема свободен текст: само затворени кодове и строго
--      валидиран непрозрачен номер на случай.
--
-- Никъде не се записва текст на документ, изход на модел или лични данни.
--
-- Тази миграция е ИЗХОДЕН КОД и НЕ Е ПРИЛОЖЕНА. Предпоставка: base -> 0018 ->
-- 0019 -> 0020 -> 0021 -> 0022 -> 0023 -> 0024 -> 0025 -> 0026.
-- ===========================================================================
BEGIN;

-- Предпоставките се проверяват, вместо да се предполагат.
DO $$ BEGIN
  IF to_regclass('public.product_fulfillment_jobs') IS NULL
     OR to_regclass('public.product_result_refinements') IS NULL
     OR to_regclass('public.product_generation_calls') IS NULL
     OR to_regclass('public.product_result_refinement_calls') IS NULL THEN
    RAISE EXCEPTION 'gate3_reconciliation_prerequisite_missing';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- 1) Нови, само допълващи колони. Съществуващите CHECK ограничения остават
--    непокътнати: състоянието `status`/`stage` НЕ се разширява.
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
-- 2) Одит БЕЗ свободен текст: затворени кодове и непрозрачен номер на случай.
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
  reason_code text,
  ticket_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (kind IN ('job','refinement')),
  CHECK (event IN ('marked','resolved')),
  CHECK (length(btrim(code)) BETWEEN 1 AND 60),
  CHECK (call_id IS NULL OR length(btrim(call_id)) BETWEEN 1 AND 240),
  -- Причината е ЗАТВОРЕН код, не описание. Свободен текст е невъзможен.
  CHECK (reason_code IS NULL OR reason_code IN (
    'provider_no_execution_proven','provider_execution_proven',
    'provider_outcome_unprovable')),
  -- Номерът на случая е непрозрачен идентификатор, не прозаично съдържание.
  CHECK (ticket_ref IS NULL OR ticket_ref ~ '^[A-Z]{2,6}-[0-9]{1,10}$')
);
GRANT ALL ON public.product_reconciliation_events TO service_role;
ALTER TABLE public.product_reconciliation_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_reconciliation_events FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS product_reconciliation_events_entitlement
  ON public.product_reconciliation_events (entitlement_id, created_at DESC);

-- Решението на оператора е ЕДНО на предмет: повторното е идемпотентно,
-- различното се отказва (fail closed).
CREATE TABLE IF NOT EXISTS public.product_reconciliation_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  subject_id uuid NOT NULL,
  entitlement_id uuid NOT NULL REFERENCES public.product_entitlements(id) ON DELETE CASCADE,
  resolution text NOT NULL,
  reason_code text NOT NULL,
  ticket_ref text,
  call_id text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, subject_id),
  CHECK (kind IN ('job','refinement')),
  CHECK (resolution IN ('release','consume')),
  CHECK (reason_code IN (
    'provider_no_execution_proven','provider_execution_proven',
    'provider_outcome_unprovable')),
  CHECK (ticket_ref IS NULL OR ticket_ref ~ '^[A-Z]{2,6}-[0-9]{1,10}$'),
  CHECK (call_id IS NULL OR length(btrim(call_id)) BETWEEN 1 AND 240),
  -- `release` е допустим САМО при доказано НЕизпълнение на доставчика.
  CHECK (resolution <> 'release' OR reason_code = 'provider_no_execution_proven')
);
GRANT ALL ON public.product_reconciliation_resolutions TO service_role;
ALTER TABLE public.product_reconciliation_resolutions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_reconciliation_resolutions FORCE ROW LEVEL SECURITY;

-- Окончателно изразходвано извикване. Наличието на ред тук прави ново
-- извикване на доставчик по същото право НЕВЪЗМОЖНО на ниво база.
CREATE TABLE IF NOT EXISTS public.product_reconciliation_terminal_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL,
  entitlement_id uuid NOT NULL REFERENCES public.product_entitlements(id) ON DELETE CASCADE,
  subject_id uuid NOT NULL,
  call_id text,
  cursor_key text,
  reason_code text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, subject_id),
  CHECK (kind IN ('job','refinement')),
  CHECK (reason_code IN ('provider_execution_proven','provider_outcome_unprovable')),
  CHECK (call_id IS NULL OR length(btrim(call_id)) BETWEEN 1 AND 240),
  CHECK (cursor_key IS NULL OR length(btrim(cursor_key)) BETWEEN 1 AND 240)
);
GRANT ALL ON public.product_reconciliation_terminal_calls TO service_role;
ALTER TABLE public.product_reconciliation_terminal_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_reconciliation_terminal_calls FORCE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS product_reconciliation_terminal_calls_entitlement
  ON public.product_reconciliation_terminal_calls (entitlement_id, kind);

-- ---------------------------------------------------------------------------
-- 3) Замразяване: докато има неразрешено неизяснено състояние, редът НЕ се
--    променя и НЕ се трие. Вдигането става само през посветените функции,
--    които вдигат локален флаг в СЪЩАТА транзакция.
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
  -- ОКОНЧАТЕЛНО изразходвана задача не се връща в работа по никакъв път:
  -- нито нов наем, нито друг етап.
  IF EXISTS (
    SELECT 1 FROM public.product_reconciliation_terminal_calls t
    WHERE t.kind = 'job' AND t.subject_id = OLD.id
  ) AND (NEW.stage <> 'failed' OR NEW.lease_token IS NOT NULL) THEN
    RAISE EXCEPTION 'product_job_terminally_consumed';
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
  -- Окончателно изразходвано уточнение никога не става успешно.
  IF EXISTS (
    SELECT 1 FROM public.product_reconciliation_terminal_calls t
    WHERE t.kind = 'refinement' AND t.subject_id = OLD.id
  ) AND NEW.status <> 'failed' THEN
    RAISE EXCEPTION 'product_refinement_terminally_consumed';
  END IF;
  RETURN NEW;
END $$;

-- Нова задача не може да се роди при неразрешено или окончателно състояние.
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
  IF EXISTS (
    SELECT 1 FROM public.product_reconciliation_terminal_calls t
    WHERE t.kind = 'job' AND t.entitlement_id = NEW.entitlement_id
  ) THEN
    RAISE EXCEPTION 'product_job_terminally_consumed';
  END IF;
  RETURN NEW;
END $$;

-- Ново уточнение не може да се роди при неразрешено, окончателно ИЛИ ВИСЯЩО
-- състояние на извикване. Последното важи и когато вписването на неизясненото
-- състояние е пропаднало: истината се чете от самите извиквания.
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
  IF EXISTS (
    SELECT 1 FROM public.product_reconciliation_terminal_calls t
    WHERE t.kind = 'refinement' AND t.entitlement_id = NEW.entitlement_id
  ) THEN
    RAISE EXCEPTION 'product_refinement_terminally_consumed';
  END IF;
  -- Сираче: заявено извикване без приключване ИЛИ приключено извикване без
  -- успешно записано уточнение. И двете значат, че включеното уточнение вече
  -- може да е било платено — ново извикване е недопустимо без оператор.
  IF EXISTS (
    SELECT 1
    FROM public.product_result_refinement_calls c
    JOIN public.product_result_refinements r ON r.id = c.refinement_id
    WHERE c.entitlement_id = NEW.entitlement_id
      AND (c.status = 'reserved' OR (c.status = 'complete' AND r.status <> 'succeeded'))
      AND NOT EXISTS (
        SELECT 1 FROM public.product_reconciliation_resolutions x
        WHERE x.kind = 'refinement' AND x.subject_id = r.id
      )
  ) THEN
    RAISE EXCEPTION 'product_refinement_call_unresolved';
  END IF;
  RETURN NEW;
END $$;

-- Ново извикване на доставчик по окончателно изразходвано право е невъзможно.
CREATE OR REPLACE FUNCTION public.enforce_product_generation_call_not_consumed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.product_reconciliation_terminal_calls t
    WHERE t.kind = 'job' AND t.entitlement_id = NEW.entitlement_id
  ) THEN
    RAISE EXCEPTION 'product_generation_call_terminally_consumed';
  END IF;
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.enforce_product_refinement_call_not_consumed()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.product_reconciliation_terminal_calls t
    WHERE t.kind = 'refinement' AND t.entitlement_id = NEW.entitlement_id
  ) THEN
    RAISE EXCEPTION 'product_refinement_call_terminally_consumed';
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

DROP TRIGGER IF EXISTS product_generation_call_not_consumed ON public.product_generation_calls;
CREATE TRIGGER product_generation_call_not_consumed
  BEFORE INSERT ON public.product_generation_calls
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_generation_call_not_consumed();

DROP TRIGGER IF EXISTS product_refinement_call_not_consumed ON public.product_result_refinement_calls;
CREATE TRIGGER product_refinement_call_not_consumed
  BEFORE INSERT ON public.product_result_refinement_calls
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_refinement_call_not_consumed();

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
--    Освен неразрешеното състояние, тя показва и висящо/окончателно извикване,
--    защото и то блокира нов опит.
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
    ),
    'terminal', (
      SELECT jsonb_agg(t.kind ORDER BY t.kind)
      FROM public.product_reconciliation_terminal_calls t
      WHERE t.entitlement_id = p_entitlement_id
    ),
    'orphan_refinement_call', (
      SELECT true
      FROM public.product_result_refinement_calls c
      JOIN public.product_result_refinements r ON r.id = c.refinement_id
      WHERE c.entitlement_id = p_entitlement_id AND r.user_id = p_user_id
        AND (c.status = 'reserved' OR (c.status = 'complete' AND r.status <> 'succeeded'))
        AND NOT EXISTS (
          SELECT 1 FROM public.product_reconciliation_resolutions x
          WHERE x.kind = 'refinement' AND x.subject_id = r.id
        )
      LIMIT 1
    )
  );
$$;

-- ---------------------------------------------------------------------------
-- 6) Разрешаване от оператор. Затворен код на причината и непрозрачен номер на
--    случай. Никакъв свободен текст. Никакво възстановяване на платено право и
--    никакъв измислен резултат.
--
--    consume  = доказано или недоказуемо изпълнено извикване → ОКОНЧАТЕЛНО.
--               Базата прави следващо извикване невъзможно, а задачата/
--               уточнението остават терминални за ръчен преглед.
--    release  = ДОКАЗАНО неизпълнен доставчик. Допустим САМО когато НЯМА трайно
--               извикване (нито заявено, нито приключено). Ако има — отказ.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.resolve_product_reconciliation(text, uuid, text, text);

CREATE OR REPLACE FUNCTION public.resolve_product_reconciliation(
  p_kind text,
  p_subject_id uuid,
  p_resolution text,
  p_reason_code text,
  p_ticket_ref text DEFAULT NULL
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_job public.product_fulfillment_jobs;
  v_ref public.product_result_refinements;
  v_prev public.product_reconciliation_resolutions;
  v_entitlement uuid;
  v_user uuid;
  v_call_id text;
  v_cursor_key text;
  v_call_exists boolean;
BEGIN
  IF p_kind NOT IN ('job','refinement') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_kind');
  END IF;
  IF p_resolution NOT IN ('release','consume') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_resolution');
  END IF;
  IF p_reason_code IS NULL OR p_reason_code NOT IN (
       'provider_no_execution_proven','provider_execution_proven',
       'provider_outcome_unprovable') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_reason_code');
  END IF;
  IF p_ticket_ref IS NOT NULL AND p_ticket_ref !~ '^[A-Z]{2,6}-[0-9]{1,10}$' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_ticket_ref');
  END IF;
  IF p_resolution = 'release' AND p_reason_code <> 'provider_no_execution_proven' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'release_requires_proof');
  END IF;
  IF p_resolution = 'consume' AND p_reason_code = 'provider_no_execution_proven' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_reason_code');
  END IF;

  -- Повторението на СЪЩОТО решение е идемпотентно; различното се отказва.
  SELECT * INTO v_prev FROM public.product_reconciliation_resolutions
   WHERE kind = p_kind AND subject_id = p_subject_id FOR UPDATE;
  IF v_prev.id IS NOT NULL THEN
    IF v_prev.resolution = p_resolution AND v_prev.reason_code = p_reason_code
       AND COALESCE(v_prev.ticket_ref,'') = COALESCE(p_ticket_ref,'') THEN
      RETURN jsonb_build_object('ok', true, 'replay', true, 'kind', p_kind,
        'resolution', v_prev.resolution);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'resolution_conflict');
  END IF;

  IF p_kind = 'job' THEN
    SELECT * INTO v_job FROM public.product_fulfillment_jobs WHERE id = p_subject_id FOR UPDATE;
    IF v_job.id IS NULL OR v_job.reconciliation_required_at IS NULL
       OR v_job.reconciliation_resolved_at IS NOT NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_unresolved');
    END IF;
    v_entitlement := v_job.entitlement_id;
    v_user := v_job.user_id;
    v_call_id := v_job.reconciliation_call_id;
    v_cursor_key := public.product_job_cursor_key(v_job.cursor);
    -- Трайно доказателство: съществува ли извикване по този курсор?
    SELECT EXISTS (
      SELECT 1 FROM public.product_generation_calls c
      WHERE c.job_id = v_job.id
        AND (v_call_id IS NULL OR c.call_id = v_call_id OR c.cursor_key = v_cursor_key)
    ) INTO v_call_exists;

    IF p_resolution = 'release' THEN
      -- Безопасен повторен опит е възможен САМО когато няма нито едно трайно
      -- извикване по този курсор. Иначе отказ — по-добре ръчно, отколкото
      -- второ платено извикване.
      IF v_call_exists THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'release_not_provable');
      END IF;
      PERFORM set_config('app.product_reconcile', 'on', true);
      UPDATE public.product_fulfillment_jobs
         SET reconciliation_resolved_at = now(),
             lease_token = NULL,
             lease_expires_at = NULL,
             error_class = 'retryable',
             error_code = 'reconciliation_released',
             updated_at = now()
       WHERE id = p_subject_id;
      PERFORM set_config('app.product_reconcile', 'off', true);
    ELSE
      -- ОКОНЧАТЕЛНО: първо се вписва забраната, после задачата става терминална.
      INSERT INTO public.product_reconciliation_terminal_calls (
        kind, entitlement_id, subject_id, call_id, cursor_key, reason_code
      ) VALUES ('job', v_entitlement, p_subject_id, v_call_id, v_cursor_key, p_reason_code);
      PERFORM set_config('app.product_reconcile', 'on', true);
      UPDATE public.product_fulfillment_jobs
         SET reconciliation_resolved_at = now(),
             stage = 'failed',
             lease_token = NULL,
             lease_expires_at = NULL,
             error_class = 'permanent',
             error_code = 'reconciliation_consumed',
             updated_at = now()
       WHERE id = p_subject_id;
      PERFORM set_config('app.product_reconcile', 'off', true);
    END IF;
  ELSE
    SELECT * INTO v_ref FROM public.product_result_refinements WHERE id = p_subject_id FOR UPDATE;
    IF v_ref.id IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
    END IF;
    IF v_ref.status = 'succeeded' THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'already_succeeded');
    END IF;
    v_entitlement := v_ref.entitlement_id;
    v_user := v_ref.user_id;
    v_call_id := v_ref.reconciliation_call_id;
    SELECT EXISTS (
      SELECT 1 FROM public.product_result_refinement_calls c
      WHERE c.refinement_id = v_ref.id
    ) INTO v_call_exists;

    IF p_resolution = 'release' THEN
      IF v_call_exists THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'release_not_provable');
      END IF;
      -- Без трайно извикване включеното уточнение НЕ е било платено: редът се
      -- затваря като провал, който не изразходва уточнението.
      PERFORM set_config('app.product_reconcile', 'on', true);
      UPDATE public.product_result_refinements
         SET reconciliation_resolved_at = COALESCE(reconciliation_required_at, now()),
             status = 'failed',
             error_code = COALESCE(error_code, 'reconciliation_released'),
             lease_token = NULL,
             lease_expires_at = NULL,
             updated_at = now()
       WHERE id = p_subject_id;
      PERFORM set_config('app.product_reconcile', 'off', true);
    ELSE
      INSERT INTO public.product_reconciliation_terminal_calls (
        kind, entitlement_id, subject_id, call_id, cursor_key, reason_code
      ) VALUES ('refinement', v_entitlement, p_subject_id, v_call_id, NULL, p_reason_code);
      PERFORM set_config('app.product_reconcile', 'on', true);
      UPDATE public.product_result_refinements
         SET reconciliation_resolved_at = COALESCE(reconciliation_required_at, now()),
             status = 'failed',
             error_code = COALESCE(error_code, 'reconciliation_consumed'),
             lease_token = NULL,
             lease_expires_at = NULL,
             updated_at = now()
       WHERE id = p_subject_id;
      PERFORM set_config('app.product_reconcile', 'off', true);
    END IF;
  END IF;

  INSERT INTO public.product_reconciliation_resolutions (
    kind, subject_id, entitlement_id, resolution, reason_code, ticket_ref, call_id
  ) VALUES (p_kind, p_subject_id, v_entitlement, p_resolution, p_reason_code,
            p_ticket_ref, v_call_id);

  INSERT INTO public.product_reconciliation_events (
    kind, subject_id, entitlement_id, user_id, event, code, call_id, reason_code, ticket_ref
  ) VALUES (p_kind, p_subject_id, v_entitlement, v_user, 'resolved', p_resolution,
            v_call_id, p_reason_code, p_ticket_ref);

  RETURN jsonb_build_object('ok', true, 'replay', false, 'kind', p_kind,
    'resolution', p_resolution);
END $$;

-- ---------------------------------------------------------------------------
-- 7) Достъп: САМО служебната роля. Браузърът никога не вписва и не разрешава
--    неизяснено състояние.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.mark_product_job_reconciliation(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_product_refinement_reconciliation(uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.product_reconciliation_state(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.resolve_product_reconciliation(text, uuid, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.mark_product_job_reconciliation(uuid, uuid, text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.mark_product_refinement_reconciliation(uuid, uuid, text, text) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.product_reconciliation_state(uuid, uuid) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_product_reconciliation(text, uuid, text, text, text) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_product_job_reconciliation(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.mark_product_refinement_reconciliation(uuid, uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.product_reconciliation_state(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_product_reconciliation(text, uuid, text, text, text) TO service_role;

COMMIT;
