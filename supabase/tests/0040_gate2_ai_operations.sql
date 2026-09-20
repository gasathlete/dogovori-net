-- =============================================================================
-- pgTAP фикстури за 0040 (НЕ са изпълнени в тази среда — няма PostgreSQL).
-- Доказват: ai_document_operation_lookup е само-четящо (absent/in_progress/
-- committed/response_expired/reconciliation) и блокира нов ключ при неразрешено
-- обвързване; резервацията е атомарна (вълна всичко-или-нищо, без ред при
-- отказана квота); същият ключ с друго обвързване дава конфликт без промяна;
-- жива резервация по същото обвързване допуска САМО един победител; изтекъл
-- лизинг и застояла операция дават изравняване, а не втора резервация;
-- mark_model_started проверява собствения лизинг, предназначението и
-- обвързването; commit е невъзможен без трайно записано начало на модела,
-- приема САМО точното име за ai_usage според предназначението, прави най-много
-- една бизнес промяна (подписан плик върху СОБСТВЕН анализ със същата версия),
-- вписва ai_usage точно веднъж и се повтаря идентично; отмяна ПРЕДИ модела
-- възстановява точно, отмяна СЛЕД модела е невъзможна (изравняване, без
-- възстановяване и без втори модел); заличаването пипа само товара, а
-- retention_due_counts брои новите редове само-четящо.
--
-- НЕ е доказано тук: истинска конкурентност с две отделни сесии на PostgreSQL.
-- =============================================================================
BEGIN;
SELECT plan(142);

-- ---------------------------------------------------------------------------
-- 0) Права: леджърът е достъпен САМО за service_role.
-- ---------------------------------------------------------------------------
SELECT ok(
  NOT has_function_privilege('anon', 'public.ai_document_operation_reserve(uuid,uuid,text,text,text,uuid,text,integer,integer,text)', 'EXECUTE'),
  'anon няма право да резервира документна операция');
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.ai_document_operation_reserve(uuid,uuid,text,text,text,uuid,text,integer,integer,text)', 'EXECUTE'),
  'authenticated няма право да резервира документна операция');
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.ai_document_operation_commit(uuid,uuid,text,text,jsonb,integer,text,jsonb)', 'EXECUTE'),
  'authenticated няма право да прави commit');
SELECT ok(
  NOT has_function_privilege('anon', 'public.ai_document_operation_cancel(uuid,uuid,text)', 'EXECUTE'),
  'anon няма право да отменя документна операция');
SELECT ok(
  NOT has_function_privilege('authenticated', 'public.purge_ai_document_operation_payloads(uuid)', 'EXECUTE'),
  'authenticated няма право да заличава товари');
SELECT ok(
  has_function_privilege('service_role', 'public.ai_document_operation_lookup(uuid,uuid,text,text)', 'EXECUTE'),
  'service_role може да търси документна операция');
SELECT ok(
  has_function_privilege('service_role', 'public.ai_document_operations_reconcile_stale(integer)', 'EXECUTE'),
  'service_role може да изравнява застояли документни операции');
SELECT ok(
  has_function_privilege('service_role', 'public.sweep_expired_ai_document_operation_results(integer,boolean)', 'EXECUTE'),
  'service_role може да заличава изтекли товари');
SELECT is(
  (SELECT provolatile FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'ai_document_operation_lookup'), 's',
  'ai_document_operation_lookup е STABLE, следователно не може да пише');

-- Таблицата НЕ е част от Data API и няма позволяващи политики.
SELECT ok(
  (SELECT relrowsecurity FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relname = 'ai_document_operations'),
  'ai_document_operations е с включен RLS');
SELECT is(
  (SELECT count(*) FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'ai_document_operations'), 0::bigint,
  'ai_document_operations няма нито една политика');
SELECT ok(
  NOT has_table_privilege('anon', 'public.ai_document_operations', 'SELECT'),
  'anon не може да чете леджъра');
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.ai_document_operations', 'SELECT'),
  'authenticated не може да чете леджъра');
SELECT ok(
  has_table_privilege('service_role', 'public.ai_document_operations', 'SELECT'),
  'service_role може да чете леджъра');

-- Счетоводството в ai_usage е точно-еднократно по операция и функция.
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes
           WHERE schemaname = 'public' AND tablename = 'ai_usage'
             AND indexname = 'ai_usage_operation_function_uniq'),
  'ai_usage има уникален индекс по (operation_id, function_name)');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes
           WHERE schemaname = 'public' AND tablename = 'ai_document_operations'
             AND indexname = 'ai_document_operations_unresolved_binding_uniq'),
  'неразрешените обвързвания са уникални по потребител/предназначение/обвързване');

SET LOCAL role service_role;

-- ---------------------------------------------------------------------------
-- 1) Подготовка: потребители, квоти, собствен договор и собствен анализ.
-- ---------------------------------------------------------------------------
INSERT INTO auth.users (id, email) VALUES
  ('a1111111-1111-4111-8111-111111111111', 'd1@example.com'),
  ('a2222222-2222-4222-8222-222222222222', 'd2@example.com');

INSERT INTO public.download_quota (user_id, plan, plan_ops_cap, monthly_total_used, topup_ops_balance)
VALUES ('a1111111-1111-4111-8111-111111111111', 'free', 10, 0, 0)
ON CONFLICT (user_id) DO UPDATE
  SET plan_ops_cap = 10, monthly_total_used = 0, topup_ops_balance = 0;
