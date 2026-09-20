-- =============================================================================
-- pgTAP фикстури за 0038 (НЕ са изпълнени в тази среда — няма PostgreSQL).
-- Доказват: retention_due_counts е само-четяща и не променя нито един ред;
-- изтекъл лизинг при резервация с пропуск И при резервация на собственик дава
-- изравняване БЕЗ промяна на реда/лизинга/товара; потвърдена операция с изтекъл
-- товар НИКОГА не се повтаря; доказано отменена операция може нов опит.
-- =============================================================================
BEGIN;
SELECT plan(13);

-- Права.
SELECT ok(
  has_function_privilege('service_role', 'public.retention_due_counts()', 'EXECUTE'),
  'service_role може да брои дължимите за retention');
SELECT ok(
  NOT has_function_privilege('anon', 'public.retention_due_counts()', 'EXECUTE'),
  'anon няма право да брои дължимите за retention');
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.retention_due_counts()', 'EXECUTE'),
  'authenticated няма право да брои дължимите за retention');
SELECT is(
  (SELECT provolatile FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'retention_due_counts'), 's',
  'retention_due_counts е STABLE, следователно не може да пише');

SET LOCAL role service_role;

-- Подготовка: потребител и изтекъл лизинг върху операция с пропуск.
INSERT INTO public.review_operations (
  operation_id, user_id, grant_nonce, document_digest, state, lease_expires_at)
VALUES ('77777777-7777-4777-8777-777777777777', NULL, 'nonce-expired',
  repeat('b', 64), 'reserved', now() - interval '1 minute');

-- 1) retention_due_counts не променя нищо.
SELECT is(
  (SELECT count(*) FROM public.review_operations
    WHERE operation_id = '77777777-7777-4777-8777-777777777777'
      AND lease_expires_at < now()), 1::bigint,
  'подготвеният ред съществува с изтекъл лизинг');
SELECT ok(
  (public.retention_due_counts()) ? 'wave_stale_due',
  'преброяването връща и дължимите застояли вълни');
SELECT is(
  (SELECT md5(row_to_json(r)::text) FROM public.review_operations r
    WHERE operation_id = '77777777-7777-4777-8777-777777777777'),
  (SELECT md5(row_to_json(r)::text) FROM public.review_operations r
    WHERE operation_id = '77777777-7777-4777-8777-777777777777'),
  'редът остава непроменен след преброяване');

-- 2) Изтекъл лизинг → изравняване, БЕЗ нова резервация.
SELECT is(
  (public.review_operation_reserve('77777777-7777-4777-8777-777777777777',
    'nonce-expired', repeat('b', 64), 180))->>'reason',
  'lease_expired', 'изтеклият лизинг връща lease_expired');
SELECT is(
  (SELECT state FROM public.review_operations
    WHERE operation_id = '77777777-7777-4777-8777-777777777777'), 'reserved',
  'състоянието не се пре-резервира');
SELECT ok(
  (SELECT lease_expires_at < now() FROM public.review_operations
    WHERE operation_id = '77777777-7777-4777-8777-777777777777'),
  'лизингът НЕ се подновява при изтекъл лизинг');

-- 3) Собственик: изтекъл лизинг → изравняване без промяна.
INSERT INTO public.review_operations (
  operation_id, user_id, owned_document_id, document_digest, state, lease_expires_at)
VALUES ('88888888-8888-4888-8888-888888888888',
  '44444444-4444-4444-8444-444444444444',
  '99999999-9999-4999-8999-999999999999', repeat('c', 64), 'reserved',
  now() - interval '2 minutes');
SELECT is(
  (public.owned_review_operation_reserve('88888888-8888-4888-8888-888888888888',
    '44444444-4444-4444-8444-444444444444',
    '99999999-9999-4999-8999-999999999999', repeat('c', 64), 180))->>'reason',
  'lease_expired', 'изтеклият лизинг на собственик връща lease_expired');

-- 4) Потвърдена операция с изтекъл товар НИКОГА не се повтаря.
UPDATE public.review_operations
   SET state = 'committed', response = NULL, response_expires_at = now() - interval '1 hour'
 WHERE operation_id = '88888888-8888-4888-8888-888888888888';
SELECT is(
  (public.owned_review_operation_reserve('88888888-8888-4888-8888-888888888888',
    '44444444-4444-4444-8444-444444444444',
    '99999999-9999-4999-8999-999999999999', repeat('c', 64), 180))->>'reason',
  'response_expired', 'изтеклият потвърден товар не се повтаря');

-- 5) Доказано отменена операция може нов опит.
UPDATE public.review_operations
   SET state = 'cancelled', cancelled_at = now(), response = NULL,
       response_expires_at = NULL, lease_expires_at = NULL
 WHERE operation_id = '77777777-7777-4777-8777-777777777777';
SELECT is(
  (public.review_operation_reserve('77777777-7777-4777-8777-777777777777',
    'nonce-expired', repeat('b', 64), 180))->>'status',
  'reserved', 'доказаната отмяна допуска нов опит');

SELECT * FROM finish();
ROLLBACK;
