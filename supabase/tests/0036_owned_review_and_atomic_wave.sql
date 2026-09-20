-- =============================================================================
-- pgTAP регресии за собствените операции по ревизия и атомарната вълна
-- поправки (миграция 0036).
-- ВНИМАНИЕ: в средата на разработка няма PostgreSQL runtime, затова тези
-- проверки са НЕизпълнени (само статичен преглед). Изпълняват се срещу
-- празна тестова база:
--   psql -f drizzle/migrations/0036_owned_review_and_atomic_wave.sql
--   psql -f supabase/tests/0036_owned_review_and_atomic_wave.sql
-- =============================================================================
BEGIN;
SELECT plan(69);

-- 1) Правата над функциите за собствен преглед: само service_role -----------
SELECT ok(
  NOT has_function_privilege('anon', 'public.owned_review_operation_lookup(uuid,uuid,uuid,text,text,text,text)', 'EXECUTE'),
  'anon не може да търси собствена операция по ревизия'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.owned_review_operation_lookup(uuid,uuid,uuid,text,text,text,text)', 'EXECUTE'),
  'authenticated не може да търси собствена операция по ревизия'
);
SELECT ok(
  NOT has_function_privilege('public', 'public.owned_review_operation_lookup(uuid,uuid,uuid,text,text,text,text)', 'EXECUTE'),
  'PUBLIC няма право за търсене на собствена операция по ревизия'
);
SELECT ok(
  has_function_privilege('service_role', 'public.owned_review_operation_lookup(uuid,uuid,uuid,text,text,text,text)', 'EXECUTE'),
  'service_role може да търси собствена операция по ревизия'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.owned_review_operation_reserve(uuid,uuid,uuid,text,text,text,text,integer)', 'EXECUTE'),
  'anon не може да резервира собствена операция по ревизия'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.owned_review_operation_reserve(uuid,uuid,uuid,text,text,text,text,integer)', 'EXECUTE'),
  'authenticated не може да резервира собствена операция по ревизия'
);
SELECT ok(
  has_function_privilege('service_role', 'public.owned_review_operation_reserve(uuid,uuid,uuid,text,text,text,text,integer)', 'EXECUTE'),
  'service_role може да резервира собствена операция по ревизия'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.owned_review_operation_commit(uuid,uuid,jsonb)', 'EXECUTE'),
  'anon не може да потвърждава собствена операция по ревизия'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.owned_review_operation_commit(uuid,uuid,jsonb)', 'EXECUTE'),
  'authenticated не може да потвърждава собствена операция по ревизия'
);
SELECT ok(
  has_function_privilege('service_role', 'public.owned_review_operation_commit(uuid,uuid,jsonb)', 'EXECUTE'),
  'service_role може да потвърждава собствена операция по ревизия'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.owned_review_operation_cancel(uuid,uuid,text)', 'EXECUTE'),
  'anon не може да отменя собствена операция по ревизия'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.owned_review_operation_cancel(uuid,uuid,text)', 'EXECUTE'),
  'authenticated не може да отменя собствена операция по ревизия'
);
SELECT ok(
  has_function_privilege('service_role', 'public.owned_review_operation_cancel(uuid,uuid,text)', 'EXECUTE'),
  'service_role може да отменя собствена операция по ревизия'
);