INSERT INTO public.download_quota (user_id, plan, plan_ops_cap, monthly_total_used, topup_ops_balance)
VALUES ('a2222222-2222-4222-8222-222222222222', 'free', 2, 2, 0)
ON CONFLICT (user_id) DO UPDATE
  SET plan_ops_cap = 2, monthly_total_used = 2, topup_ops_balance = 0;

INSERT INTO public.uploaded_contracts (
  id, user_id, title, source, extracted_text, text_hash)
VALUES ('c1111111-1111-4111-8111-111111111111',
  'a1111111-1111-4111-8111-111111111111', 'Договор', 'upload', 'текст', repeat('1', 64));

INSERT INTO public.risk_analyses (
  id, uploaded_contract_id, user_id, model, score, text_hash)
VALUES ('b1111111-1111-4111-8111-111111111111',
  'c1111111-1111-4111-8111-111111111111',
  'a1111111-1111-4111-8111-111111111111', 'test-model', 50, repeat('1', 64));

-- ---------------------------------------------------------------------------
-- 2) Само-четящо търсене преди всяка променлива стъпка.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.ai_document_operation_lookup(
    'd0000001-0000-4000-8000-000000000001',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('a', 64)))->>'status',
  'absent', 'непозната операция дава absent');
SELECT is(
  (SELECT count(*) FROM public.ai_document_operations), 0::bigint,
  'търсенето НЕ създава ред');
SELECT is(
  (public.ai_document_operation_lookup(
    'd0000001-0000-4000-8000-000000000001',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', 'не-е-отпечатък'))->>'status',
  'invalid', 'невалидно обвързване дава invalid');
SELECT is(
  (public.ai_document_operation_lookup(
    NULL, 'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('a', 64)))->>'status',
  'invalid', 'липсващ ключ дава invalid');

-- ---------------------------------------------------------------------------
-- 3) Резервация без вълна: точно един ред, без такса.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.ai_document_operation_reserve(
    'd0000001-0000-4000-8000-000000000001',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('a', 64),
    repeat('f', 64), 'c1111111-1111-4111-8111-111111111111', 'rev-1', 600, 0, NULL))->>'status',
  'reserved', 'първата резервация успява');
SELECT is(
  (SELECT count(*) FROM public.ai_document_operations), 1::bigint,
  'създаден е точно един ред');
SELECT is(
  (SELECT state FROM public.ai_document_operations
    WHERE operation_id = 'd0000001-0000-4000-8000-000000000001'), 'reserved',
  'редът е в състояние reserved');
SELECT ok(
  (SELECT NOT charged AND wave_ops = 0 AND model_started_at IS NULL
     FROM public.ai_document_operations
    WHERE operation_id = 'd0000001-0000-4000-8000-000000000001'),
  'без вълна няма такса и няма стартиран модел');
SELECT ok(
  (SELECT lease_owner = 'd0000001-0000-4000-8000-000000000001'
     AND lease_expires_at > now() FROM public.ai_document_operations
    WHERE operation_id = 'd0000001-0000-4000-8000-000000000001'),
  'лизингът е собствен и жив');
SELECT ok(
  (SELECT result IS NULL AND detail IS NULL FROM public.ai_document_operations
    WHERE operation_id = 'd0000001-0000-4000-8000-000000000001'),
  'резервацията не пази товар и не пази код на грешка');

-- Повторна резервация от същия ключ: жив лизинг → един победител.
SELECT is(
  (public.ai_document_operation_reserve(
    'd0000001-0000-4000-8000-000000000001',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('a', 64),
    repeat('f', 64), 'c1111111-1111-4111-8111-111111111111', 'rev-1', 600, 0, NULL))->>'status',
  'in_progress', 'вторият опит по същия ключ не резервира втори път');
SELECT is(
  (SELECT count(*) FROM public.ai_document_operations), 1::bigint,
  'вторият опит не създава втори ред');

-- Различно обвързване по същия ключ: детерминиран конфликт без промяна.
SELECT is(
  (public.ai_document_operation_reserve(
    'd0000001-0000-4000-8000-000000000001',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('b', 64),
    repeat('f', 64), 'c1111111-1111-4111-8111-111111111111', 'rev-1', 600, 0, NULL))->>'status',
  'conflict', 'същият ключ с друго обвързване дава конфликт');
SELECT is(
  (SELECT binding_digest FROM public.ai_document_operations
    WHERE operation_id = 'd0000001-0000-4000-8000-000000000001'), repeat('a', 64),
  'обвързването на реда НЕ се пренаписва при конфликт');
SELECT is(
  (public.ai_document_operation_lookup(
    'd0000001-0000-4000-8000-000000000001',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('b', 64)))->>'status',
  'conflict', 'търсенето с друго обвързване също дава конфликт');
SELECT is(
  (public.ai_document_operation_lookup(
    'd0000001-0000-4000-8000-000000000001',
    'a2222222-2222-4222-8222-222222222222', 'correct_uploaded', repeat('a', 64)))->>'status',
  'conflict', 'чужд потребител не вижда операцията');

-- Нов ключ по СЪЩОТО живо обвързване: един победител.
SELECT is(
  (public.ai_document_operation_reserve(
    'd0000002-0000-4000-8000-000000000002',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('a', 64),
    repeat('f', 64), 'c1111111-1111-4111-8111-111111111111', 'rev-1', 600, 0, NULL))->>'status',
  'in_progress', 'втори ключ по същото живо обвързване чака, не резервира');
SELECT is(
  (SELECT count(*) FROM public.ai_document_operations), 1::bigint,
  'вторият ключ не създава ред');

-- ---------------------------------------------------------------------------
-- 4) Начало на модела: собствен лизинг, точно предназначение и обвързване.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.ai_document_operation_mark_model_started(
    'd0000001-0000-4000-8000-000000000001',
    'a1111111-1111-4111-8111-111111111111', 'ocr_contract', repeat('a', 64)))->>'reason',
  'binding_conflict', 'друго предназначение не може да стартира модела');
