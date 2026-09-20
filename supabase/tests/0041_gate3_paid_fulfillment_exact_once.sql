-- =============================================================================
-- pgTAP фикстури за 0041 (АВТОРИРАНИ, НО НЕ ИЗПЪЛНЕНИ — 0041 не е приложена).
-- Доказват структурата и правата на трайното състояние „за изясняване“ по
-- платения път: точно едно неразрешено състояние на платено право, забрана за
-- тихо пренаписване, четене без запис и разрешаване само от служебната роля.
-- =============================================================================
BEGIN;
SELECT plan(34);

-- 1. Колони за изясняване върху двете платени таблици.
SELECT ok(
  has_column('public', 'product_fulfillment_jobs', 'reconciliation_required_at'),
  'задачата носи начало на неизясненото състояние');
SELECT ok(
  has_column('public', 'product_fulfillment_jobs', 'reconciliation_code'),
  'задачата носи затворен код за изясняване');
SELECT ok(
  has_column('public', 'product_fulfillment_jobs', 'reconciliation_call_id'),
  'задачата помни точното извикване');
SELECT ok(
  has_column('public', 'product_fulfillment_jobs', 'reconciliation_resolved_at'),
  'задачата помни кога е разрешено');
SELECT ok(
  has_column('public', 'product_result_refinements', 'reconciliation_required_at'),
  'уточнението носи начало на неизясненото състояние');
SELECT ok(
  has_column('public', 'product_result_refinements', 'reconciliation_code'),
  'уточнението носи затворен код за изясняване');
SELECT ok(
  has_column('public', 'product_result_refinements', 'reconciliation_call_id'),
  'уточнението помни точното извикване');
SELECT ok(
  has_column('public', 'product_result_refinements', 'reconciliation_resolved_at'),
  'уточнението помни кога е разрешено');

-- 2. Формата на състоянието е ограничена от базата, не от кода.
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname = 'product_fulfillment_jobs_reconciliation_shape'),
  'задачата има ограничение за формата на състоянието');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_constraint
    WHERE conname = 'product_result_refinements_reconciliation_shape'),
  'уточнението има ограничение за формата на състоянието');

-- 3. Точно ЕДНО неразрешено състояние на платено право.
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
    AND indexname = 'product_fulfillment_jobs_one_unresolved'),
  'едно неразрешено състояние на задача за платено право');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public'
    AND indexname = 'product_result_refinements_one_unresolved'),
  'едно неразрешено състояние на уточнение за платено право');
SELECT ok(
  (SELECT indexdef FROM pg_indexes WHERE schemaname = 'public'
    AND indexname = 'product_fulfillment_jobs_one_unresolved')
    LIKE '%reconciliation_resolved_at IS NULL%',
  'индексът важи само за НЕразрешените редове');
SELECT ok(
  (SELECT indexdef FROM pg_indexes WHERE schemaname = 'public'
    AND indexname = 'product_result_refinements_one_unresolved')
    LIKE '%reconciliation_resolved_at IS NULL%',
  'индексът на уточнението важи само за НЕразрешените редове');

-- 4. Дневникът на изясняванията е служебен и защитен.
SELECT ok(has_table('public', 'product_reconciliation_events'),
  'дневникът на изясняванията съществува');
SELECT ok(
  (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.product_reconciliation_events'::regclass),
  'дневникът е с включена защита на редовете');
SELECT ok(
  (SELECT relforcerowsecurity FROM pg_class
    WHERE oid = 'public.product_reconciliation_events'::regclass),
  'защитата важи и за собственика на таблицата');
SELECT is(
  (SELECT count(*)::int FROM pg_policies WHERE schemaname = 'public'
    AND tablename = 'product_reconciliation_events'), 0,
  'дневникът няма нито една разрешаваща политика');
SELECT ok(
  NOT has_table_privilege('anon', 'public.product_reconciliation_events', 'SELECT'),
  'anon не чете дневника');
SELECT ok(
  NOT has_table_privilege('authenticated', 'public.product_reconciliation_events', 'SELECT'),
  'authenticated не чете дневника');
SELECT ok(
  has_table_privilege('service_role', 'public.product_reconciliation_events', 'INSERT'),
  'служебната роля вписва в дневника');

-- 5. Спусъците замразяват неразрешен ред и спират нов ред до него.
SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'product_job_reconciliation_freeze'),
  'неразрешената задача е замразена');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'product_refinement_reconciliation_freeze'),
  'неразрешеното уточнение е замразено');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'product_job_no_unresolved'),
  'нова задача се отказва при неразрешено състояние');
SELECT ok(
  EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'product_refinement_no_unresolved'),
  'ново уточнение се отказва при неразрешено състояние');

-- 6. Правата върху трите нови операции.
SELECT ok(
  has_function_privilege('service_role',
    'public.mark_product_job_reconciliation(uuid,text,text,text)', 'EXECUTE'),
  'служебната роля вписва неизяснена задача');
SELECT ok(
  NOT has_function_privilege('authenticated',
    'public.mark_product_job_reconciliation(uuid,text,text,text)', 'EXECUTE'),
  'потребител не вписва неизяснена задача');
SELECT ok(
  NOT has_function_privilege('anon',
    'public.mark_product_job_reconciliation(uuid,text,text,text)', 'EXECUTE'),
  'анонимен не вписва неизяснена задача');
SELECT ok(
  has_function_privilege('service_role',
    'public.mark_product_refinement_reconciliation(uuid,text,text,text)', 'EXECUTE'),
  'служебната роля вписва неизяснено уточнение');
SELECT ok(
  NOT has_function_privilege('authenticated',
    'public.mark_product_refinement_reconciliation(uuid,text,text,text)', 'EXECUTE'),
  'потребител не вписва неизяснено уточнение');
SELECT ok(
  has_function_privilege('service_role',
    'public.resolve_product_reconciliation(text,uuid,text,text)', 'EXECUTE'),
  'служебната роля разрешава състоянието');
SELECT ok(
  NOT has_function_privilege('authenticated',
    'public.resolve_product_reconciliation(text,uuid,text,text)', 'EXECUTE'),
  'потребител не разрешава състоянието');
SELECT ok(
  NOT has_function_privilege('anon',
    'public.resolve_product_reconciliation(text,uuid,text,text)', 'EXECUTE'),
  'анонимен не разрешава състоянието');

-- 7. Четенето на състоянието НЕ може да пише.
SELECT is(
  (SELECT provolatile FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'product_reconciliation_state'), 's',
  'product_reconciliation_state е STABLE, следователно не пише');
SELECT ok(
  has_function_privilege('service_role',
    'public.product_reconciliation_state(uuid,uuid)', 'EXECUTE'),
  'служебната роля чете състоянието');

SELECT * FROM finish();
ROLLBACK;
