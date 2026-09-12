-- 0026_product_acl_hardening
--
-- Затягане на правата върху продуктовата схема след ръчното прилагане на
-- коригираната базова миграция и 0018–0025 (12.09.2026, атомарно, без journal
-- записи, с запазени редове). Post-apply одитът намери наследени платформени
-- ACL grants върху новите таблици и функции. Този файл прави същото затягане
-- ТРАЙНО и възпроизводимо в източника.
--
-- Свойства:
--   * атомарен (една транзакция) и идемпотентен (само REVOKE/GRANT и CREATE OR
--     REPLACE FUNCTION);
--   * не създава, не изтрива и не променя нито един продуктов или клиентски ред;
--   * не пипа default privileges (ALTER DEFAULT PRIVILEGES) и не drop-ва обекти;
--   * anon няма никакви права; authenticated има само SELECT върху петте
--     таблици, които собственикът законно чете, и EXECUTE само върху
--     public.product_job_status(uuid);
--   * service_role получава пълния необходим достъп.
--
-- В края добавя read-only способност public.product_rollout_capability(), с
-- която средата доказва, че точно тази миграция е приложена. Функционалното
-- приемане на 0025 остава отделно: load_product_result_state.

BEGIN;

-- ---------------------------------------------------------------------------
-- 1) Таблици: първо всичко се отнема, после се дава само доказано нужното.
-- ---------------------------------------------------------------------------
REVOKE ALL PRIVILEGES ON TABLE public.product_checkout_intakes FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.product_entitlements FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.product_fulfillment_jobs FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.product_fulfillment_checkpoints FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.product_generation_calls FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.product_generation_artifacts FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.product_result_selections FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.product_result_selection_revisions FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.product_result_refinements FROM PUBLIC, anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.product_result_refinement_calls FROM PUBLIC, anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_checkout_intakes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_entitlements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_fulfillment_jobs TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_fulfillment_checkpoints TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_generation_calls TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_generation_artifacts TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_result_selections TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_result_selection_revisions TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_result_refinements TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.product_result_refinement_calls TO service_role;

-- Собственикът чете само собствените си редове; RLS остава единствената граница
-- за редовете, а тези права са минимумът, който я прави достъпна.
GRANT SELECT ON TABLE public.product_checkout_intakes TO authenticated;
GRANT SELECT ON TABLE public.product_entitlements TO authenticated;
GRANT SELECT ON TABLE public.product_result_selections TO authenticated;
GRANT SELECT ON TABLE public.product_result_selection_revisions TO authenticated;
GRANT SELECT ON TABLE public.product_result_refinements TO authenticated;

-- ---------------------------------------------------------------------------
-- 2) Функции: ограничен каноничен allowlist от имена, въведени от базовата
--    миграция и 0018–0025. Обхожда се всеки реален overload по точна identity
--    signature, така че нито една стара или нова версия не остава изпълнима от
--    браузъра.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_names text[] := ARRAY[
    'record_product_purchase',
    'begin_product_fulfillment',
    'complete_product_fulfillment',
    'fail_product_fulfillment',
    'claim_product_refinement',
    'complete_product_refinement',
    'fail_product_refinement',
    'product_checkpoint_immutable',
    'product_generation_immutable',
    'claim_product_job',
    'release_product_job_lease',
    'record_product_job_checkpoint',
    'fail_product_job',
    'product_job_status',
    'product_job_stage_sequence',
    'product_job_cursor_key',
    'product_job_cursor_advances',
    'bind_product_entitlement_policy',
    'reserve_product_generation_call',
    'complete_product_generation_call',
    'record_product_generation_artifact',
    'commit_product_generation_result',
    'load_product_generation_state',
    'finish_product_generation',
    'enforce_product_generation_timestamp_immutable',
    'enforce_product_selection_revision_immutable',
    'enforce_product_refinement_immutable',
    'enforce_product_refinement_call_immutable',
    'save_product_result_selection',
    'load_product_result_state',
    'begin_product_result_refinement',
    'complete_product_result_refinement',
    'fail_product_result_refinement',
    'reserve_product_result_refinement_call',
    'complete_product_result_refinement_call'
  ];
  v_signature text;
BEGIN
  FOR v_signature IN
    SELECT format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = ANY (v_names)
    ORDER BY 1
  LOOP
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM PUBLIC', v_signature);
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM anon', v_signature);
    EXECUTE format('REVOKE ALL PRIVILEGES ON FUNCTION %s FROM authenticated', v_signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_signature);
  END LOOP;
END $$;

-- Единственото изключение: собственикът има право да види статуса на своята
-- задача. anon остава без EXECUTE (отнет в цикъла по-горе).
GRANT EXECUTE ON FUNCTION public.product_job_status(uuid) TO authenticated;

-- ---------------------------------------------------------------------------
-- 3) Read-only способност за готовност: доказва точно тази миграция.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.product_rollout_capability()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER SET search_path = ''
AS $$
  SELECT jsonb_build_object('ok', true, 'migration', '0026_product_acl_hardening');
$$;

REVOKE ALL PRIVILEGES ON FUNCTION public.product_rollout_capability() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.product_rollout_capability() TO service_role;

COMMIT;
