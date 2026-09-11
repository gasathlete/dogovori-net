-- Stage 2B1B1 FINAL ACCEPTANCE — bind each paid entitlement to the immutable
-- generation policy recorded on its exact checkout intake.
--
-- Source only. Apply strictly after protected base -> 0018 -> 0019 -> 0020.
-- No row is invented or backfilled: rollout stops if a legacy/blank intake exists.

BEGIN;

-- Pre-apply gate. Since the Stage 2 migrations are not yet applied, the approved
-- rollout must have zero legacy/blank paid-product intakes. Never guess a version.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM public.product_checkout_intakes
     WHERE generation_policy_version IS NULL
        OR length(btrim(generation_policy_version)) = 0
  ) THEN
    RAISE EXCEPTION 'product_intake_policy_preapply_gate_failed';
  END IF;
END $$;

ALTER TABLE public.product_checkout_intakes
  ADD CONSTRAINT product_checkout_intakes_generation_policy_ck
  CHECK (
    generation_policy_version IS NOT NULL
    AND length(btrim(generation_policy_version)) > 0
  ) NOT VALID;

ALTER TABLE public.product_checkout_intakes
  VALIDATE CONSTRAINT product_checkout_intakes_generation_policy_ck;

CREATE OR REPLACE FUNCTION public.bind_product_entitlement_policy()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = '' AS $$
DECLARE
  v_intake public.product_checkout_intakes;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF NEW.generation_policy_version IS DISTINCT FROM OLD.generation_policy_version THEN
      RAISE EXCEPTION 'product_entitlement_policy_immutable';
    END IF;
    RETURN NEW;
  END IF;

  IF NEW.intake_id IS NULL THEN
    RAISE EXCEPTION 'product_entitlement_intake_missing';
  END IF;

  SELECT * INTO v_intake
    FROM public.product_checkout_intakes
   WHERE id = NEW.intake_id
   FOR UPDATE;

  IF v_intake.id IS NULL THEN
    RAISE EXCEPTION 'product_entitlement_intake_missing';
  END IF;
  IF v_intake.generation_policy_version IS NULL
     OR length(btrim(v_intake.generation_policy_version)) = 0 THEN
    RAISE EXCEPTION 'product_intake_policy_missing';
  END IF;

  IF v_intake.user_id IS DISTINCT FROM NEW.user_id
     OR v_intake.product_id IS DISTINCT FROM NEW.product_id
     OR v_intake.uploaded_contract_id IS DISTINCT FROM NEW.source_document_id
     OR lower(v_intake.source_hash) IS DISTINCT FROM lower(NEW.source_hash)
     OR v_intake.source_updated_at IS DISTINCT FROM NEW.source_updated_at
     OR v_intake.source_char_count IS DISTINCT FROM NEW.source_char_count
     OR v_intake.source_char_unit IS DISTINCT FROM NEW.source_char_unit
     OR v_intake.source_kind IS DISTINCT FROM NEW.source_kind
     OR v_intake.source_page_count IS DISTINCT FROM NEW.source_page_count
     OR v_intake.source_extraction_status IS DISTINCT FROM NEW.source_extraction_status THEN
    RAISE EXCEPTION 'product_entitlement_intake_binding_conflict';
  END IF;

  IF NEW.generation_policy_version IS NOT NULL
     AND NEW.generation_policy_version IS DISTINCT FROM v_intake.generation_policy_version THEN
    RAISE EXCEPTION 'product_entitlement_policy_conflict';
  END IF;

  NEW.generation_policy_version := v_intake.generation_policy_version;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS product_entitlements_bind_policy
  ON public.product_entitlements;
CREATE TRIGGER product_entitlements_bind_policy
  BEFORE INSERT OR UPDATE ON public.product_entitlements
  FOR EACH ROW
  EXECUTE FUNCTION public.bind_product_entitlement_policy();

REVOKE ALL ON FUNCTION public.bind_product_entitlement_policy() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bind_product_entitlement_policy() FROM anon;
REVOKE ALL ON FUNCTION public.bind_product_entitlement_policy() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.bind_product_entitlement_policy() TO service_role;

COMMIT;
