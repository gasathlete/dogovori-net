-- Gate 6: exact, auditable product refund/dispute truth.
-- Source-only until the staging migration is explicitly applied.

ALTER TABLE public.product_entitlements
  ADD COLUMN IF NOT EXISTS pre_reversal_status text,
  ADD COLUMN IF NOT EXISTS reversal_event_id text,
  ADD COLUMN IF NOT EXISTS reversed_at timestamptz,
  ADD COLUMN IF NOT EXISTS reversal_reason text;

ALTER TABLE public.product_entitlements
  DROP CONSTRAINT IF EXISTS product_entitlements_status_ck;
ALTER TABLE public.product_entitlements
  ADD CONSTRAINT product_entitlements_status_ck
  CHECK (status IN ('paid', 'processing', 'ready', 'failed', 'refunded', 'disputed'));

ALTER TABLE public.product_entitlements
  DROP CONSTRAINT IF EXISTS product_entitlements_reversal_ck;
ALTER TABLE public.product_entitlements
  ADD CONSTRAINT product_entitlements_reversal_ck CHECK (
    (pre_reversal_status IS NULL AND reversal_event_id IS NULL
      AND reversed_at IS NULL AND reversal_reason IS NULL)
    OR (
      pre_reversal_status IN ('paid', 'processing', 'ready', 'failed', 'refunded')
      AND reversal_event_id IS NOT NULL
      AND length(btrim(reversal_event_id)) BETWEEN 1 AND 255
      AND reversed_at IS NOT NULL
      AND reversal_reason IN ('refund_full', 'dispute_created', 'dispute_won', 'dispute_lost')
    )
  );

ALTER TABLE public.order_snapshots
  DROP CONSTRAINT IF EXISTS order_snapshots_payment_status_check;
ALTER TABLE public.order_snapshots
  DROP CONSTRAINT IF EXISTS order_snapshots_payment_status_ck;
ALTER TABLE public.order_snapshots
  ADD CONSTRAINT order_snapshots_payment_status_ck
  CHECK (payment_status IN ('paid', 'unknown', 'refunded', 'disputed'));

-- Product snapshots may change only their payment truth; all immutable proof
-- remains required and retained after a reversal.
ALTER TABLE public.order_snapshots
  DROP CONSTRAINT IF EXISTS order_snapshots_product_id_ck;
ALTER TABLE public.order_snapshots
  ADD CONSTRAINT order_snapshots_product_id_ck CHECK (
    CASE WHEN purchase_kind = 'product' THEN
      product_id IN ('contract_check', 'contract_improve', 'negotiation_package')
      AND currency = 'EUR'
      AND environment IN ('live', 'sandbox')
      AND payment_status IN ('paid', 'refunded', 'disputed')
      AND product_intake_id IS NOT NULL
      AND product_source_document_id IS NOT NULL
      AND product_source_hash ~ '^[0-9a-f]{64}$'
      AND stripe_price_id IS NOT NULL AND length(btrim(stripe_price_id)) > 0
      AND stripe_price_lookup_key IN (
        'contract_check_299', 'contract_improve_399', 'negotiation_package_799')
      AND product_source_updated_at IS NOT NULL
      AND product_source_char_count BETWEEN 80 AND 60000
      AND product_source_char_unit = 'unicode_code_points'
      AND product_source_extraction_status = 'full'
      AND product_source_kind IN ('pdf', 'docx')
      AND (product_source_pages IS NULL OR product_source_pages > 0)
      AND paid_at IS NOT NULL
      AND stripe_session_id IS NOT NULL AND length(btrim(stripe_session_id)) > 0
      AND stripe_event_id IS NOT NULL AND length(btrim(stripe_event_id)) > 0
      AND vat_included IS TRUE
      AND tax_behavior = 'inclusive'
      AND vat_rate IS NULL
      AND tax_amount_cents IS NULL
      AND ai_notice_version IS NOT NULL
      AND terms_accepted IS TRUE
      AND ai_ack_accepted IS TRUE
      AND immediate_performance_consent IS TRUE
      AND withdrawal_loss_acknowledged IS TRUE
      AND consent_recorded_at IS NOT NULL
      AND (
        (product_id = 'contract_check' AND price_amount = 2.99)
        OR (product_id = 'contract_improve' AND price_amount = 3.99)
        OR (product_id = 'negotiation_package' AND price_amount = 7.99)
      )
    ELSE product_id IS NULL END
  );

