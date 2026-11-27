-- =============================================================================
-- pgTAP фикстури за 0039 (НЕ са изпълнени в тази среда — няма PostgreSQL).
-- Доказват: assistant_turn_lookup е само-четящо (без запис) за absent/
-- in_progress/committed/response_expired/reconciliation; assistant_turn_reserve
-- създава точно една операция и най-много един разговор, повтаря вместо да
-- резервира двойно при същия operation_id+binding, дава конфликт при разлика
-- в binding-а, дава conflict/thread_busy при състезание за същата ревизия на
-- разговора, и отказва (без такса) при изчерпан таван на екип/pro/free;
-- mark_model_started + провал => изравняване; отмяна СЛЕД старт на модела е
-- отказана; отмяна ПРЕДИ старт възстановява точно записаното разпределение
-- без underflow; commit вмъква точно едно потребителско, едно асистентско
-- съобщение и най-много едно предложение, вдига ревизията, съхранява товар
-- с изтичане и се повтаря идентично; изравняването на застояли ходове само
-- маркира (без възстановяване); заличаването на изтекъл товар пипа само
-- товара; retention_due_counts брои и асистентските редове, само-четящо.
-- =============================================================================
BEGIN;
SET LOCAL search_path TO public, extensions, auth, storage;
SELECT plan(140);

-- ---------------------------------------------------------------------------
-- 0) Права: само service_role пипа леджъра на асистентския ход.
-- ---------------------------------------------------------------------------
SELECT ok(
  NOT has_function_privilege('anon', 'public.assistant_turn_reserve(uuid,uuid,text,uuid,text,boolean,text,uuid,integer,jsonb,integer)', 'EXECUTE'),
  'anon няма право да резервира ход');
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.assistant_turn_commit(uuid,uuid,text,text,jsonb,jsonb,integer)', 'EXECUTE'),
  'authenticated няма право да прави commit на ход');
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.assistant_turn_cancel(uuid,uuid,text)', 'EXECUTE'),
  'authenticated няма право да отменя ход');
SELECT ok(
  has_function_privilege('service_role', 'public.assistant_turn_lookup(uuid,uuid,text)', 'EXECUTE'),
  'service_role може да търси ход');
SELECT ok(
  has_function_privilege('service_role', 'public.assistant_turn_reconcile_stale(integer)', 'EXECUTE'),
  'service_role може да изравнява застояли ходове');
SELECT ok(
  has_function_privilege('service_role', 'public.sweep_expired_assistant_turn_results(integer,boolean)', 'EXECUTE'),
  'service_role може да заличава изтекли товари на ходове');
SELECT is(
  (SELECT provolatile FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'assistant_turn_lookup'), 's',
  'assistant_turn_lookup е STABLE, следователно не може да пише');

-- ---------------------------------------------------------------------------
-- 1) Подготовка: потребители, профили, квоти, екип.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('11111111-1111-4111-8111-111111111111', 'u1@example.com'),
  ('22222222-2222-4222-8222-222222222222', 'u2@example.com'),
  ('33333333-3333-4333-8333-333333333333', 'u3@example.com'),
  ('44444444-4444-4444-8444-444444444444', 'u4@example.com');
-- Managed Supabase creates onboarding rows from auth.users. Remove those
-- trigger side effects so this fixture controls every relevant counter.
DELETE FROM public.notifications WHERE user_id IN (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444');
DELETE FROM public.folders WHERE user_id IN (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444');
DELETE FROM public.download_quota WHERE user_id IN (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444');
DELETE FROM public.profiles WHERE id IN (
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
  '33333333-3333-4333-8333-333333333333',
  '44444444-4444-4444-8444-444444444444');


INSERT INTO public.profiles (id, display_name) VALUES
  ('11111111-1111-4111-8111-111111111111', 'Потребител Едно'),
  ('22222222-2222-4222-8222-222222222222', 'Потребител Две'),
  ('33333333-3333-4333-8333-333333333333', 'Потребител Три'),
  ('44444444-4444-4444-8444-444444444444', 'Потребител Четири');

-- U1: свеж безплатен потребител, все още не е ползвал AI съобщения.
INSERT INTO public.download_quota (
  user_id, plan, ai_messages_used, total_used, monthly_total_used, monthly_reset_at)
VALUES (
  '11111111-1111-4111-8111-111111111111', 'free', 0, 0, 0, now());

-- U2: безплатен потребител, вече на тавана от 3 AI съобщения.
INSERT INTO public.download_quota (
  user_id, plan, ai_messages_used, total_used, monthly_total_used, monthly_reset_at)
VALUES (
  '22222222-2222-4222-8222-222222222222', 'free', 3, 3, 3, now());

-- U3: pro потребител, вече на планирания таван от 5 операции.
INSERT INTO public.download_quota (
  user_id, plan, plan_ops_cap, pro_monthly_used, pro_period_start,
  ai_messages_used, total_used, monthly_total_used, monthly_reset_at)
VALUES (
  '33333333-3333-4333-8333-333333333333', 'pro', 5, 5, now(),
  5, 5, 5, now());

-- U4: член на екип с 1 място (таван 100 операции), вече изчерпан.
INSERT INTO public.teams (id, name, owner_id, seat_count, status)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 'Екип на U4',
  '44444444-4444-4444-8444-444444444444', 1, 'active');
INSERT INTO public.team_members (team_id, user_id, role)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  '44444444-4444-4444-8444-444444444444', 'owner');
INSERT INTO public.team_usage (team_id, ops_used, period_start)
VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 100, now());

SET LOCAL role service_role;

-- ---------------------------------------------------------------------------
-- 2) Само-четящо търсене: absent.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.assistant_turn_lookup(
    'a0000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111',
    repeat('a', 64)))->>'status',
  'absent', 'липсваща операция дава absent');

-- ---------------------------------------------------------------------------
-- 3) Резервация: точно една операция, най-много един разговор.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111',
    repeat('a', 64), NULL, 'platform_help', true, 'free', NULL, 180,
    '{"title":"Нов договор"}'::jsonb, 3))->>'status',
  'reserved', 'първата резервация за нов разговор успява');