-- 2) Правата над функциите за вълна поправки: само service_role -------------
SELECT ok(
  NOT has_function_privilege('anon', 'public.quota_wave_reserve(uuid,uuid,text,text,text,text,uuid,text,integer,integer)', 'EXECUTE'),
  'anon не може да резервира вълна поправки'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.quota_wave_reserve(uuid,uuid,text,text,text,text,uuid,text,integer,integer)', 'EXECUTE'),
  'authenticated не може да резервира вълна поправки'
);
SELECT ok(
  has_function_privilege('service_role', 'public.quota_wave_reserve(uuid,uuid,text,text,text,text,uuid,text,integer,integer)', 'EXECUTE'),
  'service_role може да резервира вълна поправки'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.quota_wave_commit(uuid,uuid,jsonb)', 'EXECUTE'),
  'anon не може да потвърждава вълна поправки'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.quota_wave_commit(uuid,uuid,jsonb)', 'EXECUTE'),
  'authenticated не може да потвърждава вълна поправки'
);
SELECT ok(
  has_function_privilege('service_role', 'public.quota_wave_commit(uuid,uuid,jsonb)', 'EXECUTE'),
  'service_role може да потвърждава вълна поправки'
);
SELECT ok(
  NOT has_function_privilege('anon', 'public.quota_wave_cancel(uuid,uuid,text)', 'EXECUTE'),
  'anon не може да отменя вълна поправки'
);
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.quota_wave_cancel(uuid,uuid,text)', 'EXECUTE'),
  'authenticated не може да отменя вълна поправки'
);
SELECT ok(
  has_function_privilege('service_role', 'public.quota_wave_cancel(uuid,uuid,text)', 'EXECUTE'),
  'service_role може да отменя вълна поправки'
);

-- 3) Няма ТАБЛИЧНИ права над public.quota_wave_operations за anon/authenticated
SELECT ok(
  NOT has_table_privilege('anon', 'public.quota_wave_operations', 'SELECT'),
  'anon няма право на четене над quota_wave_operations'
);
SELECT ok(
  NOT has_table_privilege('anon', 'public.quota_wave_operations', 'INSERT'),
  'anon няма право на писане над quota_wave_operations'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.quota_wave_operations', 'SELECT'),
  'authenticated няма право на четене над quota_wave_operations'
);
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.quota_wave_operations', 'UPDATE'),
  'authenticated няма право на промяна над quota_wave_operations'
);

-- Тестови потребители --------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-1111-1111-111111111111', 'owner-a@example.com'),
  ('22222222-2222-2222-2222-222222222222', 'owner-b@example.com');

-- =============================================================================
-- ЧАСТ А: owned_review_operation_* -------------------------------------------
-- =============================================================================

-- 4) Непознатата операция е `absent`, без никакъв запис -----------------------
SELECT is(
  (SELECT count(*)::int FROM public.review_operations
    WHERE nonce = 'bbbbbbbb-0000-0000-0000-000000000001'::uuid),
  0,
  'предварително няма ред за непознатата операция'
);
SELECT is(
  (public.owned_review_operation_lookup(
    'bbbbbbbb-0000-0000-0000-000000000001'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'cccccccc-0000-0000-0000-000000000001'::uuid,
    'v1', 'hash-1', repeat('a', 64), 'analyze_contract'
  ) ->> 'status'),
  'absent',
  'непозната операция връща absent'
);
SELECT is(
  (SELECT count(*)::int FROM public.review_operations
    WHERE nonce = 'bbbbbbbb-0000-0000-0000-000000000001'::uuid),
  0,
  'lookup над непозната операция не създава ред (без запис)'
);

-- Резервираме собствена операция за собственик A ------------------------------
SELECT public.owned_review_operation_reserve(
  'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'cccccccc-0000-0000-0000-000000000002'::uuid,
  'v1', 'hash-2', repeat('a', 64), 'analyze_contract'
);

-- 5) lookup НЕ пише — брой редове преди/след е еднакъв ------------------------
SELECT is(
  (SELECT count(*)::int FROM public.review_operations
    WHERE nonce = 'bbbbbbbb-0000-0000-0000-000000000002'::uuid),
  1,
  'преди lookup има точно един ред (от резервацията)'
);
SELECT public.owned_review_operation_lookup(
  'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'cccccccc-0000-0000-0000-000000000002'::uuid,
  'v1', 'hash-2', repeat('a', 64), 'analyze_contract'
);
SELECT is(
  (SELECT count(*)::int FROM public.review_operations
    WHERE nonce = 'bbbbbbbb-0000-0000-0000-000000000002'::uuid),
  1,
  'lookup над съществуваща операция не създава/трие редове'
);

