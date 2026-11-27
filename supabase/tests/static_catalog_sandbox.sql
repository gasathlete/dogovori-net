-- Requires the static_catalog_sandbox migration on an isolated staging DB.
-- Uses an existing staging Auth fixture without reading contact/customer content.
-- Never call Stripe, send email, or persist fixture rows. Every assertion must pass before ROLLBACK.
BEGIN;
CREATE TEMP TABLE static_catalog_test_summary(label text PRIMARY KEY);
DO $$
DECLARE u uuid; a uuid:='20000000-0000-4000-8000-000000000001'; o uuid:='30000000-0000-4000-8000-000000000001';
  h text; rejected boolean; paid timestamptz:='2026-09-30 14:00:00+00';
BEGIN
  SELECT id INTO u FROM auth.users ORDER BY id LIMIT 1;
  IF u IS NULL THEN RAISE EXCEPTION 'isolated_staging_auth_fixture_required'; END IF;
  INSERT INTO public.static_catalog_assets(id,product_key,version,filename,mime_type,content,reviewer_ref,legal_acceptance_ref,legal_accepted_at,amount_cents,stripe_price_id)
  VALUES(a,'synthetic-fixture','test-1','synthetic.pdf','application/pdf',convert_to('%PDF-1.4'||chr(10)||'SYNTHETIC ONLY'||chr(10)||'%%EOF','UTF8'),'TEST-FIXTURE-NOT-A-LEGAL-REVIEW','SYNTHETIC-NOT-ACCEPTANCE',paid,100,'price_synthetic');
  SELECT content_sha256 INTO h FROM public.static_catalog_assets WHERE id=a;
  INSERT INTO public.static_catalog_orders(id,user_id,asset_id,asset_sha256,amount_cents,currency,stripe_price_id,terms_version,refund_version,withdrawal_version,terms_accepted,immediate_performance_consent,withdrawal_loss_acknowledged,stripe_session_id)
  VALUES(o,u,a,h,100,'eur','price_synthetic','test-terms','test-refund','test-withdrawal',true,true,true,'cs_test_synthetic');
  PERFORM public.record_static_catalog_payment(o,'cs_test_synthetic','evt_static_paid',paid,u,a,h,'price_synthetic',100,'eur');
  PERFORM public.record_static_catalog_payment(o,'cs_test_synthetic','evt_static_paid',paid,u,a,h,'price_synthetic',100,'eur');
  -- A different legitimate paid event for the same session must not create another entitlement.
  PERFORM public.record_static_catalog_payment(o,'cs_test_synthetic','evt_static_async',paid+interval '1 second',u,a,h,'price_synthetic',100,'eur');
  IF (SELECT count(*) FROM public.static_catalog_entitlements WHERE order_id=o)<>1 THEN RAISE EXCEPTION 'payment_replay_duplicated'; END IF;
  INSERT INTO static_catalog_test_summary VALUES('atomic_payment_and_replay');
  rejected:=false;
  BEGIN PERFORM public.record_static_catalog_payment(o,'cs_test_synthetic','evt_static_wrong',paid,u,a,h,'price_synthetic',99,'eur'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'wrong_amount_accepted'; END IF;
  rejected:=false;
  BEGIN PERFORM public.record_static_catalog_payment(o,'cs_test_synthetic','evt_static_wrong',paid,u,a,repeat('0',64),'price_synthetic',100,'eur'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'wrong_hash_accepted'; END IF;
  rejected:=false;
  BEGIN PERFORM public.record_static_catalog_payment(o,'cs_live_synthetic','evt_static_wrong',paid,u,a,h,'price_synthetic',100,'eur'); EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'live_session_accepted'; END IF;
  INSERT INTO static_catalog_test_summary VALUES('amount_hash_environment_rejected');
  rejected:=false;
  BEGIN UPDATE public.static_catalog_assets SET content=convert_to('forged','UTF8') WHERE id=a; EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'asset_mutated'; END IF;
  rejected:=false;
  BEGIN UPDATE public.static_catalog_orders SET stripe_session_id='cs_test_other' WHERE id=o; EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'order_mutated'; END IF;
  INSERT INTO static_catalog_test_summary VALUES('immutable_asset_and_order');
  -- Test ownership through the actual authenticated RLS role, not a service-role WHERE clause.
  PERFORM set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000099',true);
  SET LOCAL ROLE authenticated;
  IF (SELECT count(*) FROM public.static_catalog_orders WHERE id=o)<>0 THEN RAISE EXCEPTION 'foreign_order_visible'; END IF;
  IF (SELECT count(*) FROM public.static_catalog_entitlements WHERE order_id=o)<>0 THEN RAISE EXCEPTION 'foreign_entitlement_visible'; END IF;
  RESET ROLE;
  PERFORM set_config('request.jwt.claim.sub',u::text,true);
  SET LOCAL ROLE authenticated;
  IF (SELECT count(*) FROM public.static_catalog_orders WHERE id=o)<>1 THEN RAISE EXCEPTION 'own_order_hidden'; END IF;
  RESET ROLE;
  IF has_table_privilege('authenticated','public.static_catalog_assets','SELECT') OR
    has_table_privilege('authenticated','public.static_catalog_entitlements','INSERT') OR
    has_table_privilege('authenticated','public.static_catalog_orders','UPDATE') OR
    has_function_privilege('authenticated','public.record_static_catalog_payment(uuid,text,text,timestamptz,uuid,uuid,text,text,integer,text)','EXECUTE') OR
    has_function_privilege('anon','public.revoke_static_catalog_payment(text,text,timestamptz,text)','EXECUTE') THEN RAISE EXCEPTION 'client_write_or_asset_access'; END IF;
  INSERT INTO static_catalog_test_summary VALUES('real_role_isolation_and_privileges');
  PERFORM public.revoke_static_catalog_payment('cs_test_synthetic','evt_static_refund',paid+interval '2 seconds','refund_full');
  PERFORM public.revoke_static_catalog_payment('cs_test_synthetic','evt_static_refund',paid+interval '2 seconds','refund_full');
  PERFORM public.record_static_catalog_payment(o,'cs_test_synthetic','evt_static_paid',paid,u,a,h,'price_synthetic',100,'eur');
  IF NOT EXISTS(SELECT 1 FROM public.static_catalog_entitlements WHERE order_id=o AND revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'refund_revived_by_paid_replay'; END IF;
  INSERT INTO static_catalog_test_summary VALUES('refund_revocation_survives_replay');
  -- Refund arriving BEFORE the paid webhook leaves a durable tombstone.
  INSERT INTO public.static_catalog_orders(id,user_id,asset_id,asset_sha256,amount_cents,currency,stripe_price_id,terms_version,refund_version,withdrawal_version,terms_accepted,immediate_performance_consent,withdrawal_loss_acknowledged,stripe_session_id)
  SELECT '30000000-0000-4000-8000-000000000002',user_id,asset_id,asset_sha256,amount_cents,currency,stripe_price_id,terms_version,refund_version,withdrawal_version,terms_accepted,immediate_performance_consent,withdrawal_loss_acknowledged,'cs_test_early_refund' FROM public.static_catalog_orders WHERE id=o;
  PERFORM public.revoke_static_catalog_payment('cs_test_early_refund','evt_static_early_refund',paid+interval '2 seconds','refund_full');
  PERFORM public.record_static_catalog_payment('30000000-0000-4000-8000-000000000002','cs_test_early_refund','evt_static_late_paid',paid,u,a,h,'price_synthetic',100,'eur');
  IF NOT EXISTS(SELECT 1 FROM public.static_catalog_entitlements WHERE stripe_session_id='cs_test_early_refund' AND revoked_at IS NOT NULL) THEN RAISE EXCEPTION 'early_refund_lost'; END IF;
  INSERT INTO static_catalog_test_summary VALUES('out_of_order_refund');
  UPDATE public.static_catalog_assets SET revoked_at=paid WHERE id=a;
  rejected:=false;
  BEGIN UPDATE public.static_catalog_assets SET revoked_at=NULL WHERE id=a; EXCEPTION WHEN OTHERS THEN rejected:=true; END;
  IF NOT rejected THEN RAISE EXCEPTION 'withdrawn_asset_revived'; END IF;
  INSERT INTO static_catalog_test_summary VALUES('legal_withdrawal_irreversible');
END $$;

-- Narrow restore drill: fixture catalog bytes and payment binding, entirely inside this transaction.
CREATE TEMP TABLE static_backup_asset AS SELECT * FROM public.static_catalog_assets WHERE id='20000000-0000-4000-8000-000000000001';
CREATE TEMP TABLE static_backup_orders AS SELECT * FROM public.static_catalog_orders WHERE asset_id='20000000-0000-4000-8000-000000000001';
CREATE TEMP TABLE static_backup_entitlements AS SELECT * FROM public.static_catalog_entitlements WHERE asset_id='20000000-0000-4000-8000-000000000001';
CREATE TEMP TABLE static_backup_events AS SELECT * FROM public.static_catalog_payment_events WHERE stripe_event_id LIKE 'evt_static_%';
DELETE FROM public.static_catalog_entitlements WHERE asset_id='20000000-0000-4000-8000-000000000001';
DELETE FROM public.static_catalog_orders WHERE asset_id='20000000-0000-4000-8000-000000000001';
DELETE FROM public.static_catalog_assets WHERE id='20000000-0000-4000-8000-000000000001';
DELETE FROM public.static_catalog_payment_events WHERE stripe_event_id LIKE 'evt_static_%';
INSERT INTO public.static_catalog_assets(id,product_key,version,filename,mime_type,content,reviewer_ref,legal_acceptance_ref,legal_accepted_at,environment,amount_cents,currency,stripe_price_id,revoked_at,created_at)
SELECT id,product_key,version,filename,mime_type,content,reviewer_ref,legal_acceptance_ref,legal_accepted_at,environment,amount_cents,currency,stripe_price_id,revoked_at,created_at FROM static_backup_asset;
INSERT INTO public.static_catalog_orders SELECT * FROM static_backup_orders;
INSERT INTO public.static_catalog_payment_events SELECT * FROM static_backup_events;
INSERT INTO public.static_catalog_entitlements SELECT * FROM static_backup_entitlements;
DO $$ BEGIN
  IF NOT EXISTS(SELECT 1 FROM public.static_catalog_assets a JOIN static_backup_asset b USING(id) WHERE a.content=b.content AND a.content_sha256=b.content_sha256 AND a.revoked_at=b.revoked_at) THEN RAISE EXCEPTION 'restore_bytes_or_hash_failed'; END IF;
  IF (SELECT count(*) FROM public.static_catalog_entitlements WHERE asset_id='20000000-0000-4000-8000-000000000001' AND revoked_at IS NOT NULL)<>2 THEN RAISE EXCEPTION 'restore_entitlements_failed'; END IF;
  INSERT INTO static_catalog_test_summary VALUES('fixture_restore_bytes_hash_revocation');
END $$;
SELECT label AS passed_scenario FROM static_catalog_test_summary ORDER BY label;
ROLLBACK;
