-- Rollback of static_catalog_env_upgrade_2026_10_19. Refuses to run if any live row exists (would lose paid proof).
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM public.static_catalog_orders WHERE environment='live')
     OR EXISTS (SELECT 1 FROM public.static_catalog_payment_events WHERE environment='live')
     OR EXISTS (SELECT 1 FROM public.static_catalog_assets WHERE environment='live') THEN
    RAISE EXCEPTION 'rollback_blocked_live_rows_exist';
  END IF;
END $$;
DROP FUNCTION IF EXISTS public.record_static_catalog_payment_env(text,uuid,text,text,timestamptz,uuid,uuid,text,text,integer,text);
DROP FUNCTION IF EXISTS public.revoke_static_catalog_payment_env(text,text,text,timestamptz,text);
DROP TABLE IF EXISTS public.static_catalog_asset_reviews;
DROP FUNCTION IF EXISTS public.guard_static_catalog_review();
DROP TABLE IF EXISTS public.static_catalog_reviewers;
ALTER TABLE public.static_catalog_assets DROP COLUMN IF EXISTS template_slug, DROP COLUMN IF EXISTS source_ref, DROP COLUMN IF EXISTS uploaded_by;
ALTER TABLE public.static_catalog_payment_events DROP COLUMN IF EXISTS environment;
ALTER TABLE public.static_catalog_assets DROP CONSTRAINT IF EXISTS static_catalog_assets_environment_check;
ALTER TABLE public.static_catalog_assets ADD CONSTRAINT static_catalog_assets_environment_check CHECK (environment='sandbox');
ALTER TABLE public.static_catalog_orders DROP CONSTRAINT IF EXISTS static_catalog_orders_environment_check;
ALTER TABLE public.static_catalog_orders ADD CONSTRAINT static_catalog_orders_environment_check CHECK (environment='sandbox');
ALTER TABLE public.static_catalog_entitlements DROP CONSTRAINT IF EXISTS static_catalog_entitlements_environment_check;
ALTER TABLE public.static_catalog_entitlements ADD CONSTRAINT static_catalog_entitlements_environment_check CHECK (environment='sandbox');