-- 6) Обвързващи конфликти: различен owner/document/version/hash/digest/purpose
SELECT is(
  (public.owned_review_operation_lookup(
    'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid,
    'cccccccc-0000-0000-0000-000000000002'::uuid,
    'v1', 'hash-2', repeat('a', 64), 'analyze_contract'
  ) ->> 'status'),
  'conflict',
  'различен owner_id дава conflict'
);
SELECT is(
  (public.owned_review_operation_lookup(
    'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'cccccccc-0000-0000-0000-000000000099'::uuid,
    'v1', 'hash-2', repeat('a', 64), 'analyze_contract'
  ) ->> 'status'),
  'conflict',
  'различен document_id дава conflict'
);
SELECT is(
  (public.owned_review_operation_lookup(
    'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'cccccccc-0000-0000-0000-000000000002'::uuid,
    'v2', 'hash-2', repeat('a', 64), 'analyze_contract'
  ) ->> 'status'),
  'conflict',
  'различна document_version дава conflict'
);
SELECT is(
  (public.owned_review_operation_lookup(
    'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'cccccccc-0000-0000-0000-000000000002'::uuid,
    'v1', 'hash-DIFFERENT', repeat('a', 64), 'analyze_contract'
  ) ->> 'status'),
  'conflict',
  'различен document_hash дава conflict'
);
SELECT is(
  (public.owned_review_operation_lookup(
    'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'cccccccc-0000-0000-0000-000000000002'::uuid,
    'v1', 'hash-2', repeat('b', 64), 'analyze_contract'
  ) ->> 'status'),
  'conflict',
  'различен content_digest дава conflict'
);
SELECT is(
  (public.owned_review_operation_lookup(
    'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'cccccccc-0000-0000-0000-000000000002'::uuid,
    'v1', 'hash-2', repeat('a', 64), 'other_purpose'
  ) ->> 'status'),
  'conflict',
  'различна цел (purpose) дава conflict'
);
-- Нито един конфликт не връща съхранения отговор ------------------------------
SELECT ok(
  (public.owned_review_operation_lookup(
    'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid,
    'cccccccc-0000-0000-0000-000000000002'::uuid,
    'v1', 'hash-2', repeat('a', 64), 'analyze_contract'
  ) ? 'response') IS FALSE,
  'конфликтен lookup никога не носи ключ response'
);

-- 7) Активен лизинг → in_progress ---------------------------------------------
SELECT is(
  (public.owned_review_operation_lookup(
    'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'cccccccc-0000-0000-0000-000000000002'::uuid,
    'v1', 'hash-2', repeat('a', 64), 'analyze_contract'
  ) ->> 'status'),
  'in_progress',
  'активният лизинг е in_progress'
);

-- Симулация на срив след резервация: изтичане на лизинга ----------------------
UPDATE public.review_operations
   SET lease_expires_at = now() - interval '1 minute'
 WHERE nonce = 'bbbbbbbb-0000-0000-0000-000000000002'::uuid;

-- 8) Изтекъл лизинг → reconciliation, никога второ начисляване -----------------
SELECT is(
  (public.owned_review_operation_lookup(
    'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'cccccccc-0000-0000-0000-000000000002'::uuid,
    'v1', 'hash-2', repeat('a', 64), 'analyze_contract'
  ) ->> 'status'),
  'reconciliation',
  'изтеклият лизинг (симулиран срив) изисква съгласуване'
);
SELECT is(
  (SELECT count(*)::int FROM public.review_operations
    WHERE nonce = 'bbbbbbbb-0000-0000-0000-000000000002'::uuid),
  1,
  'изтеклият лизинг не поражда втори ред/второ начисляване'
);

