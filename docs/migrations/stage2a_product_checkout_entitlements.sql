-- P0 Stage 2A — ЗА ПРЕГЛЕД, НЕ Е ПРИЛОЖЕНА.
--
-- Точна покупка на еднократен продукт, обвързан с точно един документ, и
-- доказана платена привилегия (entitlement). Файлът е тук нарочно: в този етап
-- не изпълняваме SQL. Прилага се отделно, след преглед.
--
-- Миграцията е ДОБАВЯЩА и повторно изпълнима (idempotent). Не сваля таблици,
-- не променя типове и не пипа съществуващи редове. Записите се правят само от
-- service_role (Edge код) — браузърът никога не пише статус или резултат.

-- ---------------------------------------------------------------------------
-- A) Заявка (intake) преди плащане
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_checkout_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  uploaded_contract_id uuid REFERENCES public.uploaded_contracts(id) ON DELETE SET NULL,
  source_hash text NOT NULL,
  source_updated_at timestamptz,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  stripe_session_id text,
  environment text NOT NULL,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  refund_version text NOT NULL,
  ai_notice_version text NOT NULL,
  terms_accepted boolean NOT NULL DEFAULT false,
  ai_ack_accepted boolean NOT NULL DEFAULT false,
  immediate_performance_consent boolean NOT NULL DEFAULT false,
  withdrawal_loss_acknowledged boolean NOT NULL DEFAULT false,
  consent_recorded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours'
);

