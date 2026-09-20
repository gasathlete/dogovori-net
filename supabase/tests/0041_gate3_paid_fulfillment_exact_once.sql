-- =============================================================================
-- pgTAP фикстури за 0041 (АВТОРИРАНИ, НО НЕ ИЗПЪЛНЕНИ — 0041 не е приложена и
-- в тази среда няма PostgreSQL).
--
-- Доказват ПОВЕДЕНИЕ, не низове в текста на миграцията:
--   * `consume` прави ново извикване на доставчик НЕВЪЗМОЖНО по същото право и
--     затваря предмета терминално, без да измисля резултат и без да връща право;
--   * `release` се отказва, освен при доказано НЕизпълнение на доставчика, и
--     то само когато няма нито едно трайно извикване;
--   * повторението на СЪЩОТО решение е идемпотентно, различното пада (fail closed);
--   * сираче извикване (заявено или приключено без успешно уточнение) спира ново
--     уточнение дори когато вписването на неизясненото състояние е пропаднало;
--   * одитът е ЗАТВОРЕН код за причина + непрозрачен номер на случай, без проза;
--   * вписването и разрешаването са достъпни САМО за служебната роля, а четенето
--     на състоянието не може да пише.
--
-- НЕ е доказано тук: истинска конкурентност с две отделни сесии на PostgreSQL и
-- поведение върху приложена схема с реални платени права.
-- =============================================================================
BEGIN;
SELECT plan(58);

SET LOCAL role service_role;

-- ---------------------------------------------------------------------------
-- 1) Структура на трайното състояние.
-- ---------------------------------------------------------------------------
SELECT ok(has_column('public', 'product_fulfillment_jobs', 'reconciliation_required_at'),
  'задачата носи начало на неизясненото състояние');
SELECT ok(has_column('public', 'product_fulfillment_jobs', 'reconciliation_code'),
  'задачата носи затворен код за изясняване');
SELECT ok(has_column('public', 'product_fulfillment_jobs', 'reconciliation_call_id'),
  'задачата помни точното извикване');
SELECT ok(has_column('public', 'product_fulfillment_jobs', 'reconciliation_resolved_at'),
  'задачата помни кога е разрешено');
SELECT ok(has_column('public', 'product_result_refinements', 'reconciliation_required_at'),
  'уточнението носи начало на неизясненото състояние');
SELECT ok(has_column('public', 'product_result_refinements', 'reconciliation_code'),
  'уточнението носи затворен код за изясняване');
SELECT ok(has_column('public', 'product_result_refinements', 'reconciliation_call_id'),
  'уточнението помни точното извикване');
SELECT ok(has_column('public', 'product_result_refinements', 'reconciliation_resolved_at'),
  'уточнението помни кога е разрешено');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname = 'product_fulfillment_jobs_reconciliation_shape'),
  'задачата има ограничение за формата на състоянието');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname = 'product_result_refinements_reconciliation_shape'),
  'уточнението има ограничение за формата на състоянието');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
    AND indexname = 'product_fulfillment_jobs_one_unresolved'),
  'едно неразрешено състояние на задача за платено право');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
    AND indexname = 'product_result_refinements_one_unresolved'),
  'едно неразрешено състояние на уточнение за платено право');

-- Трите служебни таблици: дневник, решения и окончателно изразходвани извиквания.
SELECT ok(has_table('public', 'product_reconciliation_events'),
  'дневникът на изясняванията съществува');
SELECT ok(has_table('public', 'product_reconciliation_resolutions'),
  'решенията на оператора се пазят');
SELECT ok(has_table('public', 'product_reconciliation_terminal_calls'),
  'окончателно изразходваните извиквания се пазят');