SELECT is(
  (public.ai_document_operation_mark_model_started(
    'd0000001-0000-4000-8000-000000000001',
    'a2222222-2222-4222-8222-222222222222', 'correct_uploaded', repeat('a', 64)))->>'reason',
  'binding_conflict', 'чужд потребител не може да стартира модела');
SELECT ok(
  (SELECT model_started_at IS NULL FROM public.ai_document_operations
    WHERE operation_id = 'd0000001-0000-4000-8000-000000000001'),
  'отказаният старт НЕ записва начало на модела');

-- Commit преди трайно начало на модела е невъзможен.
SELECT is(
  (public.ai_document_operation_commit(
    'd0000001-0000-4000-8000-000000000001',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('a', 64),
    '{"ok":true}'::jsonb, 3600, 'correct-uploaded', NULL))->>'reason',
  'model_not_started', 'commit без трайно начало на модела е отказан');
SELECT is(
  (SELECT count(*) FROM public.ai_usage
    WHERE operation_id = 'd0000001-0000-4000-8000-000000000001'), 0::bigint,
  'отказаният commit не вписва ai_usage');

SELECT is(
  (public.ai_document_operation_mark_model_started(
    'd0000001-0000-4000-8000-000000000001',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('a', 64)))->>'status',
  'ok', 'собственикът записва трайно начало на модела');
SELECT ok(
  (SELECT model_started_at IS NOT NULL FROM public.ai_document_operations
    WHERE operation_id = 'd0000001-0000-4000-8000-000000000001'),
  'началото на модела е трайно записано');
SELECT is(
  (public.ai_document_operation_mark_model_started(
    'd0000001-0000-4000-8000-000000000001',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('a', 64)))->>'status',
  'already_started', 'повторното маркиране е идемпотентно');

-- Отмяна СЛЕД стартиран модел е невъзможна: изравняване без възстановяване.
SELECT is(
  (public.ai_document_operation_cancel(
    'd0000001-0000-4000-8000-000000000001',
    'a1111111-1111-4111-8111-111111111111', 'client_gone'))->>'reason',
  'model_started', 'отмяна след стартиран модел дава изравняване');
SELECT is(
  (SELECT state FROM public.ai_document_operations
    WHERE operation_id = 'd0000001-0000-4000-8000-000000000001'), 'reconciliation',
  'редът минава в изравняване');
SELECT ok(
  (SELECT reconciliation_required AND detail = 'cancel_after_model_started'
     FROM public.ai_document_operations
    WHERE operation_id = 'd0000001-0000-4000-8000-000000000001'),
  'изравняването пази кратък код за произход');
SELECT is(
  (SELECT count(*) FROM public.ai_usage
    WHERE operation_id = 'd0000001-0000-4000-8000-000000000001'), 0::bigint,
  'изравняването не вписва разход');

-- Неразрешеното изравняване блокира НОВ ключ по същото обвързване.
SELECT is(
  (public.ai_document_operation_lookup(
    'd0000003-0000-4000-8000-000000000003',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('a', 64)))->>'reason',
  'binding_unresolved', 'търсенето блокира нов ключ при неразрешено обвързване');
SELECT is(
  (public.ai_document_operation_reserve(
    'd0000003-0000-4000-8000-000000000003',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('a', 64),
    repeat('f', 64), 'c1111111-1111-4111-8111-111111111111', 'rev-1', 600, 0, NULL))->>'reason',
  'binding_unresolved', 'резервацията блокира нов ключ при неразрешено обвързване');
SELECT is(
  (SELECT count(*) FROM public.ai_document_operations), 1::bigint,
  'блокираният нов ключ не създава ред');

-- Друго обвързване (истинска промяна на входа) НЕ е блокирано.
SELECT is(
  (public.ai_document_operation_reserve(
    'd0000004-0000-4000-8000-000000000004',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('c', 64),
    repeat('e', 64), 'c1111111-1111-4111-8111-111111111111', 'rev-2', 600, 0, NULL))->>'status',
  'reserved', 'нов вход с ново обвързване може да се резервира');

-- ---------------------------------------------------------------------------
-- 5) Отмяна ПРЕДИ модела: точна, доказана, повторяема.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.ai_document_operation_cancel(
    'd0000004-0000-4000-8000-000000000004',
    'a1111111-1111-4111-8111-111111111111', 'legal_unavailable'))->>'status',
  'cancelled', 'отмяната преди модела успява');
SELECT ok(
  (SELECT state = 'cancelled' AND cancelled_at IS NOT NULL AND NOT charged
     FROM public.ai_document_operations
    WHERE operation_id = 'd0000004-0000-4000-8000-000000000004'),
  'отмяната е доказана и без такса');
SELECT is(
  (public.ai_document_operation_cancel(
    'd0000004-0000-4000-8000-000000000004',
    'a1111111-1111-4111-8111-111111111111', 'legal_unavailable'))->>'replay',
  'true', 'повторната отмяна е повторение, не втора отмяна');
