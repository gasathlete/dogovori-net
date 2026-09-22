BEGIN;
SET LOCAL search_path TO public, extensions, auth, storage;
SELECT plan(10);

SELECT has_function('public', 'record_product_payment_reversal',
  ARRAY['text', 'text', 'text', 'timestamp with time zone', 'text'],
  'product reversal RPC exists with the exact signature');

SELECT ok(NOT has_function_privilege('public',
  'public.record_product_payment_reversal(text,text,text,timestamptz,text)', 'EXECUTE'),
  'PUBLIC cannot execute product reversal');
SELECT ok(NOT has_function_privilege('anon',
  'public.record_product_payment_reversal(text,text,text,timestamptz,text)', 'EXECUTE'),
  'anon cannot execute product reversal');
SELECT ok(NOT has_function_privilege('authenticated',
  'public.record_product_payment_reversal(text,text,text,timestamptz,text)', 'EXECUTE'),
  'authenticated cannot execute product reversal');
SELECT ok(has_function_privilege('service_role',
  'public.record_product_payment_reversal(text,text,text,timestamptz,text)', 'EXECUTE'),
  'service_role can execute product reversal');

SELECT ok((SELECT p.prosecdef
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'record_product_payment_reversal'),
  'product reversal is SECURITY DEFINER');
SELECT is((SELECT p.proconfig
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'record_product_payment_reversal'),
  ARRAY['search_path=""']::text[],
  'product reversal pins an empty search_path');

SELECT is((SELECT count(*)::int FROM information_schema.columns
  WHERE table_schema = 'public' AND table_name = 'product_entitlements'
    AND column_name IN (
      'pre_reversal_status','reversal_event_id','reversed_at','reversal_reason')),
  4, 'entitlement has all four bounded reversal evidence columns');

SELECT ok(EXISTS (SELECT 1 FROM pg_constraint
  WHERE conrelid = 'public.product_entitlements'::regclass
    AND conname = 'product_entitlements_reversal_ck'),
  'bounded reversal evidence constraint exists');
SELECT ok(EXISTS (SELECT 1 FROM pg_constraint
  WHERE conrelid = 'public.order_snapshots'::regclass
    AND conname = 'order_snapshots_payment_status_ck'),
  'order snapshot reversal-status constraint exists');

SELECT * FROM finish();
ROLLBACK;