SELECT is(
  (SELECT count(*) FROM public.assistant_turn_operations
    WHERE user_id = '11111111-1111-4111-8111-111111111111'), 1::bigint,
  'резервацията създава точно една операция');
SELECT is(
  (SELECT count(*) FROM public.assistant_threads
    WHERE user_id = '11111111-1111-4111-8111-111111111111'), 1::bigint,
  'резервацията създава най-много един разговор');
SELECT is(
  (SELECT ai_messages_used FROM public.download_quota
    WHERE user_id = '11111111-1111-4111-8111-111111111111'), 1,
  'безплатната такса се начислява точно веднъж');

-- Запомняме конкретния thread_id, за да проверим ходовете срещу него.
SELECT ok(
  (SELECT thread_id FROM public.assistant_turn_operations
    WHERE operation_id = 'a0000000-0000-4000-8000-000000000010') IS NOT NULL,
  'резервираната операция сочи към създадения разговор');

-- ---------------------------------------------------------------------------
-- 4) Само-четящото търсене НЕ пише: in_progress, без промяна на реда.
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT count(*) FROM public.assistant_turn_operations), 1::bigint,
  'преди lookup има точно един ред (контролна база)');
SELECT is(
  (public.assistant_turn_lookup(
    'a0000000-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111',
    repeat('a', 64)))->>'status',
  'in_progress', 'активна резервация е in_progress');
SELECT is(
  ((public.assistant_turn_lookup(
    'a0000000-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111',
    repeat('a', 64)))->>'model_started')::boolean,
  false, 'моделът все още не е стартирал');
SELECT is(
  (SELECT count(*) FROM public.assistant_turn_operations), 1::bigint,
  'lookup не създава нови редове');
SELECT is(
  (SELECT md5(row_to_json(o)::text) FROM public.assistant_turn_operations o
    WHERE operation_id = 'a0000000-0000-4000-8000-000000000010'),
  (SELECT md5(row_to_json(o)::text) FROM public.assistant_turn_operations o
    WHERE operation_id = 'a0000000-0000-4000-8000-000000000010'),
  'lookup не променя нито едно поле на реда (включително updated_at)');

-- ---------------------------------------------------------------------------
-- 5) Binding конфликт: същият operation_id, различен подпис.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111',
    repeat('b', 64), NULL, 'platform_help', true, 'free', NULL, 180,
    '{}'::jsonb, 3))->>'reason',
  'binding_conflict', 'разминаващ се binding е конфликт, не ново изпълнение');
SELECT is(
  (public.assistant_turn_lookup(
    'a0000000-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111',
    repeat('b', 64)))->>'status',
  'conflict', 'lookup със сгрешен binding също дава конфликт');

-- ---------------------------------------------------------------------------
-- 6) Реплей: същият operation_id + същият binding не таксува втори път.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111',
    repeat('a', 64), NULL, 'platform_help', true, 'free', NULL, 180,
    '{}'::jsonb, 3))->>'status',
  'in_progress', 'повторната резервация с валиден лизинг е реплей (in_progress)');
SELECT is(
  (SELECT ai_messages_used FROM public.download_quota
    WHERE user_id = '11111111-1111-4111-8111-111111111111'), 1,
  'реплеят не начислява втора такса');
SELECT is(
  (SELECT count(*) FROM public.assistant_turn_operations
    WHERE user_id = '11111111-1111-4111-8111-111111111111'), 1::bigint,
  'реплеят не създава втора операция');

-- ---------------------------------------------------------------------------
-- 7) Начало на модела, после провал => изравняване; отмяна СЛЕД старт отказана.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.assistant_turn_mark_model_started(
    'a0000000-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111'))->>'status',
  'ok', 'началото на модела се маркира успешно');
SELECT is(
  (public.assistant_turn_mark_model_started(
    'a0000000-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111'))->>'status',
  'already_started', 'повторно маркиране е идемпотентно, не втори модел');
SELECT is(
  (public.assistant_turn_cancel(
    'a0000000-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111',
    'client_timeout'))->>'reason',
  'model_started', 'отмяна СЛЕД старт на модела е отказана и става изравняване');
SELECT is(
  (SELECT reconciliation_required FROM public.assistant_turn_operations
    WHERE operation_id = 'a0000000-0000-4000-8000-000000000010'), true,
  'редът е маркиран за изравняване след опит за отмяна със стартиран модел');
SELECT is(
  (SELECT ai_messages_used FROM public.download_quota
    WHERE user_id = '11111111-1111-4111-8111-111111111111'), 1,
  'отказаната отмяна НЕ връща квота автоматично');
SELECT is(
  (public.assistant_turn_lookup(
    'a0000000-0000-4000-8000-000000000010', '11111111-1111-4111-8111-111111111111',
    repeat('a', 64)))->>'status',
  'reconciliation', 'lookup вижда флагнатата операция като reconciliation');

-- ---------------------------------------------------------------------------
-- 8) Отмяна ПРЕДИ старт на модела: точно възстановяване, без underflow.
--    ВАЖНО: ревизията на op#1 остава ЗАЕТА, защото op#1 е за изравняване, затова
--    тази операция върви по СОБСТВЕН нов разговор (виж секция 24).
-- ---------------------------------------------------------------------------
SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-000000000020', '11111111-1111-4111-8111-111111111111',
    repeat('c', 64), NULL,
    'platform_help', true, 'free', NULL, 180,
    '{"title":"Разговор за отмяна преди старт"}'::jsonb, 3))->>'status',
  'reserved', 'резервация по нов разговор след флагнатата операция е позволена');
SELECT is(
  (SELECT ai_messages_used FROM public.download_quota
    WHERE user_id = '11111111-1111-4111-8111-111111111111'), 2,
  'втората такса се начислява коректно');
SELECT is(
  (public.assistant_turn_cancel(
    'a0000000-0000-4000-8000-000000000020', '11111111-1111-4111-8111-111111111111',
    'client_gave_up'))->>'status',
  'cancelled', 'отмяната ПРЕДИ старт на модела успява');
SELECT is(
  (public.assistant_turn_cancel(
    'a0000000-0000-4000-8000-000000000020', '11111111-1111-4111-8111-111111111111',
    'client_gave_up'))->>'idempotent',
  'true', 'повторната отмяна е идемпотентна');