SELECT is(
  (public.ai_document_operation_lookup(
    'd0000004-0000-4000-8000-000000000004',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('c', 64)))->>'status',
  'absent', 'доказано отменената операция позволява нов опит');
SELECT is(
  (public.ai_document_operation_reserve(
    'd0000004-0000-4000-8000-000000000004',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('c', 64),
    repeat('e', 64), 'c1111111-1111-4111-8111-111111111111', 'rev-2', 600, 0, NULL))->>'status',
  'reserved', 'същият ключ се резервира отново след доказана отмяна');
SELECT is(
  (SELECT count(*) FROM public.ai_document_operations
    WHERE operation_id = 'd0000004-0000-4000-8000-000000000004'), 1::bigint,
  'повторната резервация остава един ред');

-- ---------------------------------------------------------------------------
-- 6) Commit: точно име за ai_usage, точно едно вписване, точно повторение.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.ai_document_operation_mark_model_started(
    'd0000004-0000-4000-8000-000000000004',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('c', 64)))->>'status',
  'ok', 'моделът стартира трайно преди commit');
SELECT is(
  (public.ai_document_operation_commit(
    'd0000004-0000-4000-8000-000000000004',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('c', 64),
    '{"ok":true}'::jsonb, 3600, 'ocr-contract', NULL))->>'reason',
  'usage_function_mismatch', 'чуждо име за ai_usage е отказано');
SELECT is(
  (SELECT count(*) FROM public.ai_usage
    WHERE operation_id = 'd0000004-0000-4000-8000-000000000004'), 0::bigint,
  'отказаното име не вписва разход');
SELECT is(
  (SELECT state FROM public.ai_document_operations
    WHERE operation_id = 'd0000004-0000-4000-8000-000000000004'), 'reserved',
  'отказаният commit не променя състоянието');
SELECT is(
  (public.ai_document_operation_commit(
    'd0000004-0000-4000-8000-000000000004',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('c', 64),
    '{"ok":true}'::jsonb, 3600, 'correct-uploaded',
    '{"kind":"negotiation_strategy","analysis_id":"b1111111-1111-4111-8111-111111111111"}'::jsonb))->>'reason',
  'business_purpose_mismatch', 'чужда бизнес промяна е отказана за това предназначение');
SELECT ok(
  (SELECT negotiation_strategy IS NULL FROM public.risk_analyses
    WHERE id = 'b1111111-1111-4111-8111-111111111111'),
  'отказаната бизнес промяна не пипа анализа');
SELECT is(
  (public.ai_document_operation_commit(
    'd0000004-0000-4000-8000-000000000004',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('c', 64),
    '{"corrected":true}'::jsonb, 3600, 'correct-uploaded', NULL))->>'status',
  'committed', 'commit с точното име успява');
SELECT is(
  (SELECT count(*) FROM public.ai_usage
    WHERE operation_id = 'd0000004-0000-4000-8000-000000000004'
      AND function_name = 'correct-uploaded'), 1::bigint,
  'ai_usage се вписва точно веднъж');
SELECT ok(
  (SELECT state = 'committed' AND committed_at IS NOT NULL
     AND result_expires_at > now() AND lease_expires_at IS NULL
     FROM public.ai_document_operations
    WHERE operation_id = 'd0000004-0000-4000-8000-000000000004'),
  'потвърдената операция пази товар с изтичане и пуска лизинга');
SELECT is(
  (public.ai_document_operation_commit(
    'd0000004-0000-4000-8000-000000000004',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('c', 64),
    '{"corrected":true}'::jsonb, 3600, 'correct-uploaded', NULL))->>'status',
  'replay', 'повторният commit е повторение, не втори запис');
SELECT is(
  (SELECT count(*) FROM public.ai_usage
    WHERE operation_id = 'd0000004-0000-4000-8000-000000000004'), 1::bigint,
  'повторението НЕ вписва втори разход');
SELECT is(
  (public.ai_document_operation_lookup(
    'd0000004-0000-4000-8000-000000000004',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('c', 64)))->>'status',
  'committed', 'търсенето връща потвърдения товар за точно повторение');
SELECT is(
  ((public.ai_document_operation_lookup(
    'd0000004-0000-4000-8000-000000000004',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('c', 64)))->'result')->>'corrected',
  'true', 'повторението връща СЪЩИЯ резултат');
SELECT is(
  (public.ai_document_operation_cancel(
    'd0000004-0000-4000-8000-000000000004',
    'a1111111-1111-4111-8111-111111111111', 'late'))->>'reason',
  'cancel_after_commit', 'отмяна след commit е невъзможна');

-- Изтекъл товар НИКОГА не се повтаря.
UPDATE public.ai_document_operations
   SET result_expires_at = now() - interval '1 minute'
 WHERE operation_id = 'd0000004-0000-4000-8000-000000000004';
SELECT is(
  (public.ai_document_operation_lookup(
    'd0000004-0000-4000-8000-000000000004',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('c', 64)))->>'status',
  'response_expired', 'изтеклият товар изисква нова заявка');
SELECT is(
  (public.ai_document_operation_reserve(
    'd0000004-0000-4000-8000-000000000004',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('c', 64),
    repeat('e', 64), 'c1111111-1111-4111-8111-111111111111', 'rev-2', 600, 0, NULL))->>'status',
  'response_expired', 'изтеклият товар не позволява втора резервация по същия ключ');