CREATE OR REPLACE FUNCTION public.record_product_payment_reversal(
  p_session_id text,
  p_environment text,
  p_event_id text,
  p_event_at timestamptz,
  p_action text
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_ent public.product_entitlements;
  v_snapshot public.order_snapshots;
  v_previous text;
  v_next text;
  v_snapshot_status text;
BEGIN
  -- Grants are the outer boundary; the signed JWT role is checked again
  -- inside SECURITY DEFINER so a future ACL regression still fails closed.
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'product_reversal_service_role_required';
  END IF;
  IF p_environment NOT IN ('live', 'sandbox') THEN
    RAISE EXCEPTION 'product_reversal_environment_invalid';
  END IF;
  IF p_session_id IS NULL OR length(btrim(p_session_id)) = 0 THEN
    RAISE EXCEPTION 'product_reversal_session_missing';
  END IF;
  IF p_event_id IS NULL OR length(btrim(p_event_id)) NOT BETWEEN 1 AND 255
     OR p_event_at IS NULL THEN
    RAISE EXCEPTION 'product_reversal_proof_invalid';
  END IF;
  IF p_action NOT IN ('refund_full', 'dispute_created', 'dispute_won', 'dispute_lost') THEN
    RAISE EXCEPTION 'product_reversal_action_invalid';
  END IF;

  SELECT * INTO v_ent
    FROM public.product_entitlements
   WHERE stripe_session_id = btrim(p_session_id)
     AND environment = p_environment
   FOR UPDATE;
  SELECT * INTO v_snapshot
    FROM public.order_snapshots
   WHERE stripe_session_id = btrim(p_session_id)
     AND environment = p_environment
   FOR UPDATE;

  IF v_ent.id IS NULL OR v_snapshot.id IS NULL THEN
    RAISE EXCEPTION 'product_reversal_binding_not_found';
  END IF;
  IF v_snapshot.purchase_kind IS DISTINCT FROM 'product'
     OR v_snapshot.product_id IS DISTINCT FROM v_ent.product_id
     OR v_snapshot.user_id IS DISTINCT FROM v_ent.user_id THEN
    RAISE EXCEPTION 'product_reversal_binding_conflict';
  END IF;

  IF v_ent.reversal_event_id = btrim(p_event_id) THEN
    IF v_ent.reversal_reason IS DISTINCT FROM p_action THEN
      RAISE EXCEPTION 'product_reversal_event_conflict';
    END IF;
    RETURN jsonb_build_object('ok', true, 'replayed', true, 'status', v_ent.status);
  END IF;

  -- Old Stripe deliveries cannot roll a final state backwards.
  IF v_ent.reversed_at IS NOT NULL AND p_event_at < v_ent.reversed_at THEN
    RETURN jsonb_build_object('ok', true, 'ignored', 'stale', 'status', v_ent.status);
  END IF;

  v_previous := COALESCE(v_ent.pre_reversal_status, v_ent.status);
  v_next := v_ent.status;

  IF p_action IN ('refund_full', 'dispute_lost') THEN
    v_next := 'refunded';
  ELSIF p_action = 'dispute_created' THEN
    IF v_ent.status = 'refunded'
       OR (v_ent.reversed_at = p_event_at
           AND v_ent.reversal_reason IN ('dispute_won', 'dispute_lost', 'refund_full')) THEN
      RETURN jsonb_build_object('ok', true, 'ignored', 'terminal', 'status', v_ent.status);
    END IF;
    IF v_ent.status <> 'disputed' THEN
      v_previous := v_ent.status;
    END IF;
    v_next := 'disputed';
  ELSIF p_action = 'dispute_won' THEN
    IF v_ent.status = 'refunded' THEN
      RETURN jsonb_build_object('ok', true, 'ignored', 'refunded', 'status', v_ent.status);
    END IF;
    IF v_ent.status <> 'disputed' THEN
      RETURN jsonb_build_object('ok', true, 'ignored', 'not_disputed', 'status', v_ent.status);
    END IF;
    -- Never resurrect an in-flight lease after a dispute. It may be started
    -- again from paid by the normal guarded fulfillment path.
    v_next := CASE v_previous
      WHEN 'ready' THEN 'ready'
      WHEN 'failed' THEN 'failed'
      WHEN 'refunded' THEN 'refunded'
      ELSE 'paid'
    END;
  END IF;

  v_snapshot_status := CASE
    WHEN v_next = 'refunded' THEN 'refunded'
    WHEN v_next = 'disputed' THEN 'disputed'
    ELSE 'paid'
  END;

  UPDATE public.product_entitlements
     SET status = v_next,
         pre_reversal_status = v_previous,
         reversal_event_id = btrim(p_event_id),
         reversed_at = p_event_at,
         reversal_reason = p_action,
         processing_token = CASE WHEN v_next IN ('refunded', 'disputed') THEN NULL ELSE processing_token END,
         processing_started_at = CASE WHEN v_next IN ('refunded', 'disputed') THEN NULL ELSE processing_started_at END,
         refinement_state = CASE WHEN v_next IN ('refunded', 'disputed') THEN 'idle' ELSE refinement_state END,
         refinement_token = CASE WHEN v_next IN ('refunded', 'disputed') THEN NULL ELSE refinement_token END,
         refinement_started_at = CASE WHEN v_next IN ('refunded', 'disputed') THEN NULL ELSE refinement_started_at END,
         updated_at = now()
   WHERE id = v_ent.id;

  UPDATE public.order_snapshots
     SET payment_status = v_snapshot_status
   WHERE id = v_snapshot.id;

  RETURN jsonb_build_object('ok', true, 'replayed', false, 'status', v_next);
END $$;

REVOKE ALL ON FUNCTION public.record_product_payment_reversal(text,text,text,timestamptz,text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_product_payment_reversal(text,text,text,timestamptz,text)
  TO service_role;

COMMENT ON FUNCTION public.record_product_payment_reversal(text,text,text,timestamptz,text) IS
  'Atomically records exact-session product full-refund/dispute truth; service_role only.';