-- Потвърждаваме операцията, за да проверим committed и response_expired -------
SELECT public.owned_review_operation_reserve(
  'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'cccccccc-0000-0000-0000-000000000002'::uuid,
  'v1', 'hash-2', repeat('a', 64), 'analyze_contract'
);
SELECT public.owned_review_operation_commit(
  'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  jsonb_build_object('review', 'резултат-A')
);

-- 9) committed → ТОЧНО съхраненият отговор ------------------------------------
SELECT is(
  (public.owned_review_operation_lookup(
    'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'cccccccc-0000-0000-0000-000000000002'::uuid,
    'v1', 'hash-2', repeat('a', 64), 'analyze_contract'
  ) ->> 'status'),
  'committed',
  'потвърдената собствена операция се връща като завършена'
);
SELECT is(
  (public.owned_review_operation_lookup(
    'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'cccccccc-0000-0000-0000-000000000002'::uuid,
    'v1', 'hash-2', repeat('a', 64), 'analyze_contract'
  ) -> 'response' ->> 'review'),
  'резултат-A',
  'точно записаният отговор се връща без промяна'
);

-- 10) NULL/изтекъл отговор → response_expired ----------------------------------
UPDATE public.review_operations
   SET response_expires_at = now() - interval '1 minute'
 WHERE nonce = 'bbbbbbbb-0000-0000-0000-000000000002'::uuid;
SELECT is(
  (public.owned_review_operation_lookup(
    'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'cccccccc-0000-0000-0000-000000000002'::uuid,
    'v1', 'hash-2', repeat('a', 64), 'analyze_contract'
  ) ->> 'status'),
  'response_expired',
  'изтеклият отговор се обявява явно'
);
SELECT is(
  (public.owned_review_operation_lookup(
    'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'cccccccc-0000-0000-0000-000000000002'::uuid,
    'v1', 'hash-2', repeat('a', 64), 'analyze_contract'
  ) ->> 'reason'),
  'new_request_required',
  'изтекъл отговор изисква нова заявка'
);

UPDATE public.review_operations
   SET response = NULL, response_expires_at = NULL
 WHERE nonce = 'bbbbbbbb-0000-0000-0000-000000000002'::uuid;
SELECT is(
  (public.owned_review_operation_lookup(
    'bbbbbbbb-0000-0000-0000-000000000002'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'cccccccc-0000-0000-0000-000000000002'::uuid,
    'v1', 'hash-2', repeat('a', 64), 'analyze_contract'
  ) ->> 'status'),
  'response_expired',
  'NULL отговор при committed също се обявява като response_expired'
);

-- =============================================================================
-- ЧАСТ Б: quota_wave_reserve / quota_wave_commit / quota_wave_cancel ----------
-- =============================================================================

-- Начални квотни редове за двамата потребители --------------------------------
INSERT INTO public.download_quota (user_id) VALUES
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');

UPDATE public.download_quota
   SET monthly_total_used = 2, topup_ops_balance = 10
 WHERE user_id = '11111111-1111-1111-1111-111111111111';

-- 11) Успешна резервация на вълна (2 от плана, 10 наличен topup free кап=10) --
SELECT is(
  (public.quota_wave_reserve(
    'dddddddd-0000-0000-0000-000000000001'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'analysis', 'wave_fix', 'sess-1', 'doc-1', NULL, repeat('a', 64), 3
  ) ->> 'status'),
  'reserved',
  'първата резервация на вълната успява'
);

-- 12) Повторна резервация със СЪЩИЯ ключ → точно едно `reserved`, другото
--     `in_progress` или `replay` (тук: втори опит е in_progress, лизингът
--     все още е активен) -------------------------------------------------------
SELECT is(
  (public.quota_wave_reserve(
    'dddddddd-0000-0000-0000-000000000001'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'analysis', 'wave_fix', 'sess-1', 'doc-1', NULL, repeat('a', 64), 3
  ) ->> 'status'),
  'in_progress',
  'втори опит със същия активен ключ дава in_progress (само едно reserved общо)'
);