DO $$ BEGIN
  ALTER TABLE public.product_checkout_intakes
    ADD CONSTRAINT product_checkout_intakes_product_ck
    CHECK (product_id IN ('contract_check', 'contract_improve', 'negotiation_package'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.product_checkout_intakes
    ADD CONSTRAINT product_checkout_intakes_status_ck
    CHECK (status IN ('pending', 'checkout_created', 'paid', 'expired'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.product_checkout_intakes
    ADD CONSTRAINT product_checkout_intakes_env_ck
    CHECK (environment IN ('live', 'sandbox'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.product_checkout_intakes
    ADD CONSTRAINT product_checkout_intakes_source_hash_ck
    CHECK (length(btrim(source_hash)) > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS product_checkout_intakes_user_request_uq
  ON public.product_checkout_intakes(user_id, request_id);
CREATE UNIQUE INDEX IF NOT EXISTS product_checkout_intakes_session_uq
  ON public.product_checkout_intakes(stripe_session_id)
  WHERE stripe_session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS product_checkout_intakes_user_status_idx
  ON public.product_checkout_intakes(user_id, status, created_at DESC);

GRANT SELECT ON public.product_checkout_intakes TO authenticated;
GRANT ALL ON public.product_checkout_intakes TO service_role;

ALTER TABLE public.product_checkout_intakes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_checkout_intakes_own_select ON public.product_checkout_intakes;
CREATE POLICY product_checkout_intakes_own_select
  ON public.product_checkout_intakes FOR SELECT TO authenticated
  USING (user_id = auth.uid());
-- Умишлено НЯМА INSERT/UPDATE/DELETE политики за клиента.

-- ---------------------------------------------------------------------------
-- B) Платена привилегия за точно един продукт
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  stripe_session_id text NOT NULL,
  stripe_price_lookup_key text NOT NULL,
  environment text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'eur',
  source_document_id uuid REFERENCES public.uploaded_contracts(id) ON DELETE SET NULL,
  source_hash text NOT NULL,
  source_updated_at timestamptz,
  intake_id uuid REFERENCES public.product_checkout_intakes(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'paid',
  result_schema_version integer,
  result jsonb,
  processing_token uuid,
  attempt_count integer NOT NULL DEFAULT 0,
  processing_started_at timestamptz,
  fulfilled_at timestamptz,
  last_error_code text,
  refinements_included integer NOT NULL DEFAULT 0,
  refinements_used integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

DO $$ BEGIN
  ALTER TABLE public.product_entitlements
    ADD CONSTRAINT product_entitlements_product_ck
    CHECK (product_id IN ('contract_check', 'contract_improve', 'negotiation_package'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.product_entitlements
    ADD CONSTRAINT product_entitlements_status_ck
    CHECK (status IN (
      'paid', 'processing', 'ready', 'failed',
      'refinement_ready', 'refinement_processing', 'exhausted', 'refunded'
    ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.product_entitlements
    ADD CONSTRAINT product_entitlements_env_ck CHECK (environment IN ('live', 'sandbox'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.product_entitlements
    ADD CONSTRAINT product_entitlements_amount_ck CHECK (amount_cents > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.product_entitlements
    ADD CONSTRAINT product_entitlements_currency_ck CHECK (lower(currency) = 'eur');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.product_entitlements
    ADD CONSTRAINT product_entitlements_source_hash_ck
    CHECK (length(btrim(source_hash)) > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Точният брой включени уточнения по продукт: 0 / 0 / 1.
DO $$ BEGIN
  ALTER TABLE public.product_entitlements
    ADD CONSTRAINT product_entitlements_refinements_ck CHECK (
      refinements_used >= 0
      AND refinements_used <= refinements_included
      AND (
        (product_id = 'negotiation_package' AND refinements_included = 1)
        OR (product_id IN ('contract_check', 'contract_improve') AND refinements_included = 0)
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Резултат може да има само в готовите състояния.
DO $$ BEGIN
  ALTER TABLE public.product_entitlements
    ADD CONSTRAINT product_entitlements_result_state_ck CHECK (
      (result IS NULL AND result_schema_version IS NULL)
      OR status IN ('ready', 'refinement_ready', 'refinement_processing', 'exhausted', 'refunded')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS product_entitlements_session_uq
  ON public.product_entitlements(stripe_session_id);
CREATE INDEX IF NOT EXISTS product_entitlements_user_status_idx
  ON public.product_entitlements(user_id, status, created_at DESC);
CREATE INDEX IF NOT EXISTS product_entitlements_source_idx
  ON public.product_entitlements(source_document_id);

GRANT SELECT ON public.product_entitlements TO authenticated;
GRANT ALL ON public.product_entitlements TO service_role;

ALTER TABLE public.product_entitlements ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS product_entitlements_own_select ON public.product_entitlements;
CREATE POLICY product_entitlements_own_select
  ON public.product_entitlements FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
-- Умишлено НЯМА клиентски INSERT/UPDATE/DELETE политики.

-- ---------------------------------------------------------------------------
-- C) Затягане на order_snapshots
-- ---------------------------------------------------------------------------
-- Потребителят не може да си „декларира“ покупка.
DROP POLICY IF EXISTS order_snapshots_user_insert ON public.order_snapshots;

ALTER TABLE public.order_snapshots ADD COLUMN IF NOT EXISTS product_id text;
ALTER TABLE public.order_snapshots ADD COLUMN IF NOT EXISTS terms_accepted boolean;
ALTER TABLE public.order_snapshots ADD COLUMN IF NOT EXISTS immediate_performance_consent boolean;
ALTER TABLE public.order_snapshots ADD COLUMN IF NOT EXISTS withdrawal_loss_acknowledged boolean;
ALTER TABLE public.order_snapshots ADD COLUMN IF NOT EXISTS consent_recorded_at timestamptz;

DO $$
DECLARE
  ck text;
BEGIN
  SELECT conname INTO ck
  FROM pg_constraint
  WHERE conrelid = 'public.order_snapshots'::regclass
    AND contype = 'c'
    AND pg_get_constraintdef(oid) ILIKE '%purchase_kind%';
  IF ck IS NOT NULL THEN
    EXECUTE format('ALTER TABLE public.order_snapshots DROP CONSTRAINT %I', ck);
  END IF;
  ALTER TABLE public.order_snapshots
    ADD CONSTRAINT order_snapshots_purchase_kind_ck CHECK (purchase_kind IN (
      'team', 'subscription', 'strict_unlock', 'branding',
      'entry_pack', 'topup', 'one_time', 'product', 'unknown'
    ));
END $$;

-- Продуктовият snapshot задължително носи точния продукт.
DO $$ BEGIN
  ALTER TABLE public.order_snapshots
    ADD CONSTRAINT order_snapshots_product_id_ck CHECK (
      purchase_kind <> 'product'
      OR product_id IN ('contract_check', 'contract_improve', 'negotiation_package')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- D) Атомарни функции, достъпни само за service_role
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.record_product_entitlement(
  p_user_id uuid,
  p_product_id text,
  p_session_id text,
  p_lookup_key text,
  p_environment text,
  p_amount_cents integer,
  p_source_document_id uuid,
  p_source_hash text,
  p_source_updated_at timestamptz,
  p_intake_id uuid,
  p_refinements_included integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  existing public.product_entitlements;
  new_id uuid;
BEGIN
  SELECT * INTO existing FROM public.product_entitlements
    WHERE stripe_session_id = p_session_id;

  IF existing.id IS NOT NULL THEN
    -- Повторно доставяне на същото събитие: успех без нов запис.
    IF existing.user_id IS DISTINCT FROM p_user_id
       OR existing.product_id IS DISTINCT FROM p_product_id
       OR existing.environment IS DISTINCT FROM p_environment
       OR existing.amount_cents IS DISTINCT FROM p_amount_cents
       OR existing.source_hash IS DISTINCT FROM p_source_hash THEN
      RAISE EXCEPTION 'product_entitlement_conflict';
    END IF;
    RETURN jsonb_build_object('ok', true, 'created', false, 'entitlement_id', existing.id);
  END IF;

  INSERT INTO public.product_entitlements (
    user_id, product_id, stripe_session_id, stripe_price_lookup_key, environment,
    amount_cents, currency, source_document_id, source_hash, source_updated_at,
    intake_id, status, refinements_included
  ) VALUES (
    p_user_id, p_product_id, p_session_id, p_lookup_key, p_environment,
    p_amount_cents, 'eur', p_source_document_id, p_source_hash, p_source_updated_at,
    p_intake_id, 'paid', COALESCE(p_refinements_included, 0)
  ) RETURNING id INTO new_id;

  UPDATE public.product_checkout_intakes
     SET status = 'paid', stripe_session_id = p_session_id, updated_at = now()
   WHERE id = p_intake_id AND user_id = p_user_id;

  RETURN jsonb_build_object('ok', true, 'created', true, 'entitlement_id', new_id);
END $$;

CREATE OR REPLACE FUNCTION public.begin_product_fulfillment(
  p_entitlement_id uuid,
  p_user_id uuid,
  p_stale_after interval DEFAULT interval '10 minutes'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  tok uuid := gen_random_uuid();
  updated integer;
BEGIN
  UPDATE public.product_entitlements
     SET status = CASE WHEN status = 'refinement_ready' THEN 'refinement_processing' ELSE 'processing' END,
         processing_token = tok,
         processing_started_at = now(),
         attempt_count = attempt_count + 1,
         updated_at = now()
   WHERE id = p_entitlement_id
     AND user_id = p_user_id
     AND (
       status IN ('paid', 'failed', 'refinement_ready')
       OR (status IN ('processing', 'refinement_processing')
           AND processing_started_at < now() - p_stale_after)
     );
  GET DIAGNOSTICS updated = ROW_COUNT;
  IF updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_claimable');
  END IF;
  RETURN jsonb_build_object('ok', true, 'processing_token', tok);
END $$;

CREATE OR REPLACE FUNCTION public.complete_product_fulfillment(
  p_entitlement_id uuid,
  p_user_id uuid,
  p_product_id text,
  p_source_hash text,
  p_processing_token uuid,
  p_result jsonb,
  p_result_schema_version integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  updated integer;
BEGIN
  UPDATE public.product_entitlements
     SET status = 'ready',
         result = p_result,
         result_schema_version = p_result_schema_version,
         fulfilled_at = now(),
         processing_token = NULL,
         last_error_code = NULL,
         updated_at = now()
   WHERE id = p_entitlement_id
     AND user_id = p_user_id
     AND product_id = p_product_id
     AND source_hash = p_source_hash
     AND processing_token = p_processing_token;
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', updated = 1);
END $$;

CREATE OR REPLACE FUNCTION public.fail_product_fulfillment(
  p_entitlement_id uuid,
  p_user_id uuid,
  p_processing_token uuid,
  p_error_code text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  updated integer;
BEGIN
  UPDATE public.product_entitlements
     SET status = 'failed',
         last_error_code = left(COALESCE(p_error_code, 'unknown'), 64),
         processing_token = NULL,
         updated_at = now()
   WHERE id = p_entitlement_id
     AND user_id = p_user_id
     AND processing_token = p_processing_token;
  GET DIAGNOSTICS updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', updated = 1);
END $$;

CREATE OR REPLACE FUNCTION public.claim_product_refinement(
  p_entitlement_id uuid,
  p_user_id uuid
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  updated integer;
BEGIN
  UPDATE public.product_entitlements
     SET refinements_used = refinements_used + 1,
         status = 'refinement_ready',
         updated_at = now()
   WHERE id = p_entitlement_id
     AND user_id = p_user_id
     AND status IN ('ready', 'refinement_ready')
     AND refinements_used < refinements_included;
  GET DIAGNOSTICS updated = ROW_COUNT;
  IF updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'no_refinement_left');
  END IF;
  RETURN jsonb_build_object('ok', true);
END $$;

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.record_product_entitlement(uuid,text,text,text,text,integer,uuid,text,timestamptz,uuid,integer)',
    'public.begin_product_fulfillment(uuid,uuid,interval)',
    'public.complete_product_fulfillment(uuid,uuid,text,text,uuid,jsonb,integer)',
    'public.fail_product_fulfillment(uuid,uuid,uuid,text)',
    'public.claim_product_refinement(uuid,uuid)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
