-- pgTAP регресия за миграция 0034 (само-четящо търсене + retention на товара).
-- ЗАБЕЛЕЖКА: за изпълнение е нужен Postgres runtime с pgTAP. В тази среда НЕ е
-- изпълнявана. Стартира се с: psql -f supabase/tests/0034_committed_replay_lookup.sql
BEGIN;
SELECT plan(9);

-- 1) Правата: само service_role, нищо за PUBLIC/anon/authenticated.
SELECT ok(
  has_function_privilege('service_role',
    'public.quota_operation_lookup(uuid,uuid,text,text,uuid,text,uuid,text)', 'EXECUTE'),
  'service_role може да изпълни търсенето'
);
SELECT ok(
  NOT has_function_privilege('anon',
    'public.quota_operation_lookup(uuid,uuid,text,text,uuid,text,uuid,text)', 'EXECUTE'),
  'anon НЕ може да изпълни търсенето'
);
SELECT ok(
  NOT has_function_privilege('authenticated',
    'public.quota_operation_lookup(uuid,uuid,text,text,uuid,text,uuid,text)', 'EXECUTE'),
  'authenticated НЕ може да изпълни търсенето'
);

-- 2) Колоните за изтичане на точния отговор съществуват.
SELECT has_column('public', 'anon_delivery_operations', 'response_expires_at',
  'anon_delivery_operations има граница на изтичане');
SELECT has_column('public', 'review_operations', 'response_expires_at',
  'review_operations има граница на изтичане');

-- 3) Липсваща операция → absent, БЕЗ страничен ефект.
SELECT is(
  (SELECT public.quota_operation_lookup(
     '00000000-0000-4000-8000-0000000000aa'::uuid,
     '00000000-0000-4000-8000-0000000000bb'::uuid,
     'contract', 'download-blank', NULL, 'doc-1', NULL, repeat('a', 64)
   ) ->> 'status'),
  'absent',
  'непозната операция е absent'
);
SELECT is(
  (SELECT count(*) FROM public.quota_operations
    WHERE operation_id = '00000000-0000-4000-8000-0000000000aa'::uuid),
  0::bigint,
  'търсенето НЕ създава запис'
);

-- 4) Различно обвързване → conflict.
INSERT INTO public.quota_operations (
  operation_id, user_id, kind, purpose, session_id, doc_key, batch_id,
  request_digest, state, charged, source, lease_expires_at
) VALUES (
  '00000000-0000-4000-8000-0000000000cc'::uuid,
  '00000000-0000-4000-8000-0000000000bb'::uuid,
  'contract', 'download-blank', NULL, 'doc-1', NULL,
  repeat('b', 64), 'committed', true, 'plan', now() + interval '3 minutes'
);
SELECT is(
  (SELECT public.quota_operation_lookup(
     '00000000-0000-4000-8000-0000000000cc'::uuid,
     '00000000-0000-4000-8000-0000000000bb'::uuid,
     'contract', 'download-blank', NULL, 'doc-1', NULL, repeat('c', 64)
   ) ->> 'status'),
  'conflict',
  'друг отпечатък по същия ключ е конфликт'
);

-- 5) Изтекъл товар → сметачът заличава САМО отговора.
SELECT is(
  (SELECT (public.sweep_expired_exact_responses(10, true) ->> 'dry_run')::boolean),
  true,
  'dry-run режимът само отчита'
);

SELECT * FROM finish();
ROLLBACK;