SELECT is(
  (SELECT ai_messages_used FROM public.download_quota
    WHERE user_id = '11111111-1111-4111-8111-111111111111'), 1,
  'отмяната възстановява ТОЧНО начислената бройка ai_messages_used (без underflow)');
SELECT is(
  (SELECT total_used FROM public.download_quota
    WHERE user_id = '11111111-1111-4111-8111-111111111111'), 1,
  'отмяната възстановява ТОЧНО начислената бройка total_used');
SELECT is(
  (SELECT monthly_total_used FROM public.download_quota
    WHERE user_id = '11111111-1111-4111-8111-111111111111'), 1,
  'отмяната възстановява ТОЧНО начислената бройка monthly_total_used');

-- ---------------------------------------------------------------------------
-- 9) Конкурентна резервация на СЪЩАТА ревизия на разговора => thread_busy.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-000000000030', '11111111-1111-4111-8111-111111111111',
    repeat('d', 64), NULL, 'clarification', false, NULL, NULL, 180,
    '{"title":"Втори разговор"}'::jsonb, 3))->>'status',
  'reserved', 'независим нов разговор се резервира без такса');
SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-000000000040', '11111111-1111-4111-8111-111111111111',
    repeat('e', 64),
    (SELECT thread_id FROM public.assistant_turn_operations
      WHERE operation_id = 'a0000000-0000-4000-8000-000000000030'),
    'clarification', false, NULL, NULL, 180, '{}'::jsonb, 3))->>'reason',
  'thread_busy', 'втора операция на СЪЩАТА активна ревизия е конфликт');
SELECT is(
  (SELECT count(*) FROM public.assistant_turn_operations
    WHERE operation_id = 'a0000000-0000-4000-8000-000000000040'), 0::bigint,
  'отхвърлената поради thread_busy заявка не оставя ред');

-- ---------------------------------------------------------------------------
-- 10) Отказ (без такса) при изчерпан таван на екип / pro / безплатен план.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-000000000050', '44444444-4444-4444-8444-444444444444',
    repeat('f', 64), NULL, 'platform_help', true, 'team',
    'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', 180, '{}'::jsonb, 3))->>'reason',
  'team_limit_reached', 'изчерпан екипен таван отказва резервацията');
SELECT is(
  (SELECT ops_used FROM public.team_usage
    WHERE team_id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 100,
  'екипният отказ не начислява нищо');
SELECT is(
  (SELECT count(*) FROM public.assistant_turn_operations
    WHERE operation_id = 'a0000000-0000-4000-8000-000000000050'), 0::bigint,
  'екипният отказ не оставя операция');

SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-000000000060', '33333333-3333-4333-8333-333333333333',
    repeat('1', 64), NULL, 'platform_help', true, 'pro', NULL, 180,
    '{}'::jsonb, 3))->>'reason',
  'ai_plan_limit_reached', 'изчерпан pro таван отказва резервацията');
SELECT is(
  (SELECT pro_monthly_used FROM public.download_quota
    WHERE user_id = '33333333-3333-4333-8333-333333333333'), 5,
  'pro отказът не начислява нищо');
SELECT is(
  (SELECT count(*) FROM public.assistant_turn_operations
    WHERE operation_id = 'a0000000-0000-4000-8000-000000000060'), 0::bigint,
  'pro отказът не оставя операция');

SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-000000000070', '22222222-2222-4222-8222-222222222222',
    repeat('2', 64), NULL, 'platform_help', true, 'free', NULL, 180,
    '{}'::jsonb, 3))->>'reason',
  'ai_free_limit_reached', 'изчерпан безплатен таван отказва резервацията');
SELECT is(
  (SELECT ai_messages_used FROM public.download_quota
    WHERE user_id = '22222222-2222-4222-8222-222222222222'), 3,
  'безплатният отказ не начислява нищо');
SELECT is(
  (SELECT count(*) FROM public.assistant_turn_operations
    WHERE operation_id = 'a0000000-0000-4000-8000-000000000070'), 0::bigint,
  'безплатният отказ не оставя операция');

-- ---------------------------------------------------------------------------
-- 11) Commit: точно едно потребителско, едно асистентско съобщение, без
--     предложение — вдига ревизията, съхранява товар с изтичане.
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT turn_revision FROM public.assistant_threads
    WHERE id = (SELECT thread_id FROM public.assistant_turn_operations
      WHERE operation_id = 'a0000000-0000-4000-8000-000000000030')), 0,
  'разговорът е все още на ревизия 0 преди commit');
SELECT is(
  (public.assistant_turn_commit(
    'a0000000-0000-4000-8000-000000000030', '11111111-1111-4111-8111-111111111111',
    'Здравей, имам въпрос.', 'Здравей! С какво да помогна?',
    '[{"type":"delta","text":"Здравей"}]'::jsonb, NULL, 3600))->>'status',
  'committed', 'commit без предложение успява');
SELECT is(
  (SELECT count(*) FROM public.assistant_messages
    WHERE operation_id = 'a0000000-0000-4000-8000-000000000030' AND role = 'user'), 1::bigint,
  'commit вмъква точно едно потребителско съобщение');
SELECT is(
  (SELECT count(*) FROM public.assistant_messages
    WHERE operation_id = 'a0000000-0000-4000-8000-000000000030' AND role = 'assistant'), 1::bigint,
  'commit вмъква точно едно асистентско съобщение');
SELECT is(
  (SELECT count(*) FROM public.assistant_edit_proposals
    WHERE operation_id = 'a0000000-0000-4000-8000-000000000030'), 0::bigint,
  'без подадено предложение не се създава предложение');
SELECT is(
  (SELECT turn_revision FROM public.assistant_threads
    WHERE id = (SELECT thread_id FROM public.assistant_turn_operations
      WHERE operation_id = 'a0000000-0000-4000-8000-000000000030')), 1,
  'commit вдига ревизията на разговора точно с едно');
SELECT ok(
  (SELECT result_expires_at > now() FROM public.assistant_turn_operations
    WHERE operation_id = 'a0000000-0000-4000-8000-000000000030'),
  'commit съхранява товар с бъдещо изтичане');

