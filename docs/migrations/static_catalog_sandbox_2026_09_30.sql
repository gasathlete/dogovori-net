-- Sandbox-only static delivery. No existing catalog/customer tables are modified.
-- Apply to staging first. Legal files are loaded by a trusted operator, never a browser.
CREATE TABLE public.static_catalog_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_key text NOT NULL CHECK (product_key ~ '^[a-z0-9][a-z0-9-]{1,79}$'),
  version text NOT NULL CHECK (length(version) BETWEEN 1 AND 80),
  filename text NOT NULL CHECK (filename ~ '^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$' AND filename NOT LIKE '%..%'),
  mime_type text NOT NULL CHECK (mime_type IN ('application/pdf','application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
  content bytea NOT NULL CHECK (octet_length(content) BETWEEN 1 AND 2097152),
  content_sha256 text GENERATED ALWAYS AS (encode(extensions.digest(content,'sha256'),'hex')) STORED,
  reviewer_ref text NOT NULL CHECK (length(trim(reviewer_ref)) BETWEEN 1 AND 200),
  legal_acceptance_ref text NOT NULL CHECK (length(trim(legal_acceptance_ref)) BETWEEN 1 AND 200),
  legal_accepted_at timestamptz NOT NULL,
  environment text NOT NULL DEFAULT 'sandbox' CHECK (environment = 'sandbox'),
  amount_cents integer NOT NULL CHECK (amount_cents BETWEEN 1 AND 100000),
  currency text NOT NULL DEFAULT 'eur' CHECK (currency='eur'),
  stripe_price_id text NOT NULL CHECK (stripe_price_id LIKE 'price_%'),
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(product_key,version)
);

CREATE FUNCTION public.guard_static_catalog_asset() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF (to_jsonb(NEW)-'revoked_at'-'content_sha256') IS DISTINCT FROM (to_jsonb(OLD)-'revoked_at'-'content_sha256')
    OR (OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at) THEN
    RAISE EXCEPTION 'static_asset_immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER static_asset_immutable BEFORE UPDATE ON public.static_catalog_assets
FOR EACH ROW EXECUTE FUNCTION public.guard_static_catalog_asset();

CREATE TABLE public.static_catalog_orders (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id),
  asset_id uuid NOT NULL REFERENCES public.static_catalog_assets(id),
  asset_sha256 text NOT NULL CHECK (asset_sha256 ~ '^[0-9a-f]{64}$'),
  amount_cents integer NOT NULL CHECK (amount_cents>0),
  currency text NOT NULL CHECK (currency='eur'),
  stripe_price_id text NOT NULL,
  terms_version text NOT NULL CHECK(length(trim(terms_version))>0),
  refund_version text NOT NULL CHECK(length(trim(refund_version))>0),
  withdrawal_version text NOT NULL CHECK(length(trim(withdrawal_version))>0),
  consent_recorded_at timestamptz NOT NULL DEFAULT now(),
  terms_accepted boolean NOT NULL CHECK(terms_accepted),
  immediate_performance_consent boolean NOT NULL CHECK(immediate_performance_consent),
  withdrawal_loss_acknowledged boolean NOT NULL CHECK(withdrawal_loss_acknowledged),
  environment text NOT NULL DEFAULT 'sandbox' CHECK(environment='sandbox'),
  stripe_session_id text UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE FUNCTION public.guard_static_catalog_order() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public AS $$
BEGIN
  IF (to_jsonb(NEW)-'stripe_session_id') IS DISTINCT FROM (to_jsonb(OLD)-'stripe_session_id')
    OR (OLD.stripe_session_id IS NOT NULL AND NEW.stripe_session_id IS DISTINCT FROM OLD.stripe_session_id) THEN
    RAISE EXCEPTION 'static_order_immutable';
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER static_order_immutable BEFORE UPDATE ON public.static_catalog_orders
FOR EACH ROW EXECUTE FUNCTION public.guard_static_catalog_order();

CREATE TABLE public.static_catalog_payment_events (
  stripe_event_id text PRIMARY KEY,
  stripe_session_id text NOT NULL,
  event_at timestamptz NOT NULL,
  kind text NOT NULL CHECK(kind IN ('paid','refund_full','dispute_created')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.static_catalog_entitlements (
  order_id uuid PRIMARY KEY REFERENCES public.static_catalog_orders(id),
  user_id uuid NOT NULL REFERENCES auth.users(id),
  asset_id uuid NOT NULL REFERENCES public.static_catalog_assets(id),
  asset_sha256 text NOT NULL,
  stripe_session_id text NOT NULL UNIQUE,
  stripe_event_id text NOT NULL UNIQUE REFERENCES public.static_catalog_payment_events(stripe_event_id),
  paid_at timestamptz NOT NULL,
  revoked_at timestamptz,
  revoked_reason text,
  environment text NOT NULL DEFAULT 'sandbox' CHECK(environment='sandbox')
);

ALTER TABLE public.static_catalog_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.static_catalog_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.static_catalog_payment_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.static_catalog_entitlements ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.static_catalog_assets,public.static_catalog_orders,public.static_catalog_payment_events,public.static_catalog_entitlements FROM PUBLIC,anon,authenticated;
GRANT SELECT ON public.static_catalog_orders,public.static_catalog_entitlements TO authenticated;
CREATE POLICY static_orders_read_own ON public.static_catalog_orders FOR SELECT TO authenticated USING(user_id=auth.uid());
CREATE POLICY static_entitlements_read_own ON public.static_catalog_entitlements FOR SELECT TO authenticated USING(user_id=auth.uid());
GRANT SELECT,INSERT,UPDATE ON public.static_catalog_assets,public.static_catalog_orders TO service_role;
GRANT SELECT ON public.static_catalog_payment_events,public.static_catalog_entitlements TO service_role;

-- Only the verified webhook invokes this. Database rechecks the immutable snapshot.
CREATE FUNCTION public.record_static_catalog_payment(
  p_order_id uuid,p_session_id text,p_event_id text,p_paid_at timestamptz,
  p_user_id uuid,p_asset_id uuid,p_asset_sha256 text,p_price_id text,p_amount_cents integer,p_currency text
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE o public.static_catalog_orders; a public.static_catalog_assets; e public.static_catalog_payment_events; reversal_at timestamptz;
BEGIN
  IF p_session_id !~ '^cs_test_[A-Za-z0-9_]+$' OR p_event_id !~ '^evt_[A-Za-z0-9_]+$' OR p_paid_at IS NULL THEN RAISE EXCEPTION 'invalid_payment_proof'; END IF;
  -- Serializes paid and reversal deliveries for the same Stripe session, including out-of-order webhooks.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id,0));
  SELECT * INTO o FROM public.static_catalog_orders WHERE id=p_order_id FOR UPDATE;
  SELECT * INTO a FROM public.static_catalog_assets WHERE id=o.asset_id FOR SHARE;
  IF o.id IS NULL OR a.id IS NULL OR o.stripe_session_id IS DISTINCT FROM p_session_id
    OR o.user_id IS DISTINCT FROM p_user_id OR o.asset_id IS DISTINCT FROM p_asset_id
    OR o.asset_sha256 IS DISTINCT FROM p_asset_sha256 OR a.content_sha256 IS DISTINCT FROM p_asset_sha256
    OR o.amount_cents IS DISTINCT FROM p_amount_cents OR a.amount_cents IS DISTINCT FROM p_amount_cents
    OR o.currency IS DISTINCT FROM p_currency OR a.currency IS DISTINCT FROM p_currency
    OR o.stripe_price_id IS DISTINCT FROM p_price_id OR a.stripe_price_id IS DISTINCT FROM p_price_id
    OR NOT o.terms_accepted OR NOT o.immediate_performance_consent OR NOT o.withdrawal_loss_acknowledged THEN
    RAISE EXCEPTION 'static_payment_mismatch';
  END IF;
  INSERT INTO public.static_catalog_payment_events(stripe_event_id,stripe_session_id,event_at,kind)
  VALUES(p_event_id,p_session_id,p_paid_at,'paid') ON CONFLICT DO NOTHING;
  SELECT * INTO e FROM public.static_catalog_payment_events WHERE stripe_event_id=p_event_id;
  IF e.stripe_session_id IS DISTINCT FROM p_session_id OR e.kind<>'paid' OR e.event_at IS DISTINCT FROM p_paid_at THEN RAISE EXCEPTION 'static_event_conflict'; END IF;
  SELECT min(event_at) INTO reversal_at FROM public.static_catalog_payment_events WHERE stripe_session_id=p_session_id AND kind<>'paid';
  INSERT INTO public.static_catalog_entitlements(order_id,user_id,asset_id,asset_sha256,stripe_session_id,stripe_event_id,paid_at,revoked_at,revoked_reason)
  VALUES(o.id,o.user_id,o.asset_id,o.asset_sha256,p_session_id,p_event_id,p_paid_at,reversal_at,CASE WHEN reversal_at IS NULL THEN NULL ELSE 'payment_reversed' END)
  ON CONFLICT(order_id) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.static_catalog_entitlements WHERE order_id=o.id AND stripe_session_id=p_session_id
    AND user_id=p_user_id AND asset_id=p_asset_id AND asset_sha256=p_asset_sha256) THEN RAISE EXCEPTION 'static_entitlement_conflict'; END IF;
  RETURN jsonb_build_object('ok',true);
END $$;

CREATE FUNCTION public.revoke_static_catalog_payment(p_session_id text,p_event_id text,p_event_at timestamptz,p_kind text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public AS $$
DECLARE e public.static_catalog_payment_events;
BEGIN
  IF p_session_id !~ '^cs_test_[A-Za-z0-9_]+$' OR p_event_id !~ '^evt_[A-Za-z0-9_]+$' OR p_event_at IS NULL OR p_kind NOT IN ('refund_full','dispute_created') THEN RAISE EXCEPTION 'invalid_reversal_proof'; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id,0));
  INSERT INTO public.static_catalog_payment_events(stripe_event_id,stripe_session_id,event_at,kind)
  VALUES(p_event_id,p_session_id,p_event_at,p_kind) ON CONFLICT DO NOTHING;
  SELECT * INTO e FROM public.static_catalog_payment_events WHERE stripe_event_id=p_event_id;
  IF e.stripe_session_id IS DISTINCT FROM p_session_id OR e.kind IS DISTINCT FROM p_kind OR e.event_at IS DISTINCT FROM p_event_at THEN RAISE EXCEPTION 'static_event_conflict'; END IF;
  UPDATE public.static_catalog_entitlements SET revoked_at=coalesce(revoked_at,p_event_at),revoked_reason=coalesce(revoked_reason,p_kind) WHERE stripe_session_id=p_session_id;
  RETURN jsonb_build_object('ok',true);
END $$;

REVOKE ALL ON FUNCTION public.record_static_catalog_payment(uuid,text,text,timestamptz,uuid,uuid,text,text,integer,text),public.revoke_static_catalog_payment(text,text,timestamptz,text),public.guard_static_catalog_asset(),public.guard_static_catalog_order() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.record_static_catalog_payment(uuid,text,text,timestamptz,uuid,uuid,text,text,integer,text),public.revoke_static_catalog_payment(text,text,timestamptz,text) TO service_role;