-- 13) Същият ключ с различен ops_count → conflict -----------------------------
SELECT is(
  (public.quota_wave_reserve(
    'dddddddd-0000-0000-0000-000000000001'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'analysis', 'wave_fix', 'sess-1', 'doc-1', NULL, repeat('a', 64), 4
  ) ->> 'status'),
  'conflict',
  'различен ops_count при същия ключ дава conflict'
);

-- 14) Същият ключ с различен batch_id → conflict ------------------------------
SELECT is(
  (public.quota_wave_reserve(
    'dddddddd-0000-0000-0000-000000000001'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'analysis', 'wave_fix', 'sess-1', 'doc-1',
    'eeeeeeee-0000-0000-0000-000000000001'::uuid, repeat('a', 64), 3
  ) ->> 'status'),
  'conflict',
  'различен batch_id при същия ключ дава conflict'
);

-- 15) Същият ключ с различен отпечатък на заявката → conflict -----------------
SELECT is(
  (public.quota_wave_reserve(
    'dddddddd-0000-0000-0000-000000000001'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'analysis', 'wave_fix', 'sess-1', 'doc-1', NULL, repeat('b', 64), 3
  ) ->> 'status'),
  'conflict',
  'различен request_digest при същия ключ дава conflict'
);

-- Потвърждаваме първата вълна, за да проверим `replay` при committed ключ -----
SELECT public.quota_wave_commit(
  'dddddddd-0000-0000-0000-000000000001'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  jsonb_build_object('wave', 'резултат-1')
);
SELECT is(
  (public.quota_wave_reserve(
    'dddddddd-0000-0000-0000-000000000001'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'analysis', 'wave_fix', 'sess-1', 'doc-1', NULL, repeat('a', 64), 3
  ) ->> 'status'),
  'replay',
  'повторна резервация на вече потвърден ключ е replay'
);

-- 16) Недостатъчна наличност → denied, НУЛЕВА консумация -----------------------
UPDATE public.download_quota
   SET monthly_total_used = 9, topup_ops_balance = 0
 WHERE user_id = '22222222-2222-2222-2222-222222222222';
SELECT is(
  (public.quota_wave_reserve(
    'dddddddd-0000-0000-0000-000000000002'::uuid,
    '22222222-2222-2222-2222-222222222222'::uuid,
    'analysis', 'wave_fix', 'sess-2', 'doc-2', NULL, repeat('c', 64), 5
  ) ->> 'status'),
  'denied',
  'недостатъчна наличност (план+topup) отказва вълната'
);
SELECT is(
  (SELECT monthly_total_used FROM public.download_quota
    WHERE user_id = '22222222-2222-2222-2222-222222222222'),
  9,
  'отказаната вълна не начислява нищо от месечния план'
);
SELECT is(
  (SELECT topup_ops_balance FROM public.download_quota
    WHERE user_id = '22222222-2222-2222-2222-222222222222'),
  0,
  'отказаната вълна не начислява нищо от topup баланса'
);

-- =============================================================================
-- quota_wave_commit: идемпотентност и конфликт при непозната резервация -------
-- =============================================================================

-- 17) Повторно потвърждаване връща ТОЧНО съхранения резултат ------------------
SELECT is(
  (public.quota_wave_commit(
    'dddddddd-0000-0000-0000-000000000001'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    jsonb_build_object('wave', 'друг-резултат')
  ) -> 'result' ->> 'wave'),
  'резултат-1',
  'повторното потвърждаване връща точно първоначално записания резултат'
);
SELECT is(
  (public.quota_wave_commit(
    'dddddddd-0000-0000-0000-000000000001'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    jsonb_build_object('wave', 'друг-резултат')
  ) ->> 'replay'),
  'true',
  'повторното потвърждаване е обозначено като replay'
);

