-- Stage 2B1A — коригираща миграция: готовият резултат се сверява по схема v2.
--
-- Защо съществува отделно: базовата миграция
-- `supabase/migrations/20260910090000_product_checkout_entitlements.sql`
-- е защитена и НЕ се променя. Тя проверява обвързването по стария плосък път
-- `result ->> 'source_hash'`, който в схема v2 винаги е NULL. Тази миграция
-- заменя ограничението и двете функции, които записват резултат, така че
-- действащата схема да изисква ТОЧНО версия 2, точния продукт и ЦЯЛОТО вложено
-- обвързване `result -> 'source'`.
--
-- РЕД НА ПРИЛАГАНЕ: базовата миграция първа, тази — веднага втора, в едно и
-- също одобрено действие. Виж docs/migrations/STAGE2A_ROLLOUT_ORDER.md.
--
-- Миграцията е само схема: не пипа, не попълва и не изтрива продуктови или
-- клиентски редове. При несъответствие се отказва (fail closed).

BEGIN;

ALTER TABLE public.product_entitlements
  DROP CONSTRAINT IF EXISTS product_entitlements_ready_ck;

ALTER TABLE public.product_entitlements
  ADD CONSTRAINT product_entitlements_ready_ck CHECK (
    status <> 'ready'
    OR (
      result IS NOT NULL
      AND jsonb_typeof(result) = 'object'
      AND result_schema_version = 2
      AND result -> 'schema_version' = '2'::jsonb
      AND result ->> 'product_id' = product_id
      AND jsonb_typeof(result -> 'source') = 'object'
      AND result -> 'source' ->> 'document_id' = source_document_id::text
      AND lower(result -> 'source' ->> 'source_hash') = lower(source_hash)
      AND result -> 'source' ->> 'source_kind' = source_kind
      AND result -> 'source' -> 'char_count' = to_jsonb(source_char_count)
      AND result -> 'source' ->> 'char_unit' = source_char_unit
      AND (result -> 'source' ->> 'source_updated_at')::timestamptz = source_updated_at
      AND (
        CASE
          WHEN source_page_count IS NULL
            THEN result -> 'source' -> 'page_count' = 'null'::jsonb
          ELSE result -> 'source' -> 'page_count' = to_jsonb(source_page_count)
        END
      )
      AND fulfilled_at IS NOT NULL
    )
  );

CREATE OR REPLACE FUNCTION public.complete_product_fulfillment(
  p_entitlement_id uuid,
  p_user_id uuid,
  p_product_id text,
  p_source_hash text,
  p_processing_token uuid,
  p_result jsonb,
  p_result_schema_version integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.product_entitlements
     SET status = 'ready',
         result = p_result,
         result_schema_version = p_result_schema_version,
         fulfilled_at = now(),
         processing_token = NULL,
         last_error_code = NULL,
         updated_at = now()
   WHERE id = p_entitlement_id
     AND user_id = p_user_id
     AND product_id = p_product_id
     AND source_hash = p_source_hash
     AND status = 'processing'
     AND processing_token = p_processing_token
     AND p_result IS NOT NULL
     AND jsonb_typeof(p_result) = 'object'
     AND p_result_schema_version = 2
     AND p_result -> 'schema_version' = '2'::jsonb
     AND p_result ->> 'product_id' = p_product_id
     AND jsonb_typeof(p_result -> 'source') = 'object'
     AND p_result -> 'source' ->> 'document_id' = source_document_id::text
     AND lower(p_result -> 'source' ->> 'source_hash') = lower(source_hash)
     AND p_result -> 'source' ->> 'source_kind' = source_kind
     AND p_result -> 'source' -> 'char_count' = to_jsonb(source_char_count)
     AND p_result -> 'source' ->> 'char_unit' = source_char_unit
     AND (p_result -> 'source' ->> 'source_updated_at')::timestamptz = source_updated_at
     AND (
       CASE
         WHEN source_page_count IS NULL
           THEN p_result -> 'source' -> 'page_count' = 'null'::jsonb
         ELSE p_result -> 'source' -> 'page_count' = to_jsonb(source_page_count)
       END
     );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_updated = 1);
END $$;

CREATE OR REPLACE FUNCTION public.complete_product_refinement(
  p_entitlement_id uuid,
  p_user_id uuid,
  p_refinement_token uuid,
  p_result jsonb,
  p_result_schema_version integer
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.product_entitlements
     SET result = p_result,
         result_schema_version = COALESCE(p_result_schema_version, result_schema_version),
         refinements_used = refinements_used + 1,
         refinement_state = 'idle',
         refinement_token = NULL,
         refinement_error_code = NULL,
         fulfilled_at = now(),
         updated_at = now()
   WHERE id = p_entitlement_id
     AND user_id = p_user_id
     AND status = 'ready'
     AND refinement_state = 'processing'
     AND refinement_token = p_refinement_token
     AND refinements_used < refinements_included
     AND p_result IS NOT NULL
     AND jsonb_typeof(p_result) = 'object'
     AND COALESCE(p_result_schema_version, result_schema_version) = 2
     AND p_result -> 'schema_version' = '2'::jsonb
     AND p_result ->> 'product_id' = product_id
     AND jsonb_typeof(p_result -> 'source') = 'object'
     AND p_result -> 'source' ->> 'document_id' = source_document_id::text
     AND lower(p_result -> 'source' ->> 'source_hash') = lower(source_hash)
     AND p_result -> 'source' ->> 'source_kind' = source_kind
     AND p_result -> 'source' -> 'char_count' = to_jsonb(source_char_count)
     AND p_result -> 'source' ->> 'char_unit' = source_char_unit
     AND (p_result -> 'source' ->> 'source_updated_at')::timestamptz = source_updated_at
     AND (
       CASE
         WHEN source_page_count IS NULL
           THEN p_result -> 'source' -> 'page_count' = 'null'::jsonb
         ELSE p_result -> 'source' -> 'page_count' = to_jsonb(source_page_count)
       END
     );
  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', v_updated = 1);
END $$;

REVOKE ALL ON FUNCTION public.complete_product_fulfillment(uuid,uuid,text,text,uuid,jsonb,integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.complete_product_refinement(uuid,uuid,uuid,jsonb,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.complete_product_fulfillment(uuid,uuid,text,text,uuid,jsonb,integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.complete_product_refinement(uuid,uuid,uuid,jsonb,integer) TO service_role;

COMMIT;
