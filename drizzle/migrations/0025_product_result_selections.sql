-- Stage 2B1C — paid correction selections, deterministic patch manifest and exactly one refinement.
-- Source only. Mandatory order: base -> 0018 -> 0019 -> 0020 -> 0021 -> 0022 -> 0023 -> 0024 -> 0025.
BEGIN;

-- Няма пренос на стари данни: етапът добавя ново състояние, а не преизчислява
-- вече платени резултати. Ако съществува готов резултат, миграцията спира.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.product_entitlements WHERE status = 'ready') THEN
    RAISE EXCEPTION 'product_result_selections_preapply_zero_ready_gate_failed';
  END IF;
END $$;

-- ------------------------------------------------------------------ Избор
CREATE TABLE public.product_result_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id uuid NOT NULL REFERENCES public.product_entitlements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  product_id text NOT NULL,
  result_schema_version integer NOT NULL,
  result_digest text NOT NULL,
  source_document_id uuid NOT NULL REFERENCES public.uploaded_contracts(id) ON DELETE RESTRICT,
  source_hash text NOT NULL,
  source_kind text NOT NULL,
  source_char_count integer NOT NULL,
  source_char_unit text NOT NULL,
  source_updated_at timestamptz NOT NULL,
  source_page_count integer,
  selection_version integer NOT NULL DEFAULT 0,
  decisions jsonb NOT NULL DEFAULT '[]'::jsonb,
  patch_output_hash text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (entitlement_id, result_digest),
  CHECK (product_id IN ('contract_improve','negotiation_package')),
  CHECK (result_schema_version = 2),
  CHECK (result_digest ~ '^[0-9a-f]{64}$'),
  CHECK (source_hash ~ '^[0-9a-f]{64}$'),
  CHECK (source_kind IN ('pdf','docx')),
  CHECK (source_char_count BETWEEN 80 AND 60000),
  CHECK (source_char_unit = 'unicode_code_points'),
  CHECK (source_page_count IS NULL OR source_page_count > 0),
  CHECK (selection_version >= 0),
  CHECK (jsonb_typeof(decisions) = 'array'),
  CHECK (patch_output_hash IS NULL OR patch_output_hash ~ '^[0-9a-f]{64}$')
);
GRANT SELECT ON public.product_result_selections TO authenticated;
GRANT ALL ON public.product_result_selections TO service_role;
ALTER TABLE public.product_result_selections ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_result_selections_owner_read ON public.product_result_selections
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Всяка версия на избора е неизменен запис: браузърът никога не пренаписва
-- платена истина, а стар таб не може да изтрие по-нов избор.
CREATE TABLE public.product_result_selection_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  selection_id uuid NOT NULL REFERENCES public.product_result_selections(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  selection_version integer NOT NULL,
  decisions jsonb NOT NULL,
  patch_output_hash text,
  idempotency_key text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (selection_id, selection_version),
  UNIQUE (selection_id, idempotency_key),
  CHECK (selection_version >= 1),
  CHECK (jsonb_typeof(decisions) = 'array'),
  CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 200),
  CHECK (patch_output_hash IS NULL OR patch_output_hash ~ '^[0-9a-f]{64}$')
);
GRANT SELECT ON public.product_result_selection_revisions TO authenticated;
GRANT ALL ON public.product_result_selection_revisions TO service_role;
ALTER TABLE public.product_result_selection_revisions ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_result_selection_revisions_owner_read ON public.product_result_selection_revisions
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.enforce_product_selection_revision_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  RAISE EXCEPTION 'product_result_selection_revision_immutable';
END $$;
CREATE TRIGGER product_result_selection_revision_immutable
  BEFORE UPDATE OR DELETE ON public.product_result_selection_revisions
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_selection_revision_immutable();