-- 18) Потвърждаване на НЕрезервирана (непозната) операция → conflict ----------
SELECT is(
  (public.quota_wave_commit(
    'dddddddd-0000-0000-0000-000000000099'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    jsonb_build_object('wave', 'х')
  ) ->> 'status'),
  'unavailable',
  'потвърждаване на непозната операция не се третира като успех'
);
SELECT is(
  (public.quota_wave_commit(
    'dddddddd-0000-0000-0000-000000000099'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    jsonb_build_object('wave', 'х')
  ) ->> 'reason'),
  'unknown_operation',
  'причината за отказ е изрично unknown_operation'
);

-- =============================================================================
-- quota_wave_cancel: точно възстановяване, идемпотентност, already_committed -
-- =============================================================================

-- Нова вълна за собственик A, ОПРЕДЕЛЕНО така, че да прелее и в двата
-- източника (план + topup): преди тук monthly_total_used = 5 при cap 10,
-- т.е. остатък от плана е 5; ops_count = 8 => 5 от плана + 3 от topup ------
SELECT is(
  (SELECT monthly_total_used FROM public.download_quota
    WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  5,
  'преди третата резервация месечният план е точно 5 (от предходната вълна)'
);
SELECT is(
  (SELECT topup_ops_balance FROM public.download_quota
    WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  10,
  'преди третата резервация topup балансът е непокътнат (10)'
);
SELECT public.quota_wave_reserve(
  'dddddddd-0000-0000-0000-000000000003'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'analysis', 'wave_fix', 'sess-3', 'doc-3', NULL, repeat('d', 64), 8
);

-- 19) Отмяната възстановява ТОЧНО записания разрез план/topup -----------------
SELECT is(
  (SELECT monthly_total_used FROM public.download_quota
    WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  10,
  'преди отмяната месечният план отразява резервираните от него 5 единици (5+5)'
);
SELECT is(
  (SELECT topup_ops_balance FROM public.download_quota
    WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  7,
  'преди отмяната topup балансът отразява резервираните от него 3 единици (10-3)'
);
SELECT public.quota_wave_cancel(
  'dddddddd-0000-0000-0000-000000000003'::uuid,
  '11111111-1111-1111-1111-111111111111'::uuid,
  'user_cancelled'
);
SELECT is(
  (SELECT monthly_total_used FROM public.download_quota
    WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  5,
  'отмяната връща месечния план ТОЧНО до стойността преди резервацията'
);
SELECT is(
  (SELECT topup_ops_balance FROM public.download_quota
    WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  10,
  'отмяната връща topup баланса ТОЧНО до стойността преди резервацията'
);

-- 20) Отмяната е идемпотентна: втори опит не пипа отново стойностите ----------
SELECT is(
  (public.quota_wave_cancel(
    'dddddddd-0000-0000-0000-000000000003'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'user_cancelled'
  ) ->> 'status'),
  'cancelled',
  'повторната отмяна е идемпотентна и връща cancelled'
);
SELECT is(
  (SELECT monthly_total_used FROM public.download_quota
    WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  5,
  'повторната отмяна не променя повторно месечния план'
);
SELECT is(
  (SELECT topup_ops_balance FROM public.download_quota
    WHERE user_id = '11111111-1111-1111-1111-111111111111'),
  10,
  'повторната отмяна не променя повторно topup баланса'
);

-- 21) Отмяна след потвърждаване → already_committed ---------------------------
SELECT is(
  (public.quota_wave_cancel(
    'dddddddd-0000-0000-0000-000000000001'::uuid,
    '11111111-1111-1111-1111-111111111111'::uuid,
    'too_late'
  ) ->> 'status'),
  'already_committed',
  'отмяна на вече потвърдена вълна дава already_committed'
);

SELECT * FROM finish();
ROLLBACK;
