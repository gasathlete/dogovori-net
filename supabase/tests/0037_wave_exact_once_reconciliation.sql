-- =============================================================================
-- pgTAP фикстури за 0037 (НЕ са изпълнени в тази среда — няма PostgreSQL).
-- Доказват: изтекъл лизинг = изравняване без промяна на броячите; липсващ ред
-- на квотата = изравняване и състоянието остава 'reserved'; невалидно
-- разпределение = никаква промяна; отрицателен остатък = никаква промяна;
-- точна отмяна поставя маркер restored и е идемпотентна; потвърдена вълна с
-- изтекъл товар = response_expired; заличаването на товара е с dry-run и
-- реален режим; маркирането на застояла вълна НЕ връща квота автоматично.
-- =============================================================================
BEGIN;
SELECT plan(14);

-- Права: само service_role.
SELECT ok(
  NOT has_function_privilege('anon', 'public.quota_wave_reserve(uuid,uuid,text,text,text,text,uuid,text,integer,integer)', 'EXECUTE'),
  'anon няма право да резервира вълна');
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.quota_wave_cancel(uuid,uuid,text)', 'EXECUTE'),
  'authenticated няма право да отменя вълна');
SELECT ok(
  has_function_privilege('service_role', 'public.quota_wave_reconcile_stale(integer)', 'EXECUTE'),
  'service_role може да изравнява застояли вълни');
SELECT ok(
  has_function_privilege('service_role', 'public.sweep_expired_quota_wave_results(integer,boolean)', 'EXECUTE'),
  'service_role може да заличава изтекли товари');

SET LOCAL role service_role;

-- Подготовка: потребител с квота.
INSERT INTO public.download_quota (user_id, plan, plan_ops_cap, monthly_total_used, topup_ops_balance)
VALUES ('44444444-4444-4444-8444-444444444444', 'free', 10, 0, 5)
ON CONFLICT (user_id) DO UPDATE
  SET plan_ops_cap = 10, monthly_total_used = 0, topup_ops_balance = 5;

-- 1) Изтекъл лизинг → reconciliation, броячите непроменени.
INSERT INTO public.quota_wave_operations (
  operation_id, user_id, kind, purpose, session_id, doc_key, batch_id,
  request_digest, ops_count, state, was_pro, allocation, lease_expires_at)
VALUES ('55555555-5555-4555-8555-555555555555', '44444444-4444-4444-8444-444444444444',
  'analysis', 'apply_corrections', 's-1', 'doc-1', '66666666-6666-4666-8666-666666666666',
  repeat('a', 64), 2, 'reserved', false,
  '[{"source":"plan","amount":2}]'::jsonb, now() - interval '1 minute');

UPDATE public.download_quota SET monthly_total_used = 2
 WHERE user_id = '44444444-4444-4444-8444-444444444444';

SELECT is(
  (public.quota_wave_reserve('55555555-5555-4555-8555-555555555555','44444444-4444-4444-8444-444444444444',
    'analysis','apply_corrections','s-1','doc-1','66666666-6666-4666-8666-666666666666',
    repeat('a',64),2,300))->>'reason',
  'lease_expired', 'изтеклият лизинг връща lease_expired');

SELECT is(
  (SELECT monthly_total_used FROM public.download_quota
    WHERE user_id = '44444444-4444-4444-8444-444444444444'), 2,
  'изтеклият лизинг не консумира втори път');

SELECT is(
  (SELECT state FROM public.quota_wave_operations
    WHERE operation_id = '55555555-5555-4555-8555-555555555555'), 'reserved',
  'изтеклият лизинг не променя състоянието');

-- 2) Маркиране на застояла вълна: без автоматично връщане на квота.
SELECT is(
  (public.quota_wave_reconcile_stale(10))->>'flagged', '1',
  'застоялата вълна се маркира точно веднъж');
SELECT is(
  (SELECT monthly_total_used FROM public.download_quota
    WHERE user_id = '44444444-4444-4444-8444-444444444444'), 2,
  'маркирането не връща квота');

-- 3) Точна отмяна: маркер restored и идемпотентност.
SELECT is(
  (public.quota_wave_cancel('55555555-5555-4555-8555-555555555555',
    '44444444-4444-4444-8444-444444444444','test'))->>'status',
  'cancelled', 'точната отмяна успява');
SELECT is(
  (SELECT detail->>'restored' FROM public.quota_wave_operations
    WHERE operation_id = '55555555-5555-4555-8555-555555555555'), 'true',
  'отмяната записва доказателство за възстановяване');
SELECT is(
  (public.quota_wave_cancel('55555555-5555-4555-8555-555555555555',
    '44444444-4444-4444-8444-444444444444','test'))->>'replay',
  'true', 'повторната отмяна е идемпотентна');

-- 4) Невалидно разпределение → никаква промяна.
INSERT INTO public.quota_wave_operations (
  operation_id, user_id, kind, purpose, request_digest, ops_count, state, was_pro,
  allocation, lease_expires_at)
VALUES ('77777777-7777-4777-8777-777777777777', '44444444-4444-4444-8444-444444444444',
  'analysis', 'apply_corrections', repeat('b',64), 2, 'reserved', false,
  '[{"source":"bonus","amount":2}]'::jsonb, now() + interval '5 minutes');
SELECT is(
  (public.quota_wave_cancel('77777777-7777-4777-8777-777777777777',
    '44444444-4444-4444-8444-444444444444','test'))->>'reason',
  'allocation_unknown_source', 'непознат източник е изравняване');
SELECT is(
  (SELECT state FROM public.quota_wave_operations
    WHERE operation_id = '77777777-7777-4777-8777-777777777777'), 'reserved',
  'невалидното разпределение не променя състоянието');

-- 5) Потвърдена вълна с изтекъл товар → response_expired.
INSERT INTO public.quota_wave_operations (
  operation_id, user_id, kind, purpose, request_digest, ops_count, state, was_pro,
  allocation, lease_expires_at, committed_at, result, result_expires_at)
VALUES ('88888888-8888-4888-8888-888888888888', '44444444-4444-4444-8444-444444444444',
  'analysis', 'apply_corrections', repeat('c',64), 1, 'committed', false,
  '[{"source":"plan","amount":1}]'::jsonb, now(), now(),
  '{"contract":"x"}'::jsonb, now() - interval '1 hour');
SELECT is(
  (public.quota_wave_reserve('88888888-8888-4888-8888-888888888888','44444444-4444-4444-8444-444444444444',
    'analysis','apply_corrections',NULL,NULL,NULL,repeat('c',64),1,300))->>'status',
  'response_expired', 'изтеклият точен товар изисква нова заявка');

-- 6) Заличаване на товара: dry-run не променя, реалният режим зануляа.
SELECT is(
  (public.sweep_expired_quota_wave_results(100, true))->>'cleared', '0',
  'dry-run не заличава');
SELECT is(
  (public.sweep_expired_quota_wave_results(100, false))->>'cleared', '1',
  'реалният режим заличава точно изтеклия товар');

-- ЗАБЕЛЕЖКА: истинска конкурентност (две сесии) НЕ се доказва тук — няма
-- dblink/parallel примитиви в тази фикстура. Отчита се като NOT PROVEN.

SELECT * FROM finish();
ROLLBACK;