-- ------------------------------------------------------------- Уточнението
CREATE TABLE public.product_result_refinements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entitlement_id uuid NOT NULL REFERENCES public.product_entitlements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  product_id text NOT NULL,
  refinement_version integer NOT NULL,
  -- Очакваната версия идва от таба на потребителя: стар таб не може да уточни
  -- състояние, което не е видял.
  expected_refinement_version integer NOT NULL DEFAULT 0,
  base_result_digest text NOT NULL,
  instruction_digest text NOT NULL,
  idempotency_key text NOT NULL,
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 1,
  lease_token uuid,
  lease_expires_at timestamptz,
  result jsonb,
  result_canonical text,
  result_digest text,
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  UNIQUE (entitlement_id, idempotency_key),
  CHECK (product_id = 'negotiation_package'),
  CHECK (refinement_version = 1),
  CHECK (expected_refinement_version = 0),
  CHECK (base_result_digest ~ '^[0-9a-f]{64}$'),
  CHECK (instruction_digest ~ '^[0-9a-f]{64}$'),
  CHECK (length(btrim(idempotency_key)) BETWEEN 1 AND 200),
  CHECK (status IN ('pending','succeeded','failed')),
  CHECK (attempts BETWEEN 1 AND 20),
  CHECK (result_digest IS NULL OR result_digest ~ '^[0-9a-f]{64}$'),
  CHECK (result_canonical IS NULL OR result_canonical::jsonb = result),
  CHECK ((status = 'pending' AND result IS NULL AND result_digest IS NULL AND completed_at IS NULL AND error_code IS NULL)
      OR (status = 'failed' AND result IS NULL AND result_digest IS NULL AND lease_token IS NULL AND error_code IS NOT NULL)
      OR (status = 'succeeded' AND jsonb_typeof(result) = 'object' AND result_digest IS NOT NULL
          AND result_canonical IS NOT NULL AND completed_at IS NOT NULL
          AND lease_token IS NULL AND error_code IS NULL))
);
GRANT SELECT ON public.product_result_refinements TO authenticated;
GRANT ALL ON public.product_result_refinements TO service_role;
ALTER TABLE public.product_result_refinements ENABLE ROW LEVEL SECURITY;
CREATE POLICY product_result_refinements_owner_read ON public.product_result_refinements
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Точно ЕДНО успешно уточнение на платено право и най-много едно текущо.
CREATE UNIQUE INDEX product_result_refinements_one_success
  ON public.product_result_refinements (entitlement_id) WHERE status = 'succeeded';
CREATE UNIQUE INDEX product_result_refinements_one_pending
  ON public.product_result_refinements (entitlement_id) WHERE status = 'pending';

CREATE OR REPLACE FUNCTION public.enforce_product_refinement_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF OLD.status = 'succeeded' THEN
    RAISE EXCEPTION 'product_result_refinement_immutable';
  END IF;
  IF NEW.entitlement_id IS DISTINCT FROM OLD.entitlement_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.product_id IS DISTINCT FROM OLD.product_id
     OR NEW.refinement_version IS DISTINCT FROM OLD.refinement_version
     OR NEW.expected_refinement_version IS DISTINCT FROM OLD.expected_refinement_version
     OR NEW.base_result_digest IS DISTINCT FROM OLD.base_result_digest
     OR NEW.instruction_digest IS DISTINCT FROM OLD.instruction_digest
     OR NEW.idempotency_key IS DISTINCT FROM OLD.idempotency_key THEN
    RAISE EXCEPTION 'product_result_refinement_identity_immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER product_result_refinement_immutable
  BEFORE UPDATE ON public.product_result_refinements
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_refinement_immutable();

