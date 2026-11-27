-- =============================================================================
-- pgTAP регресии за инвариантите „точно еднократно" (миграция 0035).
-- ВНИМАНИЕ: в средата на разработка няма PostgreSQL runtime, затова тези
-- проверки са НЕизпълнени. Изпълняват се срещу празна тестова база:
--   psql -f supabase/migrations/*_quota_result_retention_and_review_lookup.sql
--   psql -f supabase/tests/0035_exact_once_invariants.sql
-- =============================================================================
BEGIN;
SELECT plan(14);

-- 1) Правата са само за service_role -----------------------------------------
SELECT ok(
  NOT has_function_privilege('anon', 'public.quota_operation_lookup(uuid,uuid,text,text,text,text,uuid,text)', 'EXECUTE'),
  'anon не може да търси завършена операция'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.quota_operation_lookup(uuid,uuid,text,text,text,text,uuid,text)', 'EXECUTE'),
  'authenticated не може да търси завършена операция'
);
SELECT ok(
  has_function_privilege('service_role', 'public.quota_operation_lookup(uuid,uuid,text,text,text,text,uuid,text)', 'EXECUTE'),
  'service_role може да търси завършена операция'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.review_operation_lookup(uuid,text,text,uuid,uuid,text,uuid)', 'EXECUTE'),
  'authenticated не може да търси ревизия'
);

-- Тестов потребител и завършена операция --------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'test@example.com');

SELECT public.quota_reserve(
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'analysis', 'analyze_contract', 'sess-1', 'doc-1', NULL,
  repeat('a', 64)
);

-- 2) Един и същ ключ с РАЗЛИЧЕН payload е конфликт, не ново право -------------
SELECT is(
  (public.quota_operation_lookup(
    'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'analysis', 'analyze_contract', 'sess-1', 'doc-1', NULL,
    repeat('b', 64)
  ) ->> 'status'),
  'conflict',
  'различен отпечатък при същия ключ дава конфликт'
);

-- 3) Активна резервация е in_progress, а не ново изпълнение -------------------
SELECT is(
  (public.quota_operation_lookup(
    'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'analysis', 'analyze_contract', 'sess-1', 'doc-1', NULL,
    repeat('a', 64)
  ) ->> 'status'),
  'in_progress',
  'активната резервация е в процес'
);

-- 4) Търсенето НЕ резервира и НЕ начислява ------------------------------------
SELECT is(
  (SELECT count(*)::int FROM public.quota_operations
    WHERE operation_id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid),
  1,
  'търсенето не създава нови редове'
);

-- 5) Потвърждаване записва точния отговор и срок на пазене -------------------
SELECT public.quota_commit(
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  repeat('a', 64),
  jsonb_build_object('analysis', 'резултат')
);
SELECT ok(
  (SELECT result_ref_expires_at IS NOT NULL FROM public.quota_operations
    WHERE operation_id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid),
  'съдържателният отговор получава срок на пазене'
);
SELECT is(
  (public.quota_operation_lookup(
    'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'analysis', 'analyze_contract', 'sess-1', 'doc-1', NULL,
    repeat('a', 64)
  ) ->> 'status'),
  'committed',
  'потвърдената операция се връща като завършена'
);
SELECT is(
  (public.quota_operation_lookup(
    'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'analysis', 'analyze_contract', 'sess-1', 'doc-1', NULL,
    repeat('a', 64)
  ) -> 'result_ref' ->> 'analysis'),
  'резултат',
  'точно записаният отговор се връща без промяна'
);

-- 6) Повторно потвърждаване е безплатно (без второ начисляване) ---------------
SELECT public.quota_commit(
  'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  repeat('a', 64),
  jsonb_build_object('analysis', 'резултат')
);
SELECT is(
  (SELECT count(*)::int FROM public.quota_operations
    WHERE user_id = '11111111-1111-1111-1111-111111111111'::uuid),
  1,
  'повторното потвърждаване не създава второ начисляване'
);

-- 7) Отмяната е източникът на компенсация, не отделен refund -----------------
SELECT public.quota_reserve(
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'analysis', 'analyze_contract', 'sess-2', 'doc-2', NULL,
  repeat('c', 64)
);
SELECT public.quota_cancel(
  'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  repeat('c', 64),
  'model_failed'
);
SELECT is(
  (public.quota_operation_lookup(
    'aaaaaaaa-0000-0000-0000-000000000002'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'analysis', 'analyze_contract', 'sess-2', 'doc-2', NULL,
    repeat('c', 64)
  ) ->> 'status'),
  'absent',
  'доказано отменената операция позволява нов опит'
);

-- 8) Изтичане на срока: никога празен или друг отговор -----------------------
UPDATE public.quota_operations
   SET result_ref_expires_at = now() - interval '1 minute'
 WHERE operation_id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid;
SELECT is(
  (public.quota_operation_lookup(
    'aaaaaaaa-0000-0000-0000-000000000001'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'analysis', 'analyze_contract', 'sess-1', 'doc-1', NULL,
    repeat('a', 64)
  ) ->> 'status'),
  'response_expired',
  'изтеклият отговор се обявява явно'
);

-- 9) Метенето заличава само отговора, не счетоводството ----------------------
SELECT ok(
  ((public.sweep_expired_quota_results(500, false) ->> 'cleared')::int >= 1),
  'метенето заличава изтеклите отговори'
);
SELECT ok(
  (SELECT result_ref IS NULL AND committed_at IS NOT NULL FROM public.quota_operations
    WHERE operation_id = 'aaaaaaaa-0000-0000-0000-000000000001'::uuid),
  'счетоводните данни остават след заличаване на отговора'
);

SELECT * FROM finish();
ROLLBACK;