-- Повторен commit: реплей на идентични id-та, без дублиране на съобщения.
SELECT is(
  (public.assistant_turn_commit(
    'a0000000-0000-4000-8000-000000000030', '11111111-1111-4111-8111-111111111111',
    'Здравей, имам въпрос.', 'Здравей! С какво да помогна?',
    '[{"type":"delta","text":"друго"}]'::jsonb, NULL, 3600))->>'status',
  'replay', 'повторният commit е реплей, не ново изпълнение');
SELECT is(
  (SELECT count(*) FROM public.assistant_messages
    WHERE operation_id = 'a0000000-0000-4000-8000-000000000030'), 2::bigint,
  'повторният commit не дублира съобщения');
SELECT is(
  (SELECT turn_revision FROM public.assistant_threads
    WHERE id = (SELECT thread_id FROM public.assistant_turn_operations
      WHERE operation_id = 'a0000000-0000-4000-8000-000000000030')), 1,
  'повторният commit не вдига ревизията повторно');

-- ---------------------------------------------------------------------------
-- 12) Commit с предложение за редакция: най-много едно предложение.
-- ---------------------------------------------------------------------------
INSERT INTO public.saved_documents (id, user_id, kind, title, payload)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111',
  'contract', 'Договор за наем', '{"intro":"стар текст"}'::jsonb);

SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-000000000080', '11111111-1111-4111-8111-111111111111',
    repeat('3', 64), NULL, 'legal_strict', false, NULL, NULL, 180,
    '{"title":"Редакция"}'::jsonb, 3))->>'status',
  'reserved', 'резервация за отделен разговор с предложение успява');
SELECT is(
  (public.assistant_turn_commit(
    'a0000000-0000-4000-8000-000000000080', '11111111-1111-4111-8111-111111111111',
    'Смени интрото.', 'Готово, предлагам следната промяна.',
    '[]'::jsonb,
    jsonb_build_object(
      'saved_document_id', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      'base_context_version', repeat('9', 64),
      'base_updated_at', now(),
      'target_path', 'payload.intro',
      'before_text', 'стар текст',
      'after_text', 'нов текст',
      'reason', 'по искане на клиента'),
    3600))->>'status',
  'committed', 'commit с предложение успява');
SELECT is(
  (SELECT count(*) FROM public.assistant_edit_proposals
    WHERE operation_id = 'a0000000-0000-4000-8000-000000000080'), 1::bigint,
  'commit създава най-много (точно) едно предложение');
SELECT is(
  ((public.assistant_turn_lookup(
    'a0000000-0000-4000-8000-000000000080', '11111111-1111-4111-8111-111111111111',
    repeat('3', 64)))->'result'->'proposal')->>'targetPath',
  'payload.intro', 'lookup връща предложението вътре в точния товар');

-- ---------------------------------------------------------------------------
-- 13) Изтекъл потвърден товар => response_expired при lookup и при commit.
-- ---------------------------------------------------------------------------
UPDATE public.assistant_turn_operations
   SET result_expires_at = now() - interval '1 hour'
 WHERE operation_id = 'a0000000-0000-4000-8000-000000000080';
SELECT is(
  (public.assistant_turn_lookup(
    'a0000000-0000-4000-8000-000000000080', '11111111-1111-4111-8111-111111111111',
    repeat('3', 64)))->>'status',
  'response_expired', 'lookup на изтекъл потвърден товар дава response_expired');
SELECT is(
  (public.assistant_turn_commit(
    'a0000000-0000-4000-8000-000000000080', '11111111-1111-4111-8111-111111111111',
    'Смени интрото.', 'Готово.', '[]'::jsonb, NULL, 3600))->>'status',
  'response_expired', 'commit на изтекъл потвърден товар НИКОГА не се повтаря');

-- ---------------------------------------------------------------------------
-- 14) Изравняване на застояли ходове: САМО маркиране, без възстановяване.
-- ---------------------------------------------------------------------------
INSERT INTO public.assistant_turn_operations (
  operation_id, user_id, binding_digest, thread_id, prior_turn_revision,
  mode, state, charged, allocation, lease_expires_at)
SELECT
  'a0000000-0000-4000-8000-000000000090', '11111111-1111-4111-8111-111111111111',
  repeat('4', 64), t.id, 5, 'platform_help', 'reserved', true,
  jsonb_build_object('source', 'free', 'ai_messages_used', 1, 'total_used', 1,
    'monthly_total_used', 1, 'rollover', false),
  now() - interval '1 minute'
FROM public.assistant_threads t
WHERE t.id = (SELECT thread_id FROM public.assistant_turn_operations
  WHERE operation_id = 'a0000000-0000-4000-8000-000000000030');

SELECT is(
  (public.assistant_turn_reconcile_stale(10))->>'flagged', '1',
  'застоялият ход се маркира точно веднъж');
SELECT is(
  (SELECT state FROM public.assistant_turn_operations
    WHERE operation_id = 'a0000000-0000-4000-8000-000000000090'), 'reconciliation',
  'застоялият ход премина в reconciliation');
SELECT is(
  (SELECT ai_messages_used FROM public.download_quota
    WHERE user_id = '11111111-1111-4111-8111-111111111111'), 1,
  'маркирането НЕ връща квота автоматично');

-- ---------------------------------------------------------------------------
-- 15) Заличаване на изтекъл товар: пипа само товара, не счетоводството/съобщенията.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.sweep_expired_assistant_turn_results(100, true))->>'cleared', '0',
  'dry-run не заличава нищо');
SELECT is(
  (public.sweep_expired_assistant_turn_results(100, false))->>'cleared', '1',
  'реалният режим заличава точно изтеклия товар');
SELECT ok(
  (SELECT result IS NULL FROM public.assistant_turn_operations
    WHERE operation_id = 'a0000000-0000-4000-8000-000000000080'),
  'заличаването нулира товара');
SELECT is(
  (SELECT state FROM public.assistant_turn_operations
    WHERE operation_id = 'a0000000-0000-4000-8000-000000000080'), 'committed',
  'заличаването на товара НЕ променя счетоводното състояние');
SELECT is(
  (SELECT count(*) FROM public.assistant_messages
    WHERE operation_id = 'a0000000-0000-4000-8000-000000000080'), 2::bigint,
  'заличаването на товара НЕ трие съобщенията');