-- ----------------------------------- Трайно извикване за уточнението
-- Уточнението е ЕДНА ограничена стъпка, но е трайна и идемпотентна: заявката се
-- записва ПРЕДИ границата на доставчика и се приключва след нея. Прекъсване по
-- време на изчакване не води до второ платено извикване, а към отказ.
CREATE TABLE public.product_result_refinement_calls (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  refinement_id uuid NOT NULL REFERENCES public.product_result_refinements(id) ON DELETE CASCADE,
  entitlement_id uuid NOT NULL REFERENCES public.product_entitlements(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  call_id text NOT NULL,
  model text NOT NULL,
  status text NOT NULL DEFAULT 'reserved',
  request_digest text NOT NULL,
  response jsonb,
  response_canonical text,
  response_digest text,
  usage_input_tokens bigint,
  usage_output_tokens bigint,
  usage_cost_micro_usd bigint,
  reservation_token uuid,
  reservation_expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  -- Точно ЕДНО извикване на един опит за уточнение.
  UNIQUE (refinement_id),
  UNIQUE (refinement_id, call_id),
  CHECK (length(btrim(call_id)) BETWEEN 1 AND 240),
  CHECK (model IN ('google/gemini-3.1-flash-lite','google/gemini-3.8-flash')),
  CHECK (status IN ('reserved','complete')),
  CHECK (request_digest ~ '^[0-9a-f]{64}$'),
  CHECK (response_digest IS NULL OR response_digest ~ '^[0-9a-f]{64}$'),
  CHECK (response_canonical IS NULL OR response_canonical::jsonb = response),
  CHECK (response_digest IS NULL OR response_digest = encode(extensions.digest(convert_to(response_canonical,'UTF8'),'sha256'),'hex')),
  CHECK ((status = 'reserved' AND response IS NULL AND response_digest IS NULL AND completed_at IS NULL
          AND reservation_token IS NOT NULL AND reservation_expires_at IS NOT NULL)
      OR (status = 'complete' AND jsonb_typeof(response) = 'object' AND response_digest IS NOT NULL
          AND response_canonical IS NOT NULL AND completed_at IS NOT NULL
          AND usage_input_tokens >= 0 AND usage_output_tokens >= 0 AND usage_cost_micro_usd >= 0))
);
-- Записът съдържа изход от модел: чете се САМО от служебната роля.
GRANT ALL ON public.product_result_refinement_calls TO service_role;
ALTER TABLE public.product_result_refinement_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.product_result_refinement_calls FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.enforce_product_refinement_call_immutable()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'product_result_refinement_call_immutable'; END IF;
  IF OLD.status = 'complete'
     OR NEW.refinement_id IS DISTINCT FROM OLD.refinement_id
     OR NEW.entitlement_id IS DISTINCT FROM OLD.entitlement_id
     OR NEW.user_id IS DISTINCT FROM OLD.user_id
     OR NEW.call_id IS DISTINCT FROM OLD.call_id
     OR NEW.model IS DISTINCT FROM OLD.model
     OR NEW.request_digest IS DISTINCT FROM OLD.request_digest THEN
    RAISE EXCEPTION 'product_result_refinement_call_immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER product_result_refinement_call_immutable
  BEFORE UPDATE OR DELETE ON public.product_result_refinement_calls
  FOR EACH ROW EXECUTE FUNCTION public.enforce_product_refinement_call_immutable();

-- ------------------------------------------------------- Сървърни функции
-- Изборът се записва САМО оттук: точен собственик, точен готов резултат, точен
-- източник и задължителна очаквана версия. Стар таб получава конфликт.
CREATE OR REPLACE FUNCTION public.save_product_result_selection(
  p_user_id uuid, p_entitlement_id uuid, p_result_digest text, p_expected_version integer,
  p_decisions jsonb, p_patch_output_hash text, p_idempotency_key text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.product_entitlements; s public.product_result_selections; r public.product_result_selection_revisions; next_version integer;
BEGIN
  IF jsonb_typeof(p_decisions) <> 'array' OR p_result_digest !~ '^[0-9a-f]{64}$'
     OR p_expected_version IS NULL OR p_expected_version < 0
     OR length(btrim(COALESCE(p_idempotency_key,''))) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  SELECT * INTO e FROM public.product_entitlements WHERE id = p_entitlement_id FOR SHARE;
  IF e.id IS NULL OR e.user_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF e.status <> 'ready' OR e.result_schema_version <> 2
     OR e.product_id NOT IN ('contract_improve','negotiation_package') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'result_not_selectable');
  END IF;

  SELECT * INTO s FROM public.product_result_selections
    WHERE entitlement_id = p_entitlement_id AND result_digest = p_result_digest FOR UPDATE;
  IF s.id IS NULL THEN
    INSERT INTO public.product_result_selections (
      entitlement_id, user_id, product_id, result_schema_version, result_digest,
      source_document_id, source_hash, source_kind, source_char_count, source_char_unit,
      source_updated_at, source_page_count
    ) VALUES (
      e.id, e.user_id, e.product_id, 2, p_result_digest,
      e.source_document_id, lower(e.source_hash), e.source_kind, e.source_char_count,
      e.source_char_unit, e.source_updated_at, e.source_page_count
    ) RETURNING * INTO s;
  END IF;

  -- Един и същ ключ за идемпотентност връща ЕДИН И СЪЩ резултат.
  SELECT * INTO r FROM public.product_result_selection_revisions
    WHERE selection_id = s.id AND idempotency_key = p_idempotency_key;
  IF r.id IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'replay', true, 'selection_version', r.selection_version,
      'decisions', r.decisions, 'patch_output_hash', r.patch_output_hash);
  END IF;

  IF s.selection_version <> p_expected_version THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'version_conflict',
      'selection_version', s.selection_version, 'decisions', s.decisions,
      'patch_output_hash', s.patch_output_hash);
  END IF;

  next_version := s.selection_version + 1;
  INSERT INTO public.product_result_selection_revisions (
    selection_id, user_id, selection_version, decisions, patch_output_hash, idempotency_key
  ) VALUES (s.id, s.user_id, next_version, p_decisions, p_patch_output_hash, p_idempotency_key);
  UPDATE public.product_result_selections
    SET selection_version = next_version, decisions = p_decisions,
        patch_output_hash = p_patch_output_hash, updated_at = now()
    WHERE id = s.id RETURNING * INTO s;
  RETURN jsonb_build_object('ok', true, 'replay', false, 'selection_version', s.selection_version,
    'decisions', s.decisions, 'patch_output_hash', s.patch_output_hash);