-- ---------------------------------------------------------------------------
-- 7) Бизнес промяна: САМО negotiation_strategy, САМО собствен анализ, САМО
--    подписан плик със същата версия на източника.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.ai_document_operation_reserve(
    'd0000005-0000-4000-8000-000000000005',
    'a1111111-1111-4111-8111-111111111111', 'negotiation_strategy', repeat('d', 64),
    repeat('9', 64), 'b1111111-1111-4111-8111-111111111111', 'v-1', 600, 0, NULL))->>'status',
  'reserved', 'стратегията се резервира срещу собствения анализ');
SELECT is(
  (public.ai_document_operation_mark_model_started(
    'd0000005-0000-4000-8000-000000000005',
    'a1111111-1111-4111-8111-111111111111', 'negotiation_strategy', repeat('d', 64)))->>'status',
  'ok', 'моделът за стратегия стартира трайно');
SELECT is(
  (public.ai_document_operation_commit(
    'd0000005-0000-4000-8000-000000000005',
    'a1111111-1111-4111-8111-111111111111', 'negotiation_strategy', repeat('d', 64),
    '{"ok":true}'::jsonb, 3600, 'negotiation-strategy',
    '{"kind":"negotiation_strategy","analysis_id":"b1111111-1111-4111-8111-111111111111","source_version":"v-9","envelope":{}}'::jsonb))->>'reason',
  'business_version_mismatch', 'друга версия на източника е отказана');
SELECT is(
  (public.ai_document_operation_commit(
    'd0000005-0000-4000-8000-000000000005',
    'a1111111-1111-4111-8111-111111111111', 'negotiation_strategy', repeat('d', 64),
    '{"ok":true}'::jsonb, 3600, 'negotiation-strategy',
    '{"kind":"negotiation_strategy","analysis_id":"b1111111-1111-4111-8111-111111111111","source_version":"v-1","envelope":{"plan":"x"}}'::jsonb))->>'reason',
  'business_envelope_invalid', 'плик без подписано доказателство е отказан');
SELECT is(
  (public.ai_document_operation_commit(
    'd0000005-0000-4000-8000-000000000005',
    'a1111111-1111-4111-8111-111111111111', 'negotiation_strategy', repeat('d', 64),
    '{"ok":true}'::jsonb, 3600, 'negotiation-strategy',
    ('{"kind":"negotiation_strategy","analysis_id":"b1111111-1111-4111-8111-111111111111","source_version":"v-1","envelope":{"plan":"x","__evidence":{"signature":"' || repeat('a', 64) || '","sources":[]}}}')::jsonb))->>'reason',
  'business_envelope_invalid', 'плик без източници е отказан');
SELECT ok(
  (SELECT negotiation_strategy IS NULL FROM public.risk_analyses
    WHERE id = 'b1111111-1111-4111-8111-111111111111'),
  'нито един отказан плик не е записан върху анализа');
SELECT is(
  (SELECT count(*) FROM public.ai_usage
    WHERE operation_id = 'd0000005-0000-4000-8000-000000000005'), 0::bigint,
  'отказаните бизнес проверки не вписват разход');
SELECT is(
  (public.ai_document_operation_commit(
    'd0000005-0000-4000-8000-000000000005',
    'a1111111-1111-4111-8111-111111111111', 'negotiation_strategy', repeat('d', 64),
    '{"ok":true}'::jsonb, 3600, 'negotiation-strategy',
    ('{"kind":"negotiation_strategy","analysis_id":"b1111111-1111-4111-8111-111111111111","source_version":"v-1","envelope":{"plan":"x","__evidence":{"signature":"' || repeat('a', 64) || '","sources":[{"id":"s1"}]}}}')::jsonb))->>'status',
  'committed', 'подписаният плик със същата версия се записва');
SELECT is(
  (SELECT negotiation_strategy->>'plan' FROM public.risk_analyses
    WHERE id = 'b1111111-1111-4111-8111-111111111111'), 'x',
  'пликът е записан върху собствения анализ');
SELECT is(
  (SELECT count(*) FROM public.ai_usage
    WHERE operation_id = 'd0000005-0000-4000-8000-000000000005'
      AND function_name = 'negotiation-strategy'), 1::bigint,
  'разходът за стратегия е точно един');
SELECT is(
  (public.ai_document_operation_commit(
    'd0000005-0000-4000-8000-000000000005',
    'a1111111-1111-4111-8111-111111111111', 'negotiation_strategy', repeat('d', 64),
    '{"ok":true}'::jsonb, 3600, 'negotiation-strategy',
    ('{"kind":"negotiation_strategy","analysis_id":"b1111111-1111-4111-8111-111111111111","source_version":"v-1","envelope":{"plan":"y","__evidence":{"signature":"' || repeat('a', 64) || '","sources":[{"id":"s1"}]}}}')::jsonb))->>'status',
  'replay', 'повторният commit на стратегия е повторение');
SELECT is(
  (SELECT negotiation_strategy->>'plan' FROM public.risk_analyses
    WHERE id = 'b1111111-1111-4111-8111-111111111111'), 'x',
  'повторението НЕ презаписва анализа втори път');

-- Чужд анализ НЕ може да бъде променен.
SELECT is(
  (public.ai_document_operation_reserve(
    'd0000006-0000-4000-8000-000000000006',
    'a2222222-2222-4222-8222-222222222222', 'negotiation_strategy', repeat('7', 64),
    NULL, 'b1111111-1111-4111-8111-111111111111', NULL, 600, 0, NULL))->>'status',
  'reserved', 'чужд потребител може да резервира собствен ключ');