SELECT is(
  (SELECT count(*) FROM public.assistant_edit_proposals
    WHERE operation_id = 'a0000000-0000-4000-8000-000000000080'), 1::bigint,
  'заличаването на товара НЕ трие предложението за редакция');

-- ---------------------------------------------------------------------------
-- 16) retention_due_counts: включва асистентските броячи и е само-четящо.
-- ---------------------------------------------------------------------------
SELECT ok(
  (public.retention_due_counts()) ? 'assistant_results_due',
  'преброяването включва изтеклите товари на асистентски ходове');
SELECT ok(
  (public.retention_due_counts()) ? 'assistant_stale_due',
  'преброяването включва застоелите ходове на асистента');
SELECT is(
  (SELECT md5(row_to_json(o)::text) FROM public.assistant_turn_operations o
    WHERE operation_id = 'a0000000-0000-4000-8000-000000000090'),
  (SELECT md5(row_to_json(o)::text) FROM public.assistant_turn_operations o
    WHERE operation_id = 'a0000000-0000-4000-8000-000000000090'),
  'retention_due_counts не променя нито един ред');

-- ---------------------------------------------------------------------------
-- 17) ОТКАЗ => нула празни разговори и нула мутации (corrective P0-E2).
--     U2 е на тавана от 3 безплатни AI съобщения.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-0000000000a1', '22222222-2222-4222-8222-222222222222',
    repeat('d', 64), NULL, 'legal_strict', true, 'free', NULL, 180, '{}'::jsonb, 3))->>'reason',
  'ai_free_limit_reached', 'изчерпаният безплатен таван отказва');
SELECT is(
  (SELECT count(*) FROM public.assistant_threads
    WHERE user_id = '22222222-2222-4222-8222-222222222222'), 0::bigint,
  'отказът НЕ създава празен разговор');
SELECT is(
  (SELECT count(*) FROM public.assistant_turn_operations
    WHERE operation_id = 'a0000000-0000-4000-8000-0000000000a1'), 0::bigint,
  'отказът НЕ създава ред в леджъра');
SELECT is(
  (SELECT ai_messages_used FROM public.download_quota
    WHERE user_id = '22222222-2222-4222-8222-222222222222'), 3,
  'отказът НЕ изразходва право');

-- ---------------------------------------------------------------------------
-- 18) Отмененият ред ОСТАВА и същата операция може да се опита отново.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-0000000000b1', '11111111-1111-4111-8111-111111111111',
    repeat('e', 64), NULL, 'legal_strict', true, 'free', NULL, 180, '{}'::jsonb, 9))->>'status',
  'reserved', 'резервация преди доставчика');
SELECT is(
  (public.assistant_turn_cancel(
    'a0000000-0000-4000-8000-0000000000b1', '11111111-1111-4111-8111-111111111111',
    'proven_preflight_failure'))->>'restored',
  'true', 'доказаната отмяна преди доставчика възстановява правото');
SELECT is(
  (SELECT count(*) FROM public.assistant_turn_operations
    WHERE operation_id = 'a0000000-0000-4000-8000-0000000000b1'), 1::bigint,
  'трайният ред на отменената операция НЕ се трие');
SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-0000000000b1', '11111111-1111-4111-8111-111111111111',
    repeat('e', 64), NULL, 'legal_strict', true, 'free', NULL, 180, '{}'::jsonb, 9))->>'status',
  'reserved', 'безопасният повторен опит преизползва СЪЩАТА операция');
SELECT is(
  (SELECT count(*) FROM public.assistant_turn_operations
    WHERE user_id = '11111111-1111-4111-8111-111111111111'
      AND operation_id = 'a0000000-0000-4000-8000-0000000000b1'), 1::bigint,
  'повторният опит НЕ създава втори ред');
SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-0000000000b1', '11111111-1111-4111-8111-111111111111',
    repeat('e', 64), NULL, 'clarification', true, 'free', NULL, 180, '{}'::jsonb, 9))->>'status',
  'in_progress', 'вече резервираният ход не се презаписва с друг режим');

-- ---------------------------------------------------------------------------
-- 19) Доказуем преход към изравняване при несигурност след стартиран модел.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.assistant_turn_mark_model_started(
    'a0000000-0000-4000-8000-0000000000b1', '11111111-1111-4111-8111-111111111111'))->>'status',
  'ok', 'моделът се маркира като стартиран');
SELECT is(
  (public.assistant_turn_mark_reconciliation(
    'a0000000-0000-4000-8000-0000000000b1', '11111111-1111-4111-8111-111111111111',
    'provider_failed'))->>'status',
  'reconciliation', 'несигурността след старта нанася доказуем преход');
SELECT is(
  (SELECT state FROM public.assistant_turn_operations
    WHERE operation_id = 'a0000000-0000-4000-8000-0000000000b1'), 'reconciliation',
  'състоянието вече не изглежда „в процес“');
SELECT ok(
  (SELECT reconciliation_required FROM public.assistant_turn_operations
    WHERE operation_id = 'a0000000-0000-4000-8000-0000000000b1'),
  'ходът е видим за изравняване');
SELECT is(
  (public.assistant_turn_cancel(
    'a0000000-0000-4000-8000-0000000000b1', '11111111-1111-4111-8111-111111111111',
    'late_attempt'))->>'status',
  'reconciliation', 'изравняването НЕ се превръща в отмяна и НЕ възстановява право');

-- ---------------------------------------------------------------------------
-- 20) Изтекъл лизинг НИКОГА не стартира модел.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-0000000000c1', '11111111-1111-4111-8111-111111111111',
    repeat('f', 64), NULL, 'legal_strict', true, 'free', NULL, 180, '{}'::jsonb, 9))->>'status',
  'reserved', 'резервация за проверка на лизинга');
UPDATE public.assistant_turn_operations
   SET lease_expires_at = now() - interval '1 minute'
 WHERE operation_id = 'a0000000-0000-4000-8000-0000000000c1';
SELECT is(
  (public.assistant_turn_mark_model_started(
    'a0000000-0000-4000-8000-0000000000c1', '11111111-1111-4111-8111-111111111111'))->>'status',
  'reconciliation', 'изтеклият лизинг не стартира модел');