END $$;
REVOKE ALL ON FUNCTION public.save_product_result_selection(uuid,uuid,text,integer,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_product_result_selection(uuid,uuid,text,integer,jsonb,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.load_product_result_state(
  p_user_id uuid, p_entitlement_id uuid, p_result_digest text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.product_entitlements; s public.product_result_selections;
BEGIN
  SELECT * INTO e FROM public.product_entitlements WHERE id = p_entitlement_id;
  IF e.id IS NULL OR e.user_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  SELECT * INTO s FROM public.product_result_selections
    WHERE entitlement_id = p_entitlement_id AND result_digest = p_result_digest;
  RETURN jsonb_build_object('ok', true,
    'selection_version', COALESCE(s.selection_version, 0),
    'decisions', COALESCE(s.decisions, '[]'::jsonb),
    'patch_output_hash', s.patch_output_hash,
    'refinement', (SELECT jsonb_build_object('status', x.status, 'result', x.result,
        'result_digest', x.result_digest, 'base_result_digest', x.base_result_digest,
        'completed_at', x.completed_at)
      FROM public.product_result_refinements x
      WHERE x.entitlement_id = p_entitlement_id AND x.status = 'succeeded'),
    'refinement_history', COALESCE((SELECT jsonb_agg(jsonb_build_object('status', h.status,
        'instruction_digest', h.instruction_digest, 'error_code', h.error_code,
        'created_at', h.created_at, 'completed_at', h.completed_at) ORDER BY h.created_at)
      FROM public.product_result_refinements h WHERE h.entitlement_id = p_entitlement_id), '[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION public.load_product_result_state(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.load_product_result_state(uuid,uuid,text) TO service_role;

-- Уточнението се заявява атомарно под наем. Провал НЕ изразходва включеното
-- уточнение: само успешен запис заема единствения успешен ред.
CREATE OR REPLACE FUNCTION public.begin_product_result_refinement(
  p_user_id uuid, p_entitlement_id uuid, p_base_result_digest text,
  p_expected_refinement_version integer, p_instruction_digest text,
  p_idempotency_key text, p_lease_seconds integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE e public.product_entitlements; x public.product_result_refinements; token uuid;
        used integer; known integer; current_digest text;
BEGIN
  IF p_base_result_digest !~ '^[0-9a-f]{64}$' OR p_instruction_digest !~ '^[0-9a-f]{64}$'
     OR p_expected_refinement_version IS NULL OR p_expected_refinement_version <> 0
     OR length(btrim(COALESCE(p_idempotency_key,''))) = 0
     OR p_lease_seconds IS NULL OR p_lease_seconds NOT BETWEEN 30 AND 900 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  SELECT * INTO e FROM public.product_entitlements WHERE id = p_entitlement_id FOR SHARE;
  IF e.id IS NULL OR e.user_id IS DISTINCT FROM p_user_id THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_found');
  END IF;
  IF e.status <> 'ready' OR e.result_schema_version <> 2 OR e.product_id <> 'negotiation_package' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_refinable');
  END IF;

  SELECT count(*) INTO used FROM public.product_result_refinements
    WHERE entitlement_id = p_entitlement_id AND status = 'succeeded';
  SELECT count(*) INTO known FROM public.product_result_selections
    WHERE entitlement_id = p_entitlement_id;
  SELECT s.result_digest INTO current_digest FROM public.product_result_selections s
    WHERE s.entitlement_id = p_entitlement_id ORDER BY s.updated_at DESC LIMIT 1;

  -- Един и същ ключ + един и същ пълен вход е повторение; същият ключ с друг
  -- очакван резултат, версия или указание е конфликт.
  SELECT * INTO x FROM public.product_result_refinements
    WHERE entitlement_id = p_entitlement_id AND idempotency_key = p_idempotency_key FOR UPDATE;
  IF x.id IS NOT NULL THEN
    IF x.base_result_digest <> p_base_result_digest
       OR x.expected_refinement_version <> p_expected_refinement_version
       OR x.instruction_digest <> p_instruction_digest THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'idempotency_conflict',
        'current_refinement_version', used, 'current_result_digest', current_digest);
    END IF;
    IF x.status = 'succeeded' THEN
      RETURN jsonb_build_object('ok', true, 'replay', true, 'refinement_id', x.id,
        'refinement_version', x.refinement_version, 'result', x.result, 'result_digest', x.result_digest);
    END IF;
    IF x.status = 'pending' AND x.lease_expires_at > now() THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'lease_active');
    END IF;
    IF x.attempts >= 20 THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'too_many_attempts');
    END IF;
    token := gen_random_uuid();
    UPDATE public.product_result_refinements
      SET status = 'pending', lease_token = token, lease_expires_at = now() + make_interval(secs => p_lease_seconds),
          attempts = x.attempts + 1, error_code = NULL, updated_at = now()
      WHERE id = x.id RETURNING * INTO x;
    RETURN jsonb_build_object('ok', true, 'replay', false, 'refinement_id', x.id,
      'lease_token', x.lease_token, 'attempts', x.attempts);
  END IF;

  IF used > 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'refinement_used',
      'current_refinement_version', used, 'current_result_digest', current_digest);
  END IF;
  -- Оптимистична съгласуваност: точната очаквана версия и точният известен
  -- резултат. Стар таб получава конфликт, а не тихо уточнение.
  IF used <> p_expected_refinement_version
     OR (known > 0 AND NOT EXISTS (SELECT 1 FROM public.product_result_selections
           WHERE entitlement_id = p_entitlement_id AND result_digest = p_base_result_digest)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'version_conflict',
      'current_refinement_version', used, 'current_result_digest', current_digest);
  END IF;

  IF EXISTS (SELECT 1 FROM public.product_result_refinements
             WHERE entitlement_id = p_entitlement_id AND status = 'pending'
               AND lease_expires_at > now()) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'lease_active');
  END IF;
  -- Изтекъл наем се затваря като провал, а не се изтрива: историята остава.
  UPDATE public.product_result_refinements
    SET status = 'failed', lease_token = NULL, lease_expires_at = NULL,
        error_code = COALESCE(error_code, 'lease_expired'), updated_at = now()
    WHERE entitlement_id = p_entitlement_id AND status = 'pending' AND lease_expires_at <= now();
  token := gen_random_uuid();
  INSERT INTO public.product_result_refinements (
    entitlement_id, user_id, product_id, refinement_version, expected_refinement_version,
    base_result_digest, instruction_digest, idempotency_key, status, lease_token, lease_expires_at
  ) VALUES (
    e.id, e.user_id, e.product_id, 1, p_expected_refinement_version, p_base_result_digest,
    p_instruction_digest, p_idempotency_key, 'pending', token,
    now() + make_interval(secs => p_lease_seconds)
  ) RETURNING * INTO x;
  RETURN jsonb_build_object('ok', true, 'replay', false, 'refinement_id', x.id,
    'lease_token', x.lease_token, 'attempts', x.attempts);
END $$;
REVOKE ALL ON FUNCTION public.begin_product_result_refinement(uuid,uuid,text,integer,text,text,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.begin_product_result_refinement(uuid,uuid,text,integer,text,text,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.complete_product_result_refinement(
  p_refinement_id uuid, p_lease_token uuid, p_result jsonb, p_result_canonical text, p_result_digest text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE x public.product_result_refinements;
BEGIN
  SELECT * INTO x FROM public.product_result_refinements WHERE id = p_refinement_id FOR UPDATE;
  IF x.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF x.status = 'succeeded' THEN
    IF x.result_digest = p_result_digest THEN
      RETURN jsonb_build_object('ok', true, 'replay', true, 'result', x.result, 'result_digest', x.result_digest);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'already_completed');
  END IF;
  IF x.status <> 'pending' OR x.lease_token IS DISTINCT FROM p_lease_token OR x.lease_expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'lease_invalid');
  END IF;
  IF jsonb_typeof(p_result) <> 'object' OR p_result_digest !~ '^[0-9a-f]{64}$'
     OR p_result_canonical IS NULL OR p_result_canonical::jsonb <> p_result THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_result');
  END IF;
  UPDATE public.product_result_refinements
    SET status = 'succeeded', result = p_result, result_canonical = p_result_canonical,
        result_digest = p_result_digest, lease_token = NULL, lease_expires_at = NULL,
        error_code = NULL, completed_at = now(), updated_at = now()
    WHERE id = x.id RETURNING * INTO x;
  RETURN jsonb_build_object('ok', true, 'replay', false, 'result', x.result, 'result_digest', x.result_digest);
END $$;
REVOKE ALL ON FUNCTION public.complete_product_result_refinement(uuid,uuid,jsonb,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_product_result_refinement(uuid,uuid,jsonb,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.fail_product_result_refinement(
  p_refinement_id uuid, p_lease_token uuid, p_error_code text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE x public.product_result_refinements;
BEGIN
  IF length(btrim(COALESCE(p_error_code,''))) = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'invalid_request');
  END IF;
  SELECT * INTO x FROM public.product_result_refinements WHERE id = p_refinement_id FOR UPDATE;
  IF x.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF x.status = 'succeeded' THEN RETURN jsonb_build_object('ok', false, 'reason', 'already_completed'); END IF;
  IF x.status = 'pending' AND (x.lease_token IS DISTINCT FROM p_lease_token) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'lease_invalid');
  END IF;
  -- Провалът НЕ изразходва включеното уточнение: единственият успешен ред
  -- остава свободен и потребителят може да опита отново.
  UPDATE public.product_result_refinements
    SET status = 'failed', lease_token = NULL, lease_expires_at = NULL,
        error_code = p_error_code, updated_at = now()
    WHERE id = x.id;
  RETURN jsonb_build_object('ok', true, 'refinement_used', false);
END $$;
REVOKE ALL ON FUNCTION public.fail_product_result_refinement(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fail_product_result_refinement(uuid,uuid,text) TO service_role;

-- Заявяване на извикването ПРЕДИ доставчика. Повторното заявяване със същия
-- вход връща записания отговор; заявено, но неприключено извикване НИКОГА не се
-- изпълнява втори път.
CREATE OR REPLACE FUNCTION public.reserve_product_result_refinement_call(
  p_refinement_id uuid, p_lease_token uuid, p_call_id text, p_model text, p_request_digest text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE x public.product_result_refinements; c public.product_result_refinement_calls; token uuid;
BEGIN
  IF length(btrim(COALESCE(p_call_id,''))) = 0 OR p_request_digest !~ '^[0-9a-f]{64}$'
     OR p_model NOT IN ('google/gemini-3.1-flash-lite','google/gemini-3.8-flash') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'call_invalid');
  END IF;
  SELECT * INTO x FROM public.product_result_refinements WHERE id = p_refinement_id FOR UPDATE;
  IF x.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF x.status <> 'pending' OR x.lease_token IS DISTINCT FROM p_lease_token
     OR x.lease_expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'lease_invalid');
  END IF;
  SELECT * INTO c FROM public.product_result_refinement_calls
    WHERE refinement_id = p_refinement_id FOR UPDATE;
  IF c.id IS NOT NULL THEN
    IF c.call_id <> p_call_id OR c.model <> p_model OR c.request_digest <> p_request_digest THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'call_conflict');
    END IF;
    IF c.status = 'complete' THEN
      IF c.response_canonical::jsonb <> c.response
         OR c.response_digest <> encode(extensions.digest(convert_to(c.response_canonical,'UTF8'),'sha256'),'hex') THEN
        RETURN jsonb_build_object('ok', false, 'reason', 'stored_call_invalid');
      END IF;
      RETURN jsonb_build_object('ok', true, 'status', 'complete',
        'response', jsonb_build_object('output', c.response -> 'output', 'inputTokens', c.usage_input_tokens,
          'outputTokens', c.usage_output_tokens, 'elapsedMs', 0));
    END IF;
    RETURN jsonb_build_object('ok', true, 'status', 'pending', 'reason', 'call_completion_unknown');
  END IF;
  token := gen_random_uuid();
  INSERT INTO public.product_result_refinement_calls (
    refinement_id, entitlement_id, user_id, call_id, model, request_digest,
    reservation_token, reservation_expires_at
  ) VALUES (
    x.id, x.entitlement_id, x.user_id, p_call_id, p_model, p_request_digest,
    token, LEAST(x.lease_expires_at, now() + interval '10 minutes')
  );
  RETURN jsonb_build_object('ok', true, 'status', 'acquired', 'reservation_token', token);
END $$;
REVOKE ALL ON FUNCTION public.reserve_product_result_refinement_call(uuid,uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reserve_product_result_refinement_call(uuid,uuid,text,text,text) TO service_role;

-- Приключване на извикването с изрични тавани по вход, изход, общо и цена.
CREATE OR REPLACE FUNCTION public.complete_product_result_refinement_call(
  p_refinement_id uuid, p_lease_token uuid, p_call_id text, p_reservation_token uuid,
  p_request_digest text, p_response jsonb, p_response_canonical text, p_response_digest text,
  p_usage_input_tokens bigint, p_usage_output_tokens bigint, p_usage_cost_micro_usd bigint,
  p_max_input_tokens bigint, p_max_output_tokens bigint, p_max_total_tokens bigint,
  p_max_cost_micro_usd bigint
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE x public.product_result_refinements; c public.product_result_refinement_calls;
BEGIN
  SELECT * INTO x FROM public.product_result_refinements WHERE id = p_refinement_id FOR UPDATE;
  IF x.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'not_found'); END IF;
  IF x.status <> 'pending' OR x.lease_token IS DISTINCT FROM p_lease_token
     OR x.lease_expires_at <= now() THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'lease_invalid');
  END IF;
  SELECT * INTO c FROM public.product_result_refinement_calls
    WHERE refinement_id = p_refinement_id AND call_id = p_call_id FOR UPDATE;
  IF c.id IS NULL OR c.request_digest <> p_request_digest
     OR c.reservation_token IS DISTINCT FROM p_reservation_token THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'call_conflict');
  END IF;
  IF c.status = 'complete' THEN
    IF c.response_digest <> p_response_digest OR c.response <> p_response
       OR c.response_canonical <> p_response_canonical
       OR c.usage_input_tokens <> p_usage_input_tokens
       OR c.usage_output_tokens <> p_usage_output_tokens
       OR c.usage_cost_micro_usd <> p_usage_cost_micro_usd THEN
      RETURN jsonb_build_object('ok', false, 'reason', 'replay_mismatch');
    END IF;
    RETURN jsonb_build_object('ok', true, 'already_recorded', true);
  END IF;
  IF jsonb_typeof(p_response) <> 'object' OR p_response_digest !~ '^[0-9a-f]{64}$'
     OR p_response_canonical IS NULL OR p_response_canonical::jsonb <> p_response
     OR p_response_digest <> encode(extensions.digest(convert_to(p_response_canonical,'UTF8'),'sha256'),'hex')
     OR p_usage_input_tokens < 0 OR p_usage_output_tokens < 0 OR p_usage_cost_micro_usd < 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'call_invalid');
  END IF;
  IF p_max_input_tokens IS NULL OR p_max_output_tokens IS NULL OR p_max_total_tokens IS NULL
     OR p_max_cost_micro_usd IS NULL
     OR p_usage_input_tokens > p_max_input_tokens
     OR p_usage_output_tokens > p_max_output_tokens
     OR p_usage_input_tokens + p_usage_output_tokens > p_max_total_tokens
     OR p_usage_cost_micro_usd > p_max_cost_micro_usd THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'budget_exceeded');
  END IF;
  UPDATE public.product_result_refinement_calls
    SET status = 'complete', response = p_response, response_canonical = p_response_canonical,
        response_digest = p_response_digest, usage_input_tokens = p_usage_input_tokens,
        usage_output_tokens = p_usage_output_tokens, usage_cost_micro_usd = p_usage_cost_micro_usd,
        reservation_token = NULL, reservation_expires_at = NULL, completed_at = now()
    WHERE id = c.id AND status = 'reserved';
  RETURN jsonb_build_object('ok', true, 'already_recorded', false);
END $$;
REVOKE ALL ON FUNCTION public.complete_product_result_refinement_call(uuid,uuid,text,uuid,text,jsonb,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.complete_product_result_refinement_call(uuid,uuid,text,uuid,text,jsonb,text,text,bigint,bigint,bigint,bigint,bigint,bigint,bigint) TO service_role;

COMMIT;