SELECT is(
  (public.ai_document_operation_mark_model_started(
    'd0000006-0000-4000-8000-000000000006',
    'a2222222-2222-4222-8222-222222222222', 'negotiation_strategy', repeat('7', 64)))->>'status',
  'ok', 'моделът стартира и за чуждия ключ');
SELECT is(
  (public.ai_document_operation_commit(
    'd0000006-0000-4000-8000-000000000006',
    'a2222222-2222-4222-8222-222222222222', 'negotiation_strategy', repeat('7', 64),
    '{"ok":true}'::jsonb, 3600, 'negotiation-strategy',
    ('{"kind":"negotiation_strategy","analysis_id":"b1111111-1111-4111-8111-111111111111","envelope":{"plan":"z","__evidence":{"signature":"' || repeat('a', 64) || '","sources":[{"id":"s1"}]}}}')::jsonb))->>'reason',
  'business_not_owned', 'чужд анализ не може да бъде променен');
SELECT is(
  (SELECT negotiation_strategy->>'plan' FROM public.risk_analyses
    WHERE id = 'b1111111-1111-4111-8111-111111111111'), 'x',
  'чуждият опит не променя анализа');
SELECT is(
  (public.ai_document_operation_commit(
    'd0000006-0000-4000-8000-000000000006',
    'a2222222-2222-4222-8222-222222222222', 'negotiation_strategy', repeat('7', 64),
    '{"ok":true}'::jsonb, 3600, 'negotiation-strategy',
    '{"kind":"nonsense"}'::jsonb))->>'reason',
  'business_kind_unknown', 'непознат вид бизнес промяна е отказан');

-- ---------------------------------------------------------------------------
-- 8) Вълна (OCR): всичко-или-нищо. Отказана квота → НИЩО не се записва.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.ai_document_operation_reserve(
    'd0000007-0000-4000-8000-000000000007',
    'a2222222-2222-4222-8222-222222222222', 'ocr_contract', repeat('6', 64),
    NULL, NULL, NULL, 600, 4, 'analysis'))->>'status',
  'quota_exhausted', 'недостатъчната квота отказва цялата вълна');
SELECT is(
  (SELECT count(*) FROM public.ai_document_operations
    WHERE operation_id = 'd0000007-0000-4000-8000-000000000007'), 0::bigint,
  'отказаната вълна не създава ред в леджъра');
SELECT is(
  (SELECT count(*) FROM public.quota_wave_operations
    WHERE operation_id = 'd0000007-0000-4000-8000-000000000007'
      AND state = 'reserved'), 0::bigint,
  'отказаната вълна не оставя резервирана вълна');
SELECT is(
  (SELECT monthly_total_used FROM public.download_quota
    WHERE user_id = 'a2222222-2222-4222-8222-222222222222'), 2,
  'броячите остават непроменени при отказ');
SELECT is(
  (SELECT count(*) FROM public.ai_usage
    WHERE operation_id = 'd0000007-0000-4000-8000-000000000007'), 0::bigint,
  'отказът не вписва разход');

-- Успешна вълна: точен брой платими страници, commit на вълната.
SELECT is(
  (public.ai_document_operation_reserve(
    'd0000008-0000-4000-8000-000000000008',
    'a1111111-1111-4111-8111-111111111111', 'ocr_contract', repeat('5', 64),
    NULL, NULL, NULL, 600, 3, 'analysis'))->>'status',
  'reserved', 'достатъчната квота резервира цялата вълна');
SELECT is(
  (SELECT wave_ops FROM public.ai_document_operations
    WHERE operation_id = 'd0000008-0000-4000-8000-000000000008'), 3,
  'вълната пази точния брой платими страници');
SELECT ok(
  (SELECT charged AND wave_state = 'reserved' FROM public.ai_document_operations
    WHERE operation_id = 'd0000008-0000-4000-8000-000000000008'),
  'вълната е отбелязана като резервирана и таксувана');
SELECT is(
  (SELECT monthly_total_used FROM public.download_quota
    WHERE user_id = 'a1111111-1111-4111-8111-111111111111'), 3,
  'резервацията на вълната изразходва точно три операции');

-- Отмяна на вълна ПРЕДИ модела: точно възстановяване.
SELECT is(
  (public.ai_document_operation_cancel(
    'd0000008-0000-4000-8000-000000000008',
    'a1111111-1111-4111-8111-111111111111', 'page_limit'))->>'status',
  'cancelled', 'вълната се отменя преди модела');
SELECT is(
  (SELECT monthly_total_used FROM public.download_quota
    WHERE user_id = 'a1111111-1111-4111-8111-111111111111'), 0,
  'отмяната възстановява ТОЧНО изразходваното');
SELECT ok(
  (SELECT wave_state = 'cancelled' AND NOT charged FROM public.ai_document_operations
    WHERE operation_id = 'd0000008-0000-4000-8000-000000000008'),
  'отмяната е доказана и за вълната');

-- Успешен commit на вълна: без второ изразходване и без второ вписване.
SELECT is(
  (public.ai_document_operation_reserve(
    'd0000009-0000-4000-8000-000000000009',
    'a1111111-1111-4111-8111-111111111111', 'ocr_contract', repeat('4', 64),
    NULL, NULL, NULL, 600, 2, 'analysis'))->>'status',
  'reserved', 'втората вълна се резервира');
SELECT is(
  (public.ai_document_operation_mark_model_started(
    'd0000009-0000-4000-8000-000000000009',
    'a1111111-1111-4111-8111-111111111111', 'ocr_contract', repeat('4', 64)))->>'status',
  'ok', 'моделът за OCR стартира трайно');