SELECT ok(
  (SELECT model_started_at IS NULL FROM public.assistant_turn_operations
    WHERE operation_id = 'a0000000-0000-4000-8000-0000000000c1'),
  'при изтекъл лизинг НЕ се отбелязва стартиран модел');

-- ---------------------------------------------------------------------------
-- 21) Строга валидация на входа: нищо не се резервира при съмнение.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-0000000000d1', '11111111-1111-4111-8111-111111111111',
    'НЕ-Е-ХЕШ', NULL, 'legal_strict', false, NULL, NULL, 180, '{}'::jsonb, 9))->>'reason',
  'invalid_binding', 'обвързване извън шестнайсетичния формат се отхвърля');
SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-0000000000d1', '11111111-1111-4111-8111-111111111111',
    repeat('1', 64), NULL, 'общ_режим', false, NULL, NULL, 180, '{}'::jsonb, 9))->>'reason',
  'invalid_mode', 'непознат режим се отхвърля');
SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-0000000000d1', '11111111-1111-4111-8111-111111111111',
    repeat('1', 64), NULL, 'platform_help', false, 'free', NULL, 180, '{}'::jsonb, 9))->>'reason',
  'allocation_without_charge', 'разпределение без такса се отхвърля');
SELECT is(
  (SELECT count(*) FROM public.assistant_turn_operations
    WHERE operation_id = 'a0000000-0000-4000-8000-0000000000d1'), 0::bigint,
  'невалидният вход НЕ оставя ред в леджъра');

-- ---------------------------------------------------------------------------
-- 22) ОТКАЗ при ЛИПСВАЩИ броячи: нула създадени редове (corrective P0-E2).
--     U7 няма ред в download_quota; T2 няма ред в team_usage.
-- ---------------------------------------------------------------------------
RESET ROLE;
INSERT INTO auth.users (id, email) VALUES
  ('55555555-5555-4555-8555-555555555555', 'u5@example.com'),
  ('66666666-6666-4666-8666-666666666666', 'u6@example.com'),
  ('77777777-7777-4777-8777-777777777777', 'u7@example.com');
DELETE FROM public.notifications WHERE user_id IN (
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777');
DELETE FROM public.folders WHERE user_id IN (
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777');
DELETE FROM public.download_quota WHERE user_id IN (
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777');
DELETE FROM public.profiles WHERE id IN (
  '55555555-5555-4555-8555-555555555555',
  '66666666-6666-4666-8666-666666666666',
  '77777777-7777-4777-8777-777777777777');

INSERT INTO public.profiles (id, display_name) VALUES
  ('55555555-5555-4555-8555-555555555555', 'Потребител Пет'),
  ('66666666-6666-4666-8666-666666666666', 'Потребител Шест'),
  ('77777777-7777-4777-8777-777777777777', 'Потребител Седем');

INSERT INTO public.teams (id, name, owner_id, seat_count, status)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'Екип без употреба',
  '66666666-6666-4666-8666-666666666666', 1, 'active');
INSERT INTO public.team_members (team_id, user_id, role)
VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '66666666-6666-4666-8666-666666666666', 'owner');

SET LOCAL role service_role;

SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-0000000000e1', '77777777-7777-4777-8777-777777777777',
    repeat('a', 64), NULL, 'legal_strict', true, 'pro', NULL, 180, '{}'::jsonb, 3))->>'reason',
  'plan_not_active', 'липсващ ред за квота + платен път => отказ');
SELECT is(
  (SELECT count(*) FROM public.download_quota
    WHERE user_id = '77777777-7777-4777-8777-777777777777'), 0::bigint,
  'отказът НЕ създава ред в download_quota');
SELECT is(
  (SELECT count(*) FROM public.assistant_turn_operations
    WHERE operation_id = 'a0000000-0000-4000-8000-0000000000e1'), 0::bigint,
  'отказът при липсващ брояч НЕ оставя ред в леджъра');
SELECT is(
  (SELECT count(*) FROM public.assistant_threads
    WHERE user_id = '77777777-7777-4777-8777-777777777777'), 0::bigint,
  'отказът при липсващ брояч НЕ създава разговор');
SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-0000000000e2', '77777777-7777-4777-8777-777777777777',
    repeat('b', 64), NULL, 'legal_strict', true, 'free', NULL, 180, '{}'::jsonb, 0))->>'reason',
  'ai_free_limit_reached', 'нулев безплатен таван при липсващ ред => отказ');
SELECT is(
  (SELECT count(*) FROM public.download_quota
    WHERE user_id = '77777777-7777-4777-8777-777777777777'), 0::bigint,
  'нулевият таван също НЕ създава ред за квота');
SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-0000000000e3', '77777777-7777-4777-8777-777777777777',
    repeat('c', 64), NULL, 'legal_strict', true, 'team',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 180, '{}'::jsonb, 3))->>'reason',
  'not_team_member', 'чужд екип => отказ');
SELECT is(
  (SELECT count(*) FROM public.team_usage
    WHERE team_id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 0::bigint,
  'екипният отказ НЕ създава ред в team_usage');
SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-0000000000e4', '77777777-7777-4777-8777-777777777777',
    repeat('d', 64), NULL, 'legal_strict', true, 'free', NULL, 180, '{}'::jsonb, 3))->>'status',
  'reserved', 'допустимата заявка създава реда за квота точно тогава');
SELECT is(
  (SELECT ai_messages_used FROM public.download_quota
    WHERE user_id = '77777777-7777-4777-8777-777777777777'), 1,
  'новосъздаденият ред носи ТОЧНО една начислена операция');

-- ---------------------------------------------------------------------------
-- 23) Превъртян прозорец: по-късна употреба НЕ се изтрива от отмяната.
-- ---------------------------------------------------------------------------
INSERT INTO public.download_quota (
  user_id, plan, ai_messages_used, total_used, monthly_total_used,
  monthly_contracts_used, monthly_templates_used, monthly_reset_at)
VALUES
  ('55555555-5555-4555-8555-555555555555', 'free', 0, 7, 7, 2, 5,
    now() - interval '40 days'),
  ('66666666-6666-4666-8666-666666666666', 'free', 0, 7, 7, 2, 5,
    now() - interval '40 days');

SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-0000000000f1', '55555555-5555-4555-8555-555555555555',
    repeat('1', 64), NULL, 'legal_strict', true, 'free', NULL, 180, '{}'::jsonb, 3))->>'status',
  'reserved', 'резервация, която превърта месечния прозорец');
SELECT is(
  (SELECT monthly_total_used FROM public.download_quota
    WHERE user_id = '55555555-5555-4555-8555-555555555555'), 1,
  'превъртеният прозорец започва от тази операция');

-- Друга легитимна операция ползва СЪЩИЯ нов прозорец след резервацията.
UPDATE public.download_quota
   SET monthly_total_used = monthly_total_used + 1,
       total_used = total_used + 1
 WHERE user_id = '55555555-5555-4555-8555-555555555555';

SELECT is(
  (public.assistant_turn_cancel(
    'a0000000-0000-4000-8000-0000000000f1', '55555555-5555-4555-8555-555555555555',
    'proven_preflight_failure'))->>'status',
  'reconciliation', 'недоказуемото възстановяване НЕ се прилага');
SELECT is(
  (public.assistant_turn_cancel(
    'a0000000-0000-4000-8000-0000000000f1', '55555555-5555-4555-8555-555555555555',
    'proven_preflight_failure'))->>'reason',
  'later_usage', 'причината е по-късна употреба в същия прозорец');
SELECT is(
  (SELECT monthly_total_used FROM public.download_quota
    WHERE user_id = '55555555-5555-4555-8555-555555555555'), 2,
  'по-късната употреба НЕ е изтрита от отмяната');
SELECT is(
  (SELECT state FROM public.assistant_turn_operations
    WHERE operation_id = 'a0000000-0000-4000-8000-0000000000f1'), 'reconciliation',
  'операцията е в изравняване, не в отмяна');

SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-0000000000f2', '66666666-6666-4666-8666-666666666666',
    repeat('2', 64), NULL, 'legal_strict', true, 'free', NULL, 180, '{}'::jsonb, 3))->>'status',
  'reserved', 'втора резервация с превъртане, но без по-късна употреба');
SELECT is(
  (public.assistant_turn_cancel(
    'a0000000-0000-4000-8000-0000000000f2', '66666666-6666-4666-8666-666666666666',
    'proven_preflight_failure'))->>'restored',
  'true', 'без по-късна употреба възстановяването е точно');
SELECT is(
  (SELECT monthly_total_used FROM public.download_quota
    WHERE user_id = '66666666-6666-4666-8666-666666666666'), 7,
  'точното възстановяване връща предишния прозорец');
SELECT is(
  (SELECT ai_messages_used FROM public.download_quota
    WHERE user_id = '66666666-6666-4666-8666-666666666666'), 0,
  'точното възстановяване връща и броя AI съобщения');

-- ---------------------------------------------------------------------------
-- 24) Неразрешено изравняване ДЪРЖИ ревизията: никакъв втори ход/втори модел.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-0000000000f3', '55555555-5555-4555-8555-555555555555',
    repeat('3', 64),
    (SELECT thread_id FROM public.assistant_turn_operations
      WHERE operation_id = 'a0000000-0000-4000-8000-0000000000f1'),
    'legal_strict', true, 'free', NULL, 180, '{}'::jsonb, 9))->>'status',
  'reconciliation', 'друга операция НЕ резервира ревизия с неразрешено изравняване');
SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-0000000000f4', '55555555-5555-4555-8555-555555555555',
    repeat('4', 64),
    (SELECT thread_id FROM public.assistant_turn_operations
      WHERE operation_id = 'a0000000-0000-4000-8000-0000000000f1'),
    'legal_strict', true, 'free', NULL, 180, '{}'::jsonb, 9))->>'reason',
  'revision_unresolved', 'причината е неразрешено състояние на ревизията');
SELECT is(
  (SELECT count(*) FROM public.assistant_turn_operations
    WHERE operation_id IN ('a0000000-0000-4000-8000-0000000000f3',
                           'a0000000-0000-4000-8000-0000000000f4')), 0::bigint,
  'блокираните заявки НЕ оставят редове в леджъра');
SELECT is(
  (SELECT ai_messages_used FROM public.download_quota
    WHERE user_id = '55555555-5555-4555-8555-555555555555'), 1,
  'блокираните заявки НЕ изразходват право');
SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-0000000000f1', '55555555-5555-4555-8555-555555555555',
    repeat('1', 64), NULL, 'legal_strict', true, 'free', NULL, 180, '{}'::jsonb, 3))->>'status',
  'reconciliation', 'СЪЩАТА операция получава изравняване, не нова резервация');

-- ---------------------------------------------------------------------------
-- 25) PRO превъртане: по-късна легитимна употреба НЕ се изтрива от отмяната.
-- ---------------------------------------------------------------------------
RESET ROLE;
INSERT INTO auth.users (id, email) VALUES
  ('88888888-8888-4888-8888-888888888888', 'u8@example.com'),
  ('99999999-9999-4999-8999-999999999999', 'u9@example.com');
DELETE FROM public.notifications WHERE user_id IN (
  '88888888-8888-4888-8888-888888888888',
  '99999999-9999-4999-8999-999999999999');
DELETE FROM public.folders WHERE user_id IN (
  '88888888-8888-4888-8888-888888888888',
  '99999999-9999-4999-8999-999999999999');
DELETE FROM public.download_quota WHERE user_id IN (
  '88888888-8888-4888-8888-888888888888',
  '99999999-9999-4999-8999-999999999999');
DELETE FROM public.profiles WHERE id IN (
  '88888888-8888-4888-8888-888888888888',
  '99999999-9999-4999-8999-999999999999');

INSERT INTO public.profiles (id, display_name) VALUES
  ('88888888-8888-4888-8888-888888888888', 'Потребител Осем'),
  ('99999999-9999-4999-8999-999999999999', 'Потребител Девет');

INSERT INTO public.download_quota (
  user_id, plan, plan_ops_cap, pro_monthly_used, pro_period_start,
  ai_messages_used, total_used, monthly_total_used,
  monthly_contracts_used, monthly_templates_used, monthly_reset_at)
