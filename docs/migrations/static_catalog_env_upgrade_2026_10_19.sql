-- Additive upgrade of static_catalog_sandbox_2026_09_30 (already applied on the isolated staging project).
-- Adds live environment support with strict isolation and a human review ledger. Rollback: static_catalog_env_upgrade_2026_10_19.rollback.sql
-- Apply to staging first. Live checkout stays closed by STATIC_CATALOG_LIVE_CHECKOUT_ENABLED (default unset).

-- 1. Environment may be sandbox or live on every table.
ALTER TABLE public.static_catalog_assets DROP CONSTRAINT IF EXISTS static_catalog_assets_environment_check;
ALTER TABLE public.static_catalog_assets ADD CONSTRAINT static_catalog_assets_environment_check CHECK (environment IN ('sandbox','live'));
ALTER TABLE public.static_catalog_orders DROP CONSTRAINT IF EXISTS static_catalog_orders_environment_check;
ALTER TABLE public.static_catalog_orders ADD CONSTRAINT static_catalog_orders_environment_check CHECK (environment IN ('sandbox','live'));
ALTER TABLE public.static_catalog_entitlements DROP CONSTRAINT IF EXISTS static_catalog_entitlements_environment_check;
ALTER TABLE public.static_catalog_entitlements ADD CONSTRAINT static_catalog_entitlements_environment_check CHECK (environment IN ('sandbox','live'));
ALTER TABLE public.static_catalog_payment_events ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'sandbox' CHECK (environment IN ('sandbox','live'));

-- 2. Canonical identity and provenance (nullable: existing rows have none; code requires them for new assets).
ALTER TABLE public.static_catalog_assets ADD COLUMN IF NOT EXISTS template_slug text CHECK (template_slug ~ '^[a-z0-9][a-z0-9-]{1,119}$');
ALTER TABLE public.static_catalog_assets ADD COLUMN IF NOT EXISTS source_ref text CHECK (length(source_ref) BETWEEN 1 AND 300);
ALTER TABLE public.static_catalog_assets ADD COLUMN IF NOT EXISTS uploaded_by uuid;

-- 3. Authorized reviewers: written only by service role (operator onboarding), never by the app.
CREATE TABLE IF NOT EXISTS public.static_catalog_reviewers (
  user_id uuid PRIMARY KEY,
  display_name text NOT NULL CHECK (length(trim(display_name)) BETWEEN 2 AND 120),
  capacity text NOT NULL CHECK (capacity IN ('lawyer','owner_operator')),
  credential_ref text CHECK (length(credential_ref) <= 200),
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.static_catalog_reviewers TO service_role;
ALTER TABLE public.static_catalog_reviewers ENABLE ROW LEVEL SECURITY;

-- 4. Review ledger bound to exact asset bytes. Append-only. Asset is sellable only with an accepted, non-superseded review.
CREATE TABLE IF NOT EXISTS public.static_catalog_asset_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  asset_id uuid NOT NULL REFERENCES public.static_catalog_assets(id),
  asset_sha256 text NOT NULL CHECK (asset_sha256 ~ '^[0-9a-f]{64}$'),
  reviewer_user_id uuid NOT NULL REFERENCES public.static_catalog_reviewers(user_id),
  reviewer_capacity text NOT NULL CHECK (reviewer_capacity IN ('lawyer','owner_operator')),
  decision text NOT NULL CHECK (decision IN ('accepted','rejected')),
  review_ref text NOT NULL CHECK (length(trim(review_ref)) BETWEEN 3 AND 200),
  evidence_note text CHECK (length(evidence_note) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS static_reviews_asset ON public.static_catalog_asset_reviews(asset_id, created_at DESC);
GRANT SELECT, INSERT ON public.static_catalog_asset_reviews TO service_role;
ALTER TABLE public.static_catalog_asset_reviews ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.guard_static_catalog_review() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
DECLARE a public.static_catalog_assets; r public.static_catalog_reviewers;
BEGIN
  IF TG_OP <> 'INSERT' THEN RAISE EXCEPTION 'static_review_append_only'; END IF;
  SELECT * INTO a FROM public.static_catalog_assets WHERE id = NEW.asset_id;
  SELECT * INTO r FROM public.static_catalog_reviewers WHERE user_id = NEW.reviewer_user_id;
  IF a.id IS NULL OR a.content_sha256 IS DISTINCT FROM NEW.asset_sha256 THEN RAISE EXCEPTION 'static_review_hash_mismatch'; END IF;
  IF r.user_id IS NULL OR NOT r.active OR r.capacity IS DISTINCT FROM NEW.reviewer_capacity THEN RAISE EXCEPTION 'static_reviewer_unauthorized'; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS static_review_guard ON public.static_catalog_asset_reviews;
CREATE TRIGGER static_review_guard BEFORE INSERT OR UPDATE OR DELETE ON public.static_catalog_asset_reviews
FOR EACH ROW EXECUTE FUNCTION public.guard_static_catalog_review();

-- 5. Environment-checked payment recording. Session prefix must match environment; order/asset environment must match.
CREATE OR REPLACE FUNCTION public.record_static_catalog_payment_env(
  p_environment text,p_order_id uuid,p_session_id text,p_event_id text,p_paid_at timestamptz,
  p_user_id uuid,p_asset_id uuid,p_asset_sha256 text,p_price_id text,p_amount_cents integer,p_currency text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.static_catalog_orders; a public.static_catalog_assets; e public.static_catalog_payment_events; reversal_at timestamptz;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND session_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_environment NOT IN ('sandbox','live')
    OR p_session_id !~ (CASE p_environment WHEN 'live' THEN '^cs_live_[A-Za-z0-9_]+$' ELSE '^cs_test_[A-Za-z0-9_]+$' END)
    OR p_event_id !~ '^evt_[A-Za-z0-9_]+$' OR p_paid_at IS NULL THEN RAISE EXCEPTION 'invalid_payment_proof'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id,0));
  SELECT * INTO o FROM public.static_catalog_orders WHERE id=p_order_id FOR UPDATE;
  SELECT * INTO a FROM public.static_catalog_assets WHERE id=o.asset_id FOR SHARE;
  IF o.id IS NULL OR a.id IS NULL OR o.environment IS DISTINCT FROM p_environment OR a.environment IS DISTINCT FROM p_environment
    OR o.stripe_session_id IS DISTINCT FROM p_session_id
    OR o.user_id IS DISTINCT FROM p_user_id OR o.asset_id IS DISTINCT FROM p_asset_id
    OR o.asset_sha256 IS DISTINCT FROM p_asset_sha256 OR a.content_sha256 IS DISTINCT FROM p_asset_sha256
    OR o.amount_cents IS DISTINCT FROM p_amount_cents OR a.amount_cents IS DISTINCT FROM p_amount_cents
    OR o.currency IS DISTINCT FROM p_currency OR a.currency IS DISTINCT FROM p_currency
    OR o.stripe_price_id IS DISTINCT FROM p_price_id OR a.stripe_price_id IS DISTINCT FROM p_price_id
    OR NOT o.terms_accepted OR NOT o.immediate_performance_consent OR NOT o.withdrawal_loss_acknowledged THEN
    RAISE EXCEPTION 'static_payment_mismatch';
  END IF;
  INSERT INTO public.static_catalog_payment_events(stripe_event_id,stripe_session_id,event_at,kind,environment)
  VALUES(p_event_id,p_session_id,p_paid_at,'paid',p_environment) ON CONFLICT DO NOTHING;
  SELECT * INTO e FROM public.static_catalog_payment_events WHERE stripe_event_id=p_event_id;
  IF e.stripe_session_id IS DISTINCT FROM p_session_id OR e.kind<>'paid' OR e.event_at IS DISTINCT FROM p_paid_at OR e.environment IS DISTINCT FROM p_environment THEN RAISE EXCEPTION 'static_event_conflict'; END IF;
  SELECT min(event_at) INTO reversal_at FROM public.static_catalog_payment_events WHERE stripe_session_id=p_session_id AND kind<>'paid';
  INSERT INTO public.static_catalog_entitlements(order_id,user_id,asset_id,asset_sha256,stripe_session_id,stripe_event_id,paid_at,revoked_at,revoked_reason,environment)
  VALUES(o.id,o.user_id,o.asset_id,o.asset_sha256,p_session_id,p_event_id,p_paid_at,reversal_at,CASE WHEN reversal_at IS NULL THEN NULL ELSE 'payment_reversed' END,p_environment)
  ON CONFLICT(order_id) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.static_catalog_entitlements WHERE order_id=o.id AND stripe_session_id=p_session_id
    AND user_id=p_user_id AND asset_id=p_asset_id AND asset_sha256=p_asset_sha256 AND environment=p_environment) THEN RAISE EXCEPTION 'static_entitlement_conflict'; END IF;
  RETURN jsonb_build_object('ok',true);
