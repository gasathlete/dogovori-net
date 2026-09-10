-- P0 Stage 2A — точна покупка на еднократен продукт и доказано платено право.
--
-- Обхват: заявка (intake) преди плащане, платена привилегия (entitlement),
-- затягане на `order_snapshots` и атомарни функции, достъпни само за
-- service_role. Браузърът никога не пише покупка, статус или резултат.
--
-- Миграцията е ДОБАВЯЩА и повторно изпълнима (idempotent): не сваля таблици и
-- колони, не променя типове и запазва всички заварени стойности и редове.

-- ---------------------------------------------------------------------------
-- A) Метаданни за пълнотата на прочетения източник (върху заварената таблица)
-- ---------------------------------------------------------------------------
-- Клиентът може да пише в своите редове на `uploaded_contracts`, затова тези
-- полета НЕ са доказателство. Сървърът винаги преизчислява SHA-256 и дължината
-- и приема само `full`.
ALTER TABLE public.uploaded_contracts
  ADD COLUMN IF NOT EXISTS product_extraction_status text,
  ADD COLUMN IF NOT EXISTS product_extracted_chars integer,
  ADD COLUMN IF NOT EXISTS product_source_pages integer,
  ADD COLUMN IF NOT EXISTS product_source_kind text,
  ADD COLUMN IF NOT EXISTS product_extraction_at timestamptz;