SELECT is(
  (public.ai_document_operation_commit(
    'd0000009-0000-4000-8000-000000000009',
    'a1111111-1111-4111-8111-111111111111', 'ocr_contract', repeat('4', 64),
    '{"pages":2}'::jsonb, 3600, 'ocr-contract', NULL))->>'status',
  'committed', 'вълната се потвърждава');
SELECT is(
  (SELECT monthly_total_used FROM public.download_quota
    WHERE user_id = 'a1111111-1111-4111-8111-111111111111'), 2,
  'commit не изразходва втори път');
SELECT is(
  (SELECT wave_state FROM public.ai_document_operations
    WHERE operation_id = 'd0000009-0000-4000-8000-000000000009'), 'committed',
  'вълната е в състояние committed');
SELECT is(
  (SELECT count(*) FROM public.ai_usage
    WHERE operation_id = 'd0000009-0000-4000-8000-000000000009'), 1::bigint,
  'OCR вписва точно един разход');

-- ---------------------------------------------------------------------------
-- 9) Изравняване при несигурност СЛЕД модела: без възстановяване, без втори модел.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.ai_document_operation_reserve(
    'd0000010-0000-4000-8000-000000000010',
    'a1111111-1111-4111-8111-111111111111', 'generate_linked_document', repeat('3', 64),
    NULL, 'c1111111-1111-4111-8111-111111111111', 'rev-1', 600, 0, NULL))->>'status',
  'reserved', 'свързаният документ се резервира');
SELECT is(
  (public.ai_document_operation_mark_model_started(
    'd0000010-0000-4000-8000-000000000010',
    'a1111111-1111-4111-8111-111111111111', 'generate_linked_document', repeat('3', 64)))->>'status',
  'ok', 'моделът за свързан документ стартира трайно');
SELECT is(
  (public.ai_document_operation_mark_reconciliation(
    'd0000010-0000-4000-8000-000000000010',
    'a1111111-1111-4111-8111-111111111111', 'provider_uncertainty'))->>'status',
  'reconciliation', 'несигурността след модела дава изравняване');
SELECT is(
  (SELECT detail FROM public.ai_document_operations
    WHERE operation_id = 'd0000010-0000-4000-8000-000000000010'), 'provider_uncertainty',
  'изравняването пази кратък код, не текст на документ');
SELECT is(
  (SELECT count(*) FROM public.ai_usage
    WHERE operation_id = 'd0000010-0000-4000-8000-000000000010'), 0::bigint,
  'изравняването не вписва разход');
SELECT is(
  (public.ai_document_operation_mark_reconciliation(
    'd0000010-0000-4000-8000-000000000010',
    'a1111111-1111-4111-8111-111111111111', 'provider_uncertainty'))->>'replay',
  'true', 'повторното изравняване е повторение');
SELECT is(
  (public.ai_document_operation_commit(
    'd0000010-0000-4000-8000-000000000010',
    'a1111111-1111-4111-8111-111111111111', 'generate_linked_document', repeat('3', 64),
    '{"ok":true}'::jsonb, 3600, 'generate-linked-document', NULL))->>'reason',
  'not_reserved', 'commit след изравняване е невъзможен');
SELECT is(
  (public.ai_document_operation_mark_model_started(
    'd0000010-0000-4000-8000-000000000010',
    'a1111111-1111-4111-8111-111111111111', 'generate_linked_document', repeat('3', 64)))->>'reason',
  'not_reserved', 'втори модел след изравняване е невъзможен');

-- ---------------------------------------------------------------------------
-- 10) Изтекъл лизинг и метач: изравняване, никога втора резервация.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.ai_document_operation_reserve(
    'd0000011-0000-4000-8000-000000000011',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('2', 64),
    NULL, 'c1111111-1111-4111-8111-111111111111', 'rev-3', 600, 0, NULL))->>'status',
  'reserved', 'подготвителната резервация успява');
UPDATE public.ai_document_operations
   SET lease_expires_at = now() - interval '1 minute'
 WHERE operation_id = 'd0000011-0000-4000-8000-000000000011';
SELECT is(
  (public.ai_document_operation_lookup(
    'd0000011-0000-4000-8000-000000000011',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('2', 64)))->>'reason',
  'lease_expired', 'изтеклият лизинг дава изравняване при търсене');
SELECT is(
  (SELECT state FROM public.ai_document_operations
    WHERE operation_id = 'd0000011-0000-4000-8000-000000000011'), 'reserved',
  'само-четящото търсене НЕ променя състоянието');
SELECT is(
  (public.ai_document_operation_reserve(
    'd0000011-0000-4000-8000-000000000011',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('2', 64),
    NULL, 'c1111111-1111-4111-8111-111111111111', 'rev-3', 600, 0, NULL))->>'reason',
  'lease_expired', 'изтеклият лизинг не позволява втора резервация');
SELECT is(
  (public.ai_document_operation_reserve(
    'd0000012-0000-4000-8000-000000000012',
    'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('2', 64),
    NULL, 'c1111111-1111-4111-8111-111111111111', 'rev-3', 600, 0, NULL))->>'reason',
  'binding_unresolved', 'нов ключ по изтекла резервация е блокиран преди метача');
SELECT is(
  (SELECT count(*) FROM public.ai_document_operations
    WHERE operation_id = 'd0000012-0000-4000-8000-000000000012'), 0::bigint,
  'блокираният нов ключ не създава ред');