SELECT ok(
  (SELECT bool_and(relrowsecurity AND relforcerowsecurity) FROM pg_class
    WHERE oid IN ('public.product_reconciliation_events'::regclass,
                  'public.product_reconciliation_resolutions'::regclass,
                  'public.product_reconciliation_terminal_calls'::regclass)),
  'трите таблици са със защита на редовете, включително за собственика');
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public'
    AND tablename IN ('product_reconciliation_events','product_reconciliation_resolutions',
                      'product_reconciliation_terminal_calls')), 0,
  'нито една разрешаваща политика: таблиците не са част от Data API');
SELECT ok(
  NOT has_table_privilege('anon', 'public.product_reconciliation_events', 'SELECT')
  AND NOT has_table_privilege('authenticated', 'public.product_reconciliation_events', 'SELECT'),
  'браузърът не чете дневника');
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.product_reconciliation_resolutions', 'SELECT')
  AND NOT has_table_privilege('anon', 'public.product_reconciliation_terminal_calls', 'SELECT'),
  'браузърът не чете решенията и окончателните извиквания');
SELECT ok(
  has_table_privilege('service_role', 'public.product_reconciliation_events', 'INSERT'),
  'служебната роля вписва в дневника');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint c
    WHERE c.conrelid = 'public.product_reconciliation_resolutions'::regclass
      AND c.contype = 'u'),
  'решението е ЕДНО на предмет');

-- ---------------------------------------------------------------------------
-- 2) Одитът е ЗАТВОРЕН: без свободен текст.
-- ---------------------------------------------------------------------------
SELECT ok(
  NOT has_column('public', 'product_reconciliation_events', 'operator_note'),
  'дневникът НЕ пази свободен текст на оператор');
SELECT ok(
  NOT has_column('public', 'product_reconciliation_resolutions', 'operator_note'),
  'решението НЕ пази свободен текст на оператор');
SELECT ok(has_column('public', 'product_reconciliation_resolutions', 'reason_code'),
  'решението пази затворен код на причината');
SELECT ok(has_column('public', 'product_reconciliation_resolutions', 'ticket_ref'),
  'решението пази непрозрачен номер на случай');

-- Поведение на ограниченията: CHECK пада ПРЕДИ чуждия ключ, затова SQLSTATE 23514.
SELECT throws_ok($$
  INSERT INTO public.product_reconciliation_resolutions
    (kind, subject_id, entitlement_id, resolution, reason_code)
  VALUES ('job', gen_random_uuid(), gen_random_uuid(), 'release', 'provider_execution_proven')
$$, '23514', NULL, 'release без доказано НЕизпълнение се отказва от базата');
SELECT throws_ok($$
  INSERT INTO public.product_reconciliation_resolutions
    (kind, subject_id, entitlement_id, resolution, reason_code)
  VALUES ('job', gen_random_uuid(), gen_random_uuid(), 'consume', 'защото така реших')
$$, '23514', NULL, 'причина извън затворения списък се отказва');
SELECT throws_ok($$
  INSERT INTO public.product_reconciliation_resolutions
    (kind, subject_id, entitlement_id, resolution, reason_code, ticket_ref)
  VALUES ('job', gen_random_uuid(), gen_random_uuid(), 'consume',
          'provider_execution_proven', 'клиентът се обади в петък')
$$, '23514', NULL, 'номерът на случай не приема проза');
SELECT throws_ok($$
  INSERT INTO public.product_reconciliation_resolutions
    (kind, subject_id, entitlement_id, resolution, reason_code)
  VALUES ('нещо друго', gen_random_uuid(), gen_random_uuid(), 'consume',
          'provider_execution_proven')
$$, '23514', NULL, 'предметът е само задача или уточнение');
SELECT throws_ok($$
  INSERT INTO public.product_reconciliation_terminal_calls
    (kind, entitlement_id, subject_id, reason_code)
  VALUES ('job', gen_random_uuid(), gen_random_uuid(), 'provider_no_execution_proven')
$$, '23514', NULL, 'окончателно извикване не се вписва с доказано НЕизпълнение');