DO $$ BEGIN
  ALTER TABLE public.uploaded_contracts
    ADD CONSTRAINT uploaded_contracts_product_extraction_status_ck
    CHECK (product_extraction_status IS NULL
           OR product_extraction_status IN ('full', 'partial'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Платеният продукт е обвързан с ФАЙЛ: PDF с четим текст или DOCX.
DO $$ BEGIN
  ALTER TABLE public.uploaded_contracts
    ADD CONSTRAINT uploaded_contracts_product_source_kind_ck
    CHECK (product_source_kind IS NULL
           OR product_source_kind IN ('pdf', 'docx'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.uploaded_contracts
    ADD CONSTRAINT uploaded_contracts_product_extracted_chars_ck
    CHECK (product_extracted_chars IS NULL
           OR (product_extracted_chars >= 0 AND product_extracted_chars <= 60000));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- B) Заявка (intake) преди плащане
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_checkout_intakes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  -- Документът остава свързан и след покупката: ЗЗП доказателството не бива да
  -- се разпада до NULL.
  uploaded_contract_id uuid REFERENCES public.uploaded_contracts(id) ON DELETE RESTRICT,
  source_hash text NOT NULL,
  source_updated_at timestamptz,
  source_char_count integer,
  source_page_count integer,
  source_extraction_status text,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  stripe_session_id text,
  stripe_price_id text,
  stripe_price_lookup_key text,
  expected_amount_cents integer,
  currency text NOT NULL DEFAULT 'eur',
  environment text NOT NULL,
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  refund_version text NOT NULL,
  ai_notice_version text NOT NULL,
  withdrawal_version text,
  terms_accepted boolean NOT NULL DEFAULT false,
  ai_ack_accepted boolean NOT NULL DEFAULT false,
  immediate_performance_consent boolean NOT NULL DEFAULT false,
  withdrawal_loss_acknowledged boolean NOT NULL DEFAULT false,
  consent_recorded_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT now() + interval '2 hours'
);

-- Заварените инсталации получават новите колони добавъчно.
ALTER TABLE public.product_checkout_intakes
  ADD COLUMN IF NOT EXISTS source_char_count integer,
  ADD COLUMN IF NOT EXISTS source_page_count integer,
  ADD COLUMN IF NOT EXISTS source_extraction_status text,
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS stripe_price_lookup_key text,
  ADD COLUMN IF NOT EXISTS expected_amount_cents integer,
  ADD COLUMN IF NOT EXISTS currency text NOT NULL DEFAULT 'eur',
  ADD COLUMN IF NOT EXISTS withdrawal_version text;

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
    ADD CONSTRAINT product_checkout_intakes_currency_ck CHECK (lower(currency) = 'eur');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- SHA-256 в точния си вид: 64 знака малък шестнадесетичен.
DO $$ BEGIN
  ALTER TABLE public.product_checkout_intakes
    ADD CONSTRAINT product_checkout_intakes_source_hash_ck
    CHECK (source_hash ~ '^[0-9a-f]{64}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Пълнотата е задължителна: само цял прочетен документ, в границите на
-- единствения документиран лимит.
DO $$ BEGIN
  ALTER TABLE public.product_checkout_intakes
    ADD CONSTRAINT product_checkout_intakes_source_status_ck
    CHECK (source_extraction_status = 'full');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.product_checkout_intakes
    ADD CONSTRAINT product_checkout_intakes_source_chars_ck
    CHECK (source_char_count BETWEEN 80 AND 60000);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.product_checkout_intakes
    ADD CONSTRAINT product_checkout_intakes_source_bound_ck
    CHECK (uploaded_contract_id IS NOT NULL AND source_updated_at IS NOT NULL);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Четирите съгласия са задължително ДАДЕНИ, с версии и точен момент.
DO $$ BEGIN
  ALTER TABLE public.product_checkout_intakes
    ADD CONSTRAINT product_checkout_intakes_consent_ck CHECK (
      terms_accepted IS TRUE
      AND ai_ack_accepted IS TRUE
      AND immediate_performance_consent IS TRUE
      AND withdrawal_loss_acknowledged IS TRUE
      AND consent_recorded_at IS NOT NULL
      AND length(btrim(terms_version)) > 0
      AND length(btrim(privacy_version)) > 0
      AND length(btrim(refund_version)) > 0
      AND length(btrim(ai_notice_version)) > 0
      AND withdrawal_version IS NOT NULL
      AND length(btrim(withdrawal_version)) > 0
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Точна търговска идентичност: продукт → сума и продукт → lookup key.
DO $$ BEGIN
  ALTER TABLE public.product_checkout_intakes
    ADD CONSTRAINT product_checkout_intakes_amount_ck CHECK (
      (product_id = 'contract_check' AND expected_amount_cents = 299
        AND stripe_price_lookup_key = 'contract_check_299')
      OR (product_id = 'contract_improve' AND expected_amount_cents = 399
        AND stripe_price_lookup_key = 'contract_improve_399')
      OR (product_id = 'negotiation_package' AND expected_amount_cents = 799
        AND stripe_price_lookup_key = 'negotiation_package_799')
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.product_checkout_intakes
    ADD CONSTRAINT product_checkout_intakes_price_id_ck
    CHECK (stripe_price_id IS NULL OR length(btrim(stripe_price_id)) > 0);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Контекстът е обект с точно определени ключове и ограничени дължини.
DO $$ BEGIN
  ALTER TABLE public.product_checkout_intakes
    ADD CONSTRAINT product_checkout_intakes_context_ck CHECK (
      jsonb_typeof(context) = 'object'
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_object_keys(context) AS k
        WHERE k NOT IN ('role', 'objective', 'counterparty_context', 'preferred_position')
      )
      AND jsonb_typeof(context -> 'role') = 'string'
      AND length(context ->> 'role') BETWEEN 2 AND 120
      AND (context ? 'objective' = false
           OR (jsonb_typeof(context -> 'objective') = 'string'
               AND length(context ->> 'objective') BETWEEN 2 AND 400))
      AND (context ? 'counterparty_context' = false
           OR (jsonb_typeof(context -> 'counterparty_context') = 'string'
               AND length(context ->> 'counterparty_context') BETWEEN 2 AND 400))
      AND (context ? 'preferred_position' = false
           OR context ->> 'preferred_position' IN ('conservative', 'balanced', 'assertive'))
      AND (product_id = 'contract_check' OR context ? 'objective')
      AND (product_id <> 'negotiation_package'
           OR (context ? 'counterparty_context' AND context ? 'preferred_position'))
    );
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
-- C) Платена привилегия за точно един продукт
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.product_entitlements (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id text NOT NULL,
  stripe_session_id text NOT NULL,
  stripe_price_id text,
  stripe_price_lookup_key text NOT NULL,
  environment text NOT NULL,
  amount_cents integer NOT NULL,
  currency text NOT NULL DEFAULT 'eur',
  paid_at timestamptz,
  -- Подписаното Stripe събитие, доказало плащането. Не е час на сървъра.
  stripe_event_id text,
  source_document_id uuid REFERENCES public.uploaded_contracts(id) ON DELETE RESTRICT,
  source_hash text NOT NULL,
  source_updated_at timestamptz,
  source_char_count integer,
  source_extraction_status text,
  intake_id uuid REFERENCES public.product_checkout_intakes(id) ON DELETE RESTRICT,
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
  refinement_state text NOT NULL DEFAULT 'idle',
  refinement_token uuid,
  refinement_started_at timestamptz,
  refinement_attempts integer NOT NULL DEFAULT 0,
  refinement_error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.product_entitlements
  ADD COLUMN IF NOT EXISTS stripe_price_id text,
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS stripe_event_id text,
  ADD COLUMN IF NOT EXISTS source_char_count integer,
  ADD COLUMN IF NOT EXISTS source_extraction_status text,
  ADD COLUMN IF NOT EXISTS refinement_state text NOT NULL DEFAULT 'idle',
  ADD COLUMN IF NOT EXISTS refinement_token uuid,
  ADD COLUMN IF NOT EXISTS refinement_started_at timestamptz,
  ADD COLUMN IF NOT EXISTS refinement_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS refinement_error_code text;

DO $$ BEGIN
  ALTER TABLE public.product_entitlements
    ADD CONSTRAINT product_entitlements_product_ck
    CHECK (product_id IN ('contract_check', 'contract_improve', 'negotiation_package'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.product_entitlements
    ADD CONSTRAINT product_entitlements_status_ck
    -- Животът на уточнението има собствено поле `refinement_state`; основният
    -- статус на резултата остава чист.
    CHECK (status IN ('paid', 'processing', 'ready', 'failed', 'refunded'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.product_entitlements
    ADD CONSTRAINT product_entitlements_env_ck CHECK (environment IN ('live', 'sandbox'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.product_entitlements
    ADD CONSTRAINT product_entitlements_currency_ck CHECK (lower(currency) = 'eur');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Точната търговска истина: сума, lookup key и включени уточнения по продукт.
DO $$ BEGIN
  ALTER TABLE public.product_entitlements
    ADD CONSTRAINT product_entitlements_commercial_ck CHECK (
      (product_id = 'contract_check' AND amount_cents = 299
        AND stripe_price_lookup_key = 'contract_check_299' AND refinements_included = 0)
      OR (product_id = 'contract_improve' AND amount_cents = 399
        AND stripe_price_lookup_key = 'contract_improve_399' AND refinements_included = 0)
      OR (product_id = 'negotiation_package' AND amount_cents = 799
        AND stripe_price_lookup_key = 'negotiation_package_799' AND refinements_included = 1)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.product_entitlements
    ADD CONSTRAINT product_entitlements_source_hash_ck
    CHECK (source_hash ~ '^[0-9a-f]{64}$');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Платеното право винаги носи доказателството си: сесия, цена, момент на
-- плащане, документ, ревизия и пълнота.
DO $$ BEGIN
  ALTER TABLE public.product_entitlements
    ADD CONSTRAINT product_entitlements_proof_ck CHECK (
      length(btrim(stripe_session_id)) > 0
      AND stripe_price_id IS NOT NULL AND length(btrim(stripe_price_id)) > 0
      AND paid_at IS NOT NULL
      AND stripe_event_id IS NOT NULL AND length(btrim(stripe_event_id)) > 0
      AND intake_id IS NOT NULL
      AND source_document_id IS NOT NULL
      AND source_updated_at IS NOT NULL
      AND source_extraction_status = 'full'
      AND source_char_count BETWEEN 80 AND 60000
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE public.product_entitlements
    ADD CONSTRAINT product_entitlements_refinements_ck CHECK (
      refinements_used >= 0
      AND refinements_used <= refinements_included
      AND refinement_attempts >= 0
      AND refinement_attempts <= 20
      AND attempt_count >= 0
      AND attempt_count <= 20
      AND refinement_state IN ('idle', 'processing')
      AND (refinement_state = 'idle' OR (status = 'ready' AND refinement_token IS NOT NULL))
      AND (refinement_error_code IS NULL OR length(refinement_error_code) <= 64)
      AND (last_error_code IS NULL OR length(last_error_code) <= 64)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- `ready` означава реален резултат за ТОЧНО този продукт и източник.
DO $$ BEGIN
  ALTER TABLE public.product_entitlements
    ADD CONSTRAINT product_entitlements_ready_ck CHECK (
      status <> 'ready'
      OR (
        result IS NOT NULL
        AND jsonb_typeof(result) = 'object'
        AND result_schema_version IS NOT NULL
        AND result ->> 'product_id' = product_id
        AND result ->> 'source_hash' = source_hash
        AND fulfilled_at IS NOT NULL
      )
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Начални състояния никога не носят резултат.
DO $$ BEGIN
  ALTER TABLE public.product_entitlements
    ADD CONSTRAINT product_entitlements_initial_state_ck CHECK (
      status NOT IN ('paid', 'processing', 'failed')
      OR (result IS NULL AND result_schema_version IS NULL AND fulfilled_at IS NULL)
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE UNIQUE INDEX IF NOT EXISTS product_entitlements_session_uq
  ON public.product_entitlements(stripe_session_id);
CREATE UNIQUE INDEX IF NOT EXISTS product_entitlements_intake_uq
  ON public.product_entitlements(intake_id);
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
-- D) Затягане на order_snapshots
-- ---------------------------------------------------------------------------
-- Потребителят не може да си „декларира“ покупка.
DROP POLICY IF EXISTS order_snapshots_user_insert ON public.order_snapshots;

ALTER TABLE public.order_snapshots ADD COLUMN IF NOT EXISTS product_id text;
ALTER TABLE public.order_snapshots ADD COLUMN IF NOT EXISTS terms_accepted boolean;
ALTER TABLE public.order_snapshots ADD COLUMN IF NOT EXISTS immediate_performance_consent boolean;
ALTER TABLE public.order_snapshots ADD COLUMN IF NOT EXISTS withdrawal_loss_acknowledged boolean;
ALTER TABLE public.order_snapshots ADD COLUMN IF NOT EXISTS consent_recorded_at timestamptz;
ALTER TABLE public.order_snapshots ADD COLUMN IF NOT EXISTS product_intake_id uuid;
ALTER TABLE public.order_snapshots ADD COLUMN IF NOT EXISTS product_source_document_id uuid;
ALTER TABLE public.order_snapshots ADD COLUMN IF NOT EXISTS product_source_hash text;
ALTER TABLE public.order_snapshots ADD COLUMN IF NOT EXISTS stripe_price_id text;
ALTER TABLE public.order_snapshots ADD COLUMN IF NOT EXISTS stripe_price_lookup_key text;
ALTER TABLE public.order_snapshots ADD COLUMN IF NOT EXISTS product_source_updated_at timestamptz;
ALTER TABLE public.order_snapshots ADD COLUMN IF NOT EXISTS product_source_char_count integer;
ALTER TABLE public.order_snapshots ADD COLUMN IF NOT EXISTS product_source_extraction_status text;
ALTER TABLE public.order_snapshots ADD COLUMN IF NOT EXISTS ai_notice_version text;
ALTER TABLE public.order_snapshots ADD COLUMN IF NOT EXISTS paid_at timestamptz;
ALTER TABLE public.order_snapshots ADD COLUMN IF NOT EXISTS stripe_event_id text;
-- Единственото, което Stripe наистина доказва за данъка, е ПОВЕДЕНИЕТО на
-- цената (`inclusive`). Ставка се записва само ако Stripe я е подписал.
ALTER TABLE public.order_snapshots ADD COLUMN IF NOT EXISTS tax_behavior text;
ALTER TABLE public.order_snapshots ADD COLUMN IF NOT EXISTS tax_amount_cents integer;

-- Заварената колона `vat_rate` е NOT NULL DEFAULT 20. Продуктовите редове не
-- могат да твърдят ставка, която Stripe не е подписал, затова колоната става
-- допустимо празна за напред. Заварените редове и стойности не се променят.
ALTER TABLE public.order_snapshots ALTER COLUMN vat_rate DROP NOT NULL;

DO $$ BEGIN
  ALTER TABLE public.order_snapshots
    ADD CONSTRAINT order_snapshots_tax_behavior_ck
    CHECK (tax_behavior IS NULL OR tax_behavior IN ('inclusive', 'exclusive', 'unspecified'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Разширяваме допустимите видове покупка, като ЗАПАЗВАМЕ всяка заварена
-- стойност. Работим по точното име на ограничението, а не по „първото, което
-- споменава purchase_kind“.
DO $$
DECLARE
  ck text;
BEGIN
  FOR ck IN
    SELECT conname
    FROM pg_constraint
    WHERE conrelid = 'public.order_snapshots'::regclass
      AND contype = 'c'
      AND conname IN ('order_snapshots_purchase_kind_ck', 'order_snapshots_purchase_kind_check')
  LOOP
    EXECUTE format('ALTER TABLE public.order_snapshots DROP CONSTRAINT %I', ck);
  END LOOP;
  ALTER TABLE public.order_snapshots
    ADD CONSTRAINT order_snapshots_purchase_kind_ck CHECK (purchase_kind IN (
      'team', 'subscription', 'strict_unlock', 'branding',
      'entry_pack', 'topup', 'one_time', 'product', 'unknown'
    ));
END $$;

-- Продуктовият snapshot носи цялото доказателство; непродуктовият никога не
-- носи продукт.
DO $$ BEGIN
  ALTER TABLE public.order_snapshots
    ADD CONSTRAINT order_snapshots_product_id_ck CHECK (
      CASE WHEN purchase_kind = 'product' THEN
        product_id IN ('contract_check', 'contract_improve', 'negotiation_package')
        AND currency = 'EUR'
        AND environment IN ('live', 'sandbox')
        AND payment_status = 'paid'
        AND product_intake_id IS NOT NULL
        AND product_source_document_id IS NOT NULL
        AND product_source_hash ~ '^[0-9a-f]{64}$'
        AND stripe_price_id IS NOT NULL AND length(btrim(stripe_price_id)) > 0
        AND stripe_price_lookup_key IN (
          'contract_check_299', 'contract_improve_399', 'negotiation_package_799')
        AND product_source_updated_at IS NOT NULL
        AND product_source_char_count BETWEEN 80 AND 60000
        AND product_source_extraction_status = 'full'
        AND paid_at IS NOT NULL
        AND stripe_session_id IS NOT NULL AND length(btrim(stripe_session_id)) > 0
        AND stripe_event_id IS NOT NULL AND length(btrim(stripe_event_id)) > 0
        -- Доказано е ПОВЕДЕНИЕТО на цената, не някаква ставка.
        AND vat_included IS TRUE
        AND tax_behavior = 'inclusive'
        AND ai_notice_version IS NOT NULL
        AND terms_accepted IS TRUE
        AND ai_ack_accepted IS TRUE
        AND immediate_performance_consent IS TRUE
        AND withdrawal_loss_acknowledged IS TRUE
        AND consent_recorded_at IS NOT NULL
        AND terms_version IS NOT NULL
        AND privacy_version IS NOT NULL
        AND withdrawal_version IS NOT NULL
        AND refund_version IS NOT NULL
        AND (
          (product_id = 'contract_check' AND price_amount = 2.99)
          OR (product_id = 'contract_improve' AND price_amount = 3.99)
          OR (product_id = 'negotiation_package' AND price_amount = 7.99)
        )
      ELSE product_id IS NULL END
    );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------------------
-- E) Атомарни функции, достъпни само за service_role
-- ---------------------------------------------------------------------------
-- Една транзакция създава И привилегията, И продуктовия order snapshot от
-- НЕИЗМЕННАТА заявка. Повторна доставка е успех само при пълно съвпадение.
CREATE OR REPLACE FUNCTION public.record_product_purchase(
  p_user_id uuid,
  p_product_id text,
  p_session_id text,
  p_price_id text,
  p_lookup_key text,
  p_environment text,
  p_amount_cents integer,
  p_currency text,
  p_intake_id uuid,
  p_paid_at timestamptz,
  p_refinements_included integer,
  p_stripe_event_id text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_intake public.product_checkout_intakes;
  v_ent public.product_entitlements;
  v_doc public.uploaded_contracts;
  v_snapshot public.order_snapshots;
  v_amount numeric := p_amount_cents::numeric / 100;
  v_expected_amount integer;
  v_expected_lookup text;
  v_expected_refinements integer;
  v_recomputed_hash text;
  v_new_id uuid;
BEGIN
  -- 0) Доказателството за плащане идва от подписаното Stripe събитие. Няма
  --    COALESCE(now()) и няма измислен час.
  IF p_paid_at IS NULL THEN
    RAISE EXCEPTION 'product_paid_at_missing';
  END IF;
  IF p_stripe_event_id IS NULL OR length(btrim(p_stripe_event_id)) = 0 THEN
    RAISE EXCEPTION 'product_event_missing';
  END IF;
  IF lower(COALESCE(p_currency, '')) <> 'eur' THEN
    RAISE EXCEPTION 'product_purchase_currency_conflict';
  END IF;
  IF p_price_id IS NULL OR length(btrim(p_price_id)) = 0 THEN
    RAISE EXCEPTION 'product_price_missing';
  END IF;

  -- 1) Точната търговска идентичност на продукта, включително уточненията.
  IF p_product_id = 'contract_check' THEN
    v_expected_amount := 299;
    v_expected_lookup := 'contract_check_299';
    v_expected_refinements := 0;
  ELSIF p_product_id = 'contract_improve' THEN
    v_expected_amount := 399;
    v_expected_lookup := 'contract_improve_399';
    v_expected_refinements := 0;
  ELSIF p_product_id = 'negotiation_package' THEN
    v_expected_amount := 799;
    v_expected_lookup := 'negotiation_package_799';
    v_expected_refinements := 1;
  ELSE
    RAISE EXCEPTION 'product_unknown';
  END IF;
  IF p_amount_cents IS DISTINCT FROM v_expected_amount
     OR p_lookup_key IS DISTINCT FROM v_expected_lookup
     OR p_refinements_included IS DISTINCT FROM v_expected_refinements THEN
    RAISE EXCEPTION 'product_commercial_conflict';
  END IF;

  -- 2) Заявката се заключва и всяко неизменно поле трябва да съвпада точно.
  SELECT * INTO v_intake FROM public.product_checkout_intakes
    WHERE id = p_intake_id FOR UPDATE;
  IF v_intake.id IS NULL THEN
    RAISE EXCEPTION 'product_intake_not_found';
  END IF;

  IF v_intake.user_id IS DISTINCT FROM p_user_id
     OR v_intake.product_id IS DISTINCT FROM p_product_id
     OR v_intake.environment IS DISTINCT FROM p_environment
     OR v_intake.expected_amount_cents IS DISTINCT FROM p_amount_cents
     OR lower(COALESCE(v_intake.currency, '')) IS DISTINCT FROM 'eur'
     OR v_intake.stripe_price_lookup_key IS DISTINCT FROM p_lookup_key
     OR v_intake.stripe_price_id IS DISTINCT FROM p_price_id
     OR v_intake.source_extraction_status IS DISTINCT FROM 'full'
     OR v_intake.source_char_count IS NULL
     OR v_intake.uploaded_contract_id IS NULL
     OR v_intake.source_updated_at IS NULL
     OR v_intake.terms_accepted IS NOT TRUE
     OR v_intake.ai_ack_accepted IS NOT TRUE
     OR v_intake.immediate_performance_consent IS NOT TRUE
     OR v_intake.withdrawal_loss_acknowledged IS NOT TRUE
     OR v_intake.consent_recorded_at IS NULL THEN
    RAISE EXCEPTION 'product_intake_conflict';
  END IF;

  IF v_intake.stripe_session_id IS DISTINCT FROM p_session_id THEN
    RAISE EXCEPTION 'product_session_conflict';
  END IF;

  -- 3) Чисти състояния: първо даване САМО от `checkout_created`, повторение
  --    САМО от `paid`. Всяко половин състояние се проваля затворено.
  IF v_intake.status NOT IN ('checkout_created', 'paid') THEN
    RAISE EXCEPTION 'product_intake_state_conflict';
  END IF;

  -- 4) Редът на документа се заключва и се сверява поле по поле.
  SELECT * INTO v_doc FROM public.uploaded_contracts
    WHERE id = v_intake.uploaded_contract_id AND user_id = p_user_id FOR UPDATE;
  IF v_doc.id IS NULL
     OR v_doc.updated_at IS DISTINCT FROM v_intake.source_updated_at
     OR lower(COALESCE(v_doc.text_hash, '')) IS DISTINCT FROM v_intake.source_hash
     OR length(COALESCE(v_doc.extracted_text, '')) IS DISTINCT FROM v_intake.source_char_count
     OR v_doc.product_extraction_status IS DISTINCT FROM 'full'
     OR v_doc.product_extracted_chars IS DISTINCT FROM v_intake.source_char_count
     OR COALESCE(v_doc.product_source_kind, '') NOT IN ('pdf', 'docx') THEN
    RAISE EXCEPTION 'product_source_changed';
  END IF;

  -- Сървърът преизчислява SHA-256 върху ТОЧНО съхранения нормализиран текст.
  -- Това НЕ е повторно прочитане на оригиналния файл: извличането става в
  -- браузъра и това остава известната остатъчна граница.
  BEGIN
    v_recomputed_hash := encode(extensions.digest(v_doc.extracted_text, 'sha256'), 'hex');
  EXCEPTION WHEN undefined_function OR invalid_schema_name OR undefined_object THEN
    RAISE EXCEPTION 'product_source_hash_unverifiable';
  END;
  IF v_recomputed_hash IS DISTINCT FROM v_intake.source_hash THEN
    RAISE EXCEPTION 'product_source_hash_conflict';
  END IF;

  -- 5) Заварено право: сверяваме ВСЯКО неизменно поле.
  SELECT * INTO v_ent FROM public.product_entitlements
    WHERE stripe_session_id = p_session_id FOR UPDATE;

  IF v_ent.id IS NOT NULL THEN
    IF v_ent.user_id IS DISTINCT FROM p_user_id
       OR v_ent.product_id IS DISTINCT FROM p_product_id
       OR v_ent.environment IS DISTINCT FROM p_environment
       OR v_ent.amount_cents IS DISTINCT FROM p_amount_cents
       OR lower(COALESCE(v_ent.currency, '')) IS DISTINCT FROM 'eur'
       OR v_ent.stripe_price_id IS DISTINCT FROM p_price_id
       OR v_ent.stripe_price_lookup_key IS DISTINCT FROM p_lookup_key
       OR v_ent.refinements_included IS DISTINCT FROM v_expected_refinements
       OR v_ent.intake_id IS DISTINCT FROM p_intake_id
       OR v_ent.source_document_id IS DISTINCT FROM v_intake.uploaded_contract_id
       OR v_ent.source_hash IS DISTINCT FROM v_intake.source_hash
       OR v_ent.source_updated_at IS DISTINCT FROM v_intake.source_updated_at
       OR v_ent.source_char_count IS DISTINCT FROM v_intake.source_char_count
       OR v_ent.source_extraction_status IS DISTINCT FROM 'full'
       OR v_ent.paid_at IS DISTINCT FROM p_paid_at
       OR v_ent.stripe_event_id IS DISTINCT FROM p_stripe_event_id THEN
      RAISE EXCEPTION 'product_entitlement_conflict';
    END IF;
    v_new_id := v_ent.id;
  END IF;

  -- 6) Заварен snapshot: сверяваме ВСЯКО неизменно продуктово поле.
  SELECT * INTO v_snapshot FROM public.order_snapshots
    WHERE stripe_session_id = p_session_id FOR UPDATE;

  IF v_snapshot.id IS NOT NULL THEN
    IF v_snapshot.user_id IS DISTINCT FROM p_user_id
       OR v_snapshot.purchase_kind IS DISTINCT FROM 'product'
       OR v_snapshot.product_id IS DISTINCT FROM p_product_id
       OR v_snapshot.plan_name IS DISTINCT FROM p_product_id
       OR v_snapshot.price_amount IS DISTINCT FROM v_amount
       OR v_snapshot.currency IS DISTINCT FROM 'EUR'
       OR v_snapshot.environment IS DISTINCT FROM p_environment
       OR v_snapshot.payment_status IS DISTINCT FROM 'paid'
       OR v_snapshot.stripe_price_id IS DISTINCT FROM p_price_id
       OR v_snapshot.stripe_price_lookup_key IS DISTINCT FROM p_lookup_key
       OR v_snapshot.stripe_event_id IS DISTINCT FROM p_stripe_event_id
       OR v_snapshot.paid_at IS DISTINCT FROM p_paid_at
       OR v_snapshot.product_intake_id IS DISTINCT FROM p_intake_id
       OR v_snapshot.product_source_document_id IS DISTINCT FROM v_intake.uploaded_contract_id
       OR v_snapshot.product_source_hash IS DISTINCT FROM v_intake.source_hash
       OR v_snapshot.product_source_updated_at IS DISTINCT FROM v_intake.source_updated_at
       OR v_snapshot.product_source_char_count IS DISTINCT FROM v_intake.source_char_count
       OR v_snapshot.product_source_extraction_status IS DISTINCT FROM 'full'
       OR v_snapshot.terms_accepted IS NOT TRUE
       OR v_snapshot.ai_ack_accepted IS NOT TRUE
       OR v_snapshot.immediate_performance_consent IS NOT TRUE
       OR v_snapshot.withdrawal_loss_acknowledged IS NOT TRUE
       OR v_snapshot.consent_recorded_at IS DISTINCT FROM v_intake.consent_recorded_at
       OR v_snapshot.terms_version IS DISTINCT FROM v_intake.terms_version
       OR v_snapshot.privacy_version IS DISTINCT FROM v_intake.privacy_version
       OR v_snapshot.refund_version IS DISTINCT FROM v_intake.refund_version
       OR v_snapshot.withdrawal_version IS DISTINCT FROM v_intake.withdrawal_version
       OR v_snapshot.ai_notice_version IS DISTINCT FROM v_intake.ai_notice_version
       OR v_snapshot.vat_included IS NOT TRUE
       OR v_snapshot.tax_behavior IS DISTINCT FROM 'inclusive' THEN
      RAISE EXCEPTION 'product_snapshot_conflict';
    END IF;
  END IF;

  -- 7) Повторната доставка е успех САМО когато и правото, и snapshot-ът вече
  --    съществуват и съвпадат напълно.
  IF v_intake.status = 'paid' AND (v_ent.id IS NULL OR v_snapshot.id IS NULL) THEN
    RAISE EXCEPTION 'product_replay_incomplete';
  END IF;

  IF v_ent.id IS NULL THEN
    INSERT INTO public.product_entitlements (
      user_id, product_id, stripe_session_id, stripe_price_id, stripe_price_lookup_key,
      environment, amount_cents, currency, paid_at, stripe_event_id,
      source_document_id, source_hash, source_updated_at, source_char_count,
      source_extraction_status, intake_id, status, refinements_included
    ) VALUES (
      p_user_id, p_product_id, p_session_id, p_price_id, p_lookup_key,
      p_environment, p_amount_cents, 'eur', p_paid_at, btrim(p_stripe_event_id),
      v_intake.uploaded_contract_id, v_intake.source_hash, v_intake.source_updated_at,
      v_intake.source_char_count, 'full', p_intake_id, 'paid', v_expected_refinements
    ) RETURNING id INTO v_new_id;
  END IF;

  -- Snapshot-ът се гради само от неизменната заявка и от проверената цена, не
  -- от променливи Stripe метаданни. `vat_rate` остава празна: Stripe доказва
  -- ВКЛЮЧЕНОСТ на данъка, не ставка от 20%.
  IF v_snapshot.id IS NULL THEN
    INSERT INTO public.order_snapshots (
      user_id, plan_name, price_amount, currency, vat_included, vat_rate, tax_behavior,
      billing_period, terms_version, privacy_version, withdrawal_version, refund_version,
      ai_notice_version, ai_ack_accepted, terms_accepted, immediate_performance_consent,
      withdrawal_loss_acknowledged, consent_recorded_at, product_id, stripe_session_id,
      stripe_event_id, paid_at, environment, payment_status, purchase_kind,
      product_intake_id, product_source_document_id, product_source_hash,
      product_source_updated_at, product_source_char_count,
      product_source_extraction_status, stripe_price_id, stripe_price_lookup_key
    ) VALUES (
      p_user_id, p_product_id, v_amount, 'EUR', true, NULL, 'inclusive',
      NULL, v_intake.terms_version, v_intake.privacy_version, v_intake.withdrawal_version,
      v_intake.refund_version, v_intake.ai_notice_version, v_intake.ai_ack_accepted,
      v_intake.terms_accepted, v_intake.immediate_performance_consent,
      v_intake.withdrawal_loss_acknowledged, v_intake.consent_recorded_at,
      p_product_id, p_session_id, btrim(p_stripe_event_id), p_paid_at,
      p_environment, 'paid', 'product', p_intake_id,
      v_intake.uploaded_contract_id, v_intake.source_hash, v_intake.source_updated_at,
      v_intake.source_char_count, 'full', p_price_id, p_lookup_key
    );
  END IF;

  UPDATE public.product_checkout_intakes
     SET status = 'paid', updated_at = now()
   WHERE id = p_intake_id AND user_id = p_user_id;

  RETURN jsonb_build_object(
    'ok', true,
    'created', v_intake.status = 'checkout_created',
    'entitlement_id', v_new_id
  );
END $$;

-- Начално изпълнение: само от платено, още неготово право.
CREATE OR REPLACE FUNCTION public.begin_product_fulfillment(
  p_entitlement_id uuid,
  p_user_id uuid,
  p_stale_after interval DEFAULT interval '10 minutes'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_tok uuid := gen_random_uuid();
  v_updated integer;
BEGIN
  UPDATE public.product_entitlements
     SET status = 'processing',
         processing_token = v_tok,
         processing_started_at = now(),
         attempt_count = attempt_count + 1,
         updated_at = now()
   WHERE id = p_entitlement_id
     AND user_id = p_user_id
     AND attempt_count < 20
     AND (
       status IN ('paid', 'failed')
       OR (status = 'processing' AND processing_started_at < now() - p_stale_after)
     );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_claimable');
  END IF;
  RETURN jsonb_build_object('ok', true, 'processing_token', v_tok);
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
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_updated integer;
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
     AND status = 'processing'
     AND processing_token = p_processing_token
     AND p_result IS NOT NULL
     AND p_result ->> 'product_id' = p_product_id
     AND p_result ->> 'source_hash' = p_source_hash;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_updated = 1);
END $$;

CREATE OR REPLACE FUNCTION public.fail_product_fulfillment(
  p_entitlement_id uuid,
  p_user_id uuid,
  p_processing_token uuid,
  p_error_code text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.product_entitlements
     SET status = 'failed',
         last_error_code = left(COALESCE(p_error_code, 'unknown'), 64),
         processing_token = NULL,
         updated_at = now()
   WHERE id = p_entitlement_id
     AND user_id = p_user_id
     AND status = 'processing'
     AND processing_token = p_processing_token;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_updated = 1);
END $$;

-- Уточнението се ИЗРАЗХОДВА само при успех. Заявяването не го изразходва и
-- никога не пипа вече готовия резултат.
CREATE OR REPLACE FUNCTION public.claim_product_refinement(
  p_entitlement_id uuid,
  p_user_id uuid,
  p_stale_after interval DEFAULT interval '10 minutes'
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_tok uuid := gen_random_uuid();
  v_updated integer;
BEGIN
  UPDATE public.product_entitlements
     SET refinement_state = 'processing',
         refinement_token = v_tok,
         refinement_started_at = now(),
         refinement_attempts = refinement_attempts + 1,
         refinement_error_code = NULL,
         updated_at = now()
   WHERE id = p_entitlement_id
     AND user_id = p_user_id
     AND status = 'ready'
     AND refinements_used < refinements_included
     AND refinement_attempts < 20
     AND (
       refinement_state = 'idle'
       OR refinement_started_at < now() - p_stale_after
     );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated = 0 THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'refinement_not_claimable');
  END IF;
  RETURN jsonb_build_object('ok', true, 'refinement_token', v_tok);
END $$;

CREATE OR REPLACE FUNCTION public.complete_product_refinement(
  p_entitlement_id uuid,
  p_user_id uuid,
  p_refinement_token uuid,
  p_result jsonb,
  p_result_schema_version integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.product_entitlements
     SET result = p_result,
         result_schema_version = COALESCE(p_result_schema_version, result_schema_version),
         refinements_used = refinements_used + 1,
         refinement_state = 'idle',
         refinement_token = NULL,
         refinement_error_code = NULL,
         fulfilled_at = now(),
         updated_at = now()
   WHERE id = p_entitlement_id
     AND user_id = p_user_id
     AND status = 'ready'
     AND refinement_state = 'processing'
     AND refinement_token = p_refinement_token
     AND refinements_used < refinements_included
     AND p_result IS NOT NULL
     AND p_result ->> 'product_id' = product_id
     AND p_result ->> 'source_hash' = source_hash;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_updated = 1);
END $$;

-- Неуспешно уточнение: платеният готов резултат остава, уточнението НЕ се
-- изразходва и опитът може да се повтори.
CREATE OR REPLACE FUNCTION public.fail_product_refinement(
  p_entitlement_id uuid,
  p_user_id uuid,
  p_refinement_token uuid,
  p_error_code text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.product_entitlements
     SET refinement_state = 'idle',
         refinement_token = NULL,
         refinement_error_code = left(COALESCE(p_error_code, 'unknown'), 64),
         updated_at = now()
   WHERE id = p_entitlement_id
     AND user_id = p_user_id
     AND status = 'ready'
     AND refinement_state = 'processing'
     AND refinement_token = p_refinement_token;
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_updated = 1);
END $$;

DO $$
DECLARE
  fn text;
BEGIN
  FOREACH fn IN ARRAY ARRAY[
    'public.record_product_purchase(uuid,text,text,text,text,text,integer,text,uuid,timestamptz,integer,text)',
    'public.begin_product_fulfillment(uuid,uuid,interval)',
    'public.complete_product_fulfillment(uuid,uuid,text,text,uuid,jsonb,integer)',
    'public.fail_product_fulfillment(uuid,uuid,uuid,text)',
    'public.claim_product_refinement(uuid,uuid,interval)',
    'public.complete_product_refinement(uuid,uuid,uuid,jsonb,integer)',
    'public.fail_product_refinement(uuid,uuid,uuid,text)'
  ] LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon', fn);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM authenticated', fn);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn);
  END LOOP;
END $$;