END $$;

CREATE OR REPLACE FUNCTION public.revoke_static_catalog_payment_env(p_environment text,p_session_id text,p_event_id text,p_event_at timestamptz,p_kind text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE e public.static_catalog_payment_events;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' AND session_user NOT IN ('postgres','supabase_admin') THEN RAISE EXCEPTION 'service_role_required'; END IF;
  IF p_environment NOT IN ('sandbox','live')
    OR p_session_id !~ (CASE p_environment WHEN 'live' THEN '^cs_live_[A-Za-z0-9_]+$' ELSE '^cs_test_[A-Za-z0-9_]+$' END)
    OR p_event_id !~ '^evt_[A-Za-z0-9_]+$' OR p_event_at IS NULL OR p_kind NOT IN ('refund_full','dispute_created') THEN RAISE EXCEPTION 'invalid_reversal_proof'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id,0));
  INSERT INTO public.static_catalog_payment_events(stripe_event_id,stripe_session_id,event_at,kind,environment)
  VALUES(p_event_id,p_session_id,p_event_at,p_kind,p_environment) ON CONFLICT DO NOTHING;
  SELECT * INTO e FROM public.static_catalog_payment_events WHERE stripe_event_id=p_event_id;
  IF e.stripe_session_id IS DISTINCT FROM p_session_id OR e.kind IS DISTINCT FROM p_kind OR e.event_at IS DISTINCT FROM p_event_at OR e.environment IS DISTINCT FROM p_environment THEN RAISE EXCEPTION 'static_event_conflict'; END IF;
  UPDATE public.static_catalog_entitlements SET revoked_at=coalesce(revoked_at,p_event_at),revoked_reason=coalesce(revoked_reason,p_kind)
   WHERE stripe_session_id=p_session_id AND environment=p_environment;
  RETURN jsonb_build_object('ok',true);
END $$;

REVOKE ALL ON FUNCTION public.record_static_catalog_payment_env(text,uuid,text,text,timestamptz,uuid,uuid,text,text,integer,text),
  public.revoke_static_catalog_payment_env(text,text,text,timestamptz,text),public.guard_static_catalog_review() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_static_catalog_payment_env(text,uuid,text,text,timestamptz,uuid,uuid,text,text,integer,text),
  public.revoke_static_catalog_payment_env(text,text,text,timestamptz,text) TO service_role;