-- ---------------------------------------------------------------------------
-- 3) Спусъци: замразяване, забрана за нов предмет, забрана за ново извикване.
-- ---------------------------------------------------------------------------
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'product_job_reconciliation_freeze'),
  'неразрешената задача е замразена');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'product_refinement_reconciliation_freeze'),
  'неразрешеното уточнение е замразено');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'product_job_no_unresolved'),
  'нова задача се отказва при неразрешено или окончателно състояние');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'product_refinement_no_unresolved'),
  'ново уточнение се отказва при неразрешено, окончателно или сираче извикване');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'product_generation_call_not_consumed'),
  'ново извикване по окончателно изразходвана задача е невъзможно');
SELECT ok(EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'product_refinement_call_not_consumed'),
  'ново извикване по окончателно изразходвано уточнение е невъзможно');
-- Сирачето се чете от самите извиквания, не от полето за изясняване: така
-- работи и когато вписването на неизясненото състояние е пропаднало.
SELECT ok(
  (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'enforce_product_refinement_no_unresolved')
    LIKE '%product_result_refinement_calls%',
  'забраната чете трайното състояние на извикванията');
SELECT ok(
  (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'enforce_product_refinement_no_unresolved')
    LIKE '%product_reconciliation_resolutions%',
  'сирачето се отпушва само през решение на оператор');

-- ---------------------------------------------------------------------------
-- 4) Поведение на вписването: затворени откази, без измислени състояния.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.mark_product_job_reconciliation(NULL, gen_random_uuid(), 'provider_outcome_unknown'))->>'reason',
  'invalid_arguments', 'липсваща задача не се вписва');
SELECT is(
  (public.mark_product_job_reconciliation(gen_random_uuid(), NULL, 'provider_outcome_unknown'))->>'reason',
  'invalid_arguments', 'липсващ наем не се вписва');
SELECT is(
  (public.mark_product_job_reconciliation(gen_random_uuid(), gen_random_uuid(), 'provider_outcome_unknown'))->>'reason',
  'not_found', 'непозната задача не се вписва');
SELECT is(
  (public.mark_product_refinement_reconciliation(gen_random_uuid(), gen_random_uuid(), 'provider_outcome_unknown'))->>'reason',
  'not_found', 'непознато уточнение не се вписва');
SELECT is(
  (SELECT count(*)::int FROM public.product_reconciliation_events), 0,
  'отказаното вписване НЕ оставя следа в дневника');

-- ---------------------------------------------------------------------------
-- 5) Поведение на разрешаването: fail closed по всяка невалидна комбинация.
-- ---------------------------------------------------------------------------
SELECT is(
  (public.resolve_product_reconciliation('нещо', gen_random_uuid(), 'consume',
    'provider_execution_proven'))->>'reason',
  'invalid_kind', 'непознат предмет се отказва');
SELECT is(
  (public.resolve_product_reconciliation('job', gen_random_uuid(), 'refund',
    'provider_execution_proven'))->>'reason',
  'invalid_resolution', 'няма решение „възстанови“');
SELECT is(
  (public.resolve_product_reconciliation('job', gen_random_uuid(), 'consume',
    'защото клиентът настоя'))->>'reason',
  'invalid_reason_code', 'причината е затворен код, не проза');
SELECT is(
  (public.resolve_product_reconciliation('job', gen_random_uuid(), 'consume',
    NULL))->>'reason',
  'invalid_reason_code', 'липсваща причина се отказва');
SELECT is(
  (public.resolve_product_reconciliation('job', gen_random_uuid(), 'release',
    'provider_execution_proven'))->>'reason',
  'release_requires_proof', 'release без доказано НЕизпълнение се отказва');
SELECT is(
  (public.resolve_product_reconciliation('job', gen_random_uuid(), 'release',
    'provider_outcome_unprovable'))->>'reason',
  'release_requires_proof', 'недоказуем изход никога не връща задачата за нов опит');
SELECT is(
  (public.resolve_product_reconciliation('job', gen_random_uuid(), 'consume',
    'provider_no_execution_proven'))->>'reason',
  'invalid_reason_code', 'доказано НЕизпълнение не изразходва правото');