SELECT is(
  (public.ai_document_operations_reconcile_stale(50))->>'flagged', '1',
  'метачът маркира точно застоялата операция');
SELECT is(
  (SELECT state FROM public.ai_document_operations
    WHERE operation_id = 'd0000011-0000-4000-8000-000000000011'), 'reconciliation',
  'застоялата операция е маркирана за изравняване');
SELECT is(
  (SELECT detail FROM public.ai_document_operations
    WHERE operation_id = 'd0000011-0000-4000-8000-000000000011'), 'stale_lease',
  'метачът пази кратък код stale_lease');
SELECT is(
  (SELECT monthly_total_used FROM public.download_quota
    WHERE user_id = 'a1111111-1111-4111-8111-111111111111'), 2,
  'метачът НЕ възстановява квота автоматично');

-- ---------------------------------------------------------------------------
-- 11) Заличаване и преброяване: пада САМО товарът.
-- ---------------------------------------------------------------------------
UPDATE public.ai_document_operations
   SET result = '{"corrected":true}'::jsonb, result_expires_at = now() - interval '1 hour'
 WHERE operation_id = 'd0000009-0000-4000-8000-000000000009';
SELECT is(
  (public.retention_due_counts())->>'ai_document_results_due', '2',
  'преброяването включва дължимите документни товари');
SELECT ok(
  (public.retention_due_counts()) ? 'ai_document_stale_due',
  'преброяването включва и застоялите документни операции');
SELECT is(
  (public.sweep_expired_ai_document_operation_results(50, true))->>'cleared', '0',
  'пробното заличаване не изчиства нищо');
SELECT ok(
  (SELECT result IS NOT NULL FROM public.ai_document_operations
    WHERE operation_id = 'd0000009-0000-4000-8000-000000000009'),
  'товарът остава след пробно заличаване');
SELECT is(
  (public.sweep_expired_ai_document_operation_results(50, false))->>'cleared', '2',
  'истинското заличаване изчиства точно изтеклите товари');
SELECT ok(
  (SELECT result IS NULL AND result_expires_at IS NULL
     FROM public.ai_document_operations
    WHERE operation_id = 'd0000009-0000-4000-8000-000000000009'),
  'товарът е заличен');
SELECT is(
  (SELECT state FROM public.ai_document_operations
    WHERE operation_id = 'd0000009-0000-4000-8000-000000000009'), 'committed',
  'счетоводството остава след заличаване');
SELECT is(
  (SELECT count(*) FROM public.ai_usage
    WHERE operation_id = 'd0000009-0000-4000-8000-000000000009'), 1::bigint,
  'заличаването не пипа ai_usage');

-- Заличаване по искане на потребител.
UPDATE public.ai_document_operations
   SET result = '{"corrected":true}'::jsonb, result_expires_at = now() + interval '1 day'
 WHERE operation_id = 'd0000009-0000-4000-8000-000000000009';
SELECT is(
  (public.purge_ai_document_operation_payloads(
    'a2222222-2222-4222-8222-222222222222'))->>'cleared', '0',
  'заличаването на друг потребител не пипа този товар');
SELECT is(
  (public.purge_ai_document_operation_payloads(
    'a1111111-1111-4111-8111-111111111111'))->>'cleared', '1',
  'заличаването по искане изчиства точно неговия товар');
SELECT ok(
  (SELECT result IS NULL AND state = 'committed' FROM public.ai_document_operations
    WHERE operation_id = 'd0000009-0000-4000-8000-000000000009'),
  'след заличаване остава само счетоводството');

-- ---------------------------------------------------------------------------
-- 12) Никакво сурово съдържание в леджъра.
-- ---------------------------------------------------------------------------
SELECT is(
  (SELECT count(*) FROM public.ai_document_operations
    WHERE binding_digest !~ '^[0-9a-f]{64}$'), 0::bigint,
  'всяко обвързване е отпечатък');
SELECT is(
  (SELECT count(*) FROM public.ai_document_operations
    WHERE input_digest IS NOT NULL AND input_digest !~ '^[0-9a-f]{64}$'), 0::bigint,
  'всеки отпечатък на входа е отпечатък');
SELECT is(
  (SELECT count(*) FROM public.ai_document_operations
    WHERE detail IS NOT NULL AND detail !~ '^[a-z0-9_]{1,64}$'), 0::bigint,
  'кодовете за произход са кратки и без текст на документ');
SELECT throws_ok(
  $$SELECT public.ai_document_operation_reserve(
      'd0000013-0000-4000-8000-000000000013',
      'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', 'не е отпечатък',
      NULL, NULL, NULL, 600, 0, NULL)$$,
  '22023', 'binding_required',
  'обвързване, което не е отпечатък, е отказано');
SELECT throws_ok(
  $$SELECT public.ai_document_operation_reserve(
      'd0000014-0000-4000-8000-000000000014',
      'a1111111-1111-4111-8111-111111111111', 'unknown_purpose', repeat('8', 64),
      NULL, NULL, NULL, 600, 0, NULL)$$,
  '22023', 'purpose_invalid',
  'непознато предназначение е отказано');
SELECT throws_ok(
  $$SELECT public.ai_document_operation_reserve(
      NULL, 'a1111111-1111-4111-8111-111111111111', 'correct_uploaded', repeat('8', 64),
      NULL, NULL, NULL, 600, 0, NULL)$$,
  '22023', 'operation_id_and_user_required',
  'липсващ ключ на операция е отказан');

SELECT * FROM finish();
ROLLBACK;