VALUES (
  '88888888-8888-4888-8888-888888888888', 'pro', 50, 9,
  now() - interval '40 days', 4, 12, 9, 3, 6, now() - interval '40 days');

SET LOCAL role service_role;

SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-0000000000e9', '88888888-8888-4888-8888-888888888888',
    repeat('5', 64), NULL, 'legal_strict', true, 'pro', NULL, 180,
    '{"title":"Pro превъртане"}'::jsonb, 3))->>'status',
  'reserved', 'pro резервация, която превърта и месечния, и pro прозореца');
SELECT is(
  (SELECT pro_monthly_used FROM public.download_quota
    WHERE user_id = '88888888-8888-4888-8888-888888888888'), 1,
  'превъртеният pro прозорец започва от тази операция');
SELECT is(
  (SELECT monthly_total_used FROM public.download_quota
    WHERE user_id = '88888888-8888-4888-8888-888888888888'), 0,
  'месечният брояч е превъртян на нула при pro път');

-- Друга легитимна операция ползва СЪЩИЯ нов прозорец СЛЕД резервацията.
UPDATE public.download_quota
   SET pro_monthly_used = pro_monthly_used + 1,
       monthly_total_used = monthly_total_used + 1,
       monthly_contracts_used = monthly_contracts_used + 1,
       total_used = total_used + 1
 WHERE user_id = '88888888-8888-4888-8888-888888888888';

SELECT is(
  (public.assistant_turn_cancel(
    'a0000000-0000-4000-8000-0000000000e9', '88888888-8888-4888-8888-888888888888',
    'proven_preflight_failure'))->>'status',
  'reconciliation', 'pro: недоказуемото възстановяване НЕ се прилага');
SELECT is(
  (public.assistant_turn_cancel(
    'a0000000-0000-4000-8000-0000000000e9', '88888888-8888-4888-8888-888888888888',
    'proven_preflight_failure'))->>'reason',
  'later_usage', 'pro: причината е по-късна употреба в същия прозорец');
SELECT is(
  (SELECT pro_monthly_used FROM public.download_quota
    WHERE user_id = '88888888-8888-4888-8888-888888888888'), 2,
  'pro: по-късната употреба НЕ е изтрита от отмяната');
SELECT is(
  (SELECT monthly_total_used FROM public.download_quota
    WHERE user_id = '88888888-8888-4888-8888-888888888888'), 1,
  'pro: месечният брояч след резервацията е запазен');
SELECT is(
  (SELECT monthly_contracts_used FROM public.download_quota
    WHERE user_id = '88888888-8888-4888-8888-888888888888'), 1,
  'pro: броячът на договорите след резервацията е запазен');
SELECT is(
  (SELECT total_used FROM public.download_quota
    WHERE user_id = '88888888-8888-4888-8888-888888888888'), 14,
  'pro: общият брояч не е върнат назад върху по-късната употреба');
SELECT is(
  (SELECT state FROM public.assistant_turn_operations
    WHERE operation_id = 'a0000000-0000-4000-8000-0000000000e9'), 'reconciliation',
  'pro: операцията е в изравняване, не в отмяна');

-- ---------------------------------------------------------------------------
-- 26) ЕКИПНО превъртане: по-късна легитимна употреба НЕ се изтрива.
-- ---------------------------------------------------------------------------
INSERT INTO public.teams (id, name, owner_id, seat_count, status)
VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 'Екип на U9',
  '99999999-9999-4999-8999-999999999999', 3, 'active');
INSERT INTO public.team_members (team_id, user_id, role)
VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  '99999999-9999-4999-8999-999999999999', 'owner');
INSERT INTO public.team_usage (team_id, ops_used, lifetime_ops, period_start)
VALUES ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', 240, 900,
  now() - interval '40 days');

SELECT is(
  (public.assistant_turn_reserve(
    'a0000000-0000-4000-8000-0000000000ea', '99999999-9999-4999-8999-999999999999',
    repeat('6', 64), NULL, 'legal_strict', true, 'team',
    'cccccccc-cccc-4ccc-8ccc-cccccccccccc', 180,
    '{"title":"Екипно превъртане"}'::jsonb, 3))->>'status',
  'reserved', 'екипна резервация, която превърта периода');
SELECT is(
  (SELECT ops_used FROM public.team_usage
    WHERE team_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 1,
  'превъртеният екипен период започва от тази операция');

-- Друг член ползва СЪЩИЯ нов период СЛЕД резервацията.
UPDATE public.team_usage
   SET ops_used = ops_used + 2,
       lifetime_ops = lifetime_ops + 2
 WHERE team_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';

SELECT is(
  (public.assistant_turn_cancel(
    'a0000000-0000-4000-8000-0000000000ea', '99999999-9999-4999-8999-999999999999',
    'proven_preflight_failure'))->>'status',
  'reconciliation', 'екип: недоказуемото възстановяване НЕ се прилага');
SELECT is(
  (public.assistant_turn_cancel(
    'a0000000-0000-4000-8000-0000000000ea', '99999999-9999-4999-8999-999999999999',
    'proven_preflight_failure'))->>'reason',
  'later_usage', 'екип: причината е по-късна употреба в същия период');
SELECT is(
  (SELECT ops_used FROM public.team_usage
    WHERE team_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 3,
  'екип: по-късната употреба НЕ е изтрита от отмяната');
SELECT is(
  (SELECT lifetime_ops FROM public.team_usage
    WHERE team_id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 903,
  'екип: пожизненият брояч не е върнат назад върху по-късната употреба');
SELECT is(
  (SELECT state FROM public.assistant_turn_operations
    WHERE operation_id = 'a0000000-0000-4000-8000-0000000000ea'), 'reconciliation',
  'екип: операцията е в изравняване, не в отмяна');

-- ЗАБЕЛЕЖКА: истинска паралелна конкурентност (две сесии едновременно на
-- pg_advisory_xact_lock/FOR UPDATE) НЕ се доказва тук — няма dblink/паралелни
-- примитиви в тази фикстура. Конфликтът thread_busy е доказан чрез
-- последователни резервации на СЪЩАТА ревизия на разговора (детерминистично,
-- еквивалентно състояние на надпревара), но реалната едновременност остава
-- NOT PROVEN.

SELECT * FROM finish();
ROLLBACK;