SELECT is(
  (public.resolve_product_reconciliation('job', gen_random_uuid(), 'consume',
    'provider_execution_proven', 'малък текст'))->>'reason',
  'invalid_ticket_ref', 'номерът на случай е непрозрачен идентификатор');
SELECT is(
  (public.resolve_product_reconciliation('job', gen_random_uuid(), 'consume',
    'provider_execution_proven', 'SUP-1024'))->>'reason',
  'not_unresolved', 'задача без неизяснено състояние не се разрешава');
SELECT is(
  (public.resolve_product_reconciliation('refinement', gen_random_uuid(), 'consume',
    'provider_execution_proven', 'SUP-1024'))->>'reason',
  'not_found', 'непознато уточнение не се разрешава');
SELECT is(
  (SELECT count(*)::int FROM public.product_reconciliation_resolutions), 0,
  'отказаното решение НЕ се записва');
SELECT is(
  (SELECT count(*)::int FROM public.product_reconciliation_terminal_calls), 0,
  'отказаното решение НЕ изразходва извикване');

-- Идемпотентност и конфликт се четат от записаното решение, не от аргументите.
SELECT ok(
  (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'resolve_product_reconciliation')
    LIKE '%resolution_conflict%',
  'различно решение по същия предмет пада');
SELECT ok(
  (SELECT pg_get_functiondef(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'resolve_product_reconciliation')
    LIKE '%release_not_provable%',
  'release при съществуващо трайно извикване пада');

-- ---------------------------------------------------------------------------
-- 6) Права: само служебната роля; четенето не пише.
-- ---------------------------------------------------------------------------
SELECT ok(
  has_function_privilege('service_role',
    'public.mark_product_job_reconciliation(uuid,uuid,text,text)', 'EXECUTE'),
  'служебната роля вписва неизяснена задача');
SELECT ok(
  NOT has_function_privilege('authenticated',
    'public.mark_product_job_reconciliation(uuid,uuid,text,text)', 'EXECUTE'),
  'потребител не вписва неизяснена задача');
SELECT ok(
  NOT has_function_privilege('anon',
    'public.mark_product_job_reconciliation(uuid,uuid,text,text)', 'EXECUTE'),
  'анонимен не вписва неизяснена задача');
SELECT ok(
  has_function_privilege('service_role',
    'public.mark_product_refinement_reconciliation(uuid,uuid,text,text)', 'EXECUTE'),
  'служебната роля вписва неизяснено уточнение');
SELECT ok(
  NOT has_function_privilege('authenticated',
    'public.mark_product_refinement_reconciliation(uuid,uuid,text,text)', 'EXECUTE'),
  'потребител не вписва неизяснено уточнение');
SELECT ok(
  has_function_privilege('service_role',
    'public.resolve_product_reconciliation(text,uuid,text,text,text)', 'EXECUTE'),
  'служебната роля разрешава състоянието');
SELECT ok(
  NOT has_function_privilege('authenticated',
    'public.resolve_product_reconciliation(text,uuid,text,text,text)', 'EXECUTE'),
  'потребител не разрешава състоянието');
SELECT ok(
  NOT has_function_privilege('anon',
    'public.resolve_product_reconciliation(text,uuid,text,text,text)', 'EXECUTE'),
  'анонимен не разрешава състоянието');
SELECT is(
  (SELECT provolatile FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'product_reconciliation_state'), 's',
  'product_reconciliation_state е STABLE, следователно не пише');
SELECT ok(
  has_function_privilege('service_role',
    'public.product_reconciliation_state(uuid,uuid)', 'EXECUTE'),
  'служебната роля чете състоянието');
SELECT is(
  (SELECT count(*)::int FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'resolve_product_reconciliation'), 1,
  'има точно ЕДНА функция за разрешаване: няма стар четириаргументен вариант');

SELECT * FROM finish();
ROLLBACK;
