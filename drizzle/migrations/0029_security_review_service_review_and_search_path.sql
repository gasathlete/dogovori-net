-- Article legal-review events are service-written only; caller-selected reviewer is not authentication.
REVOKE EXECUTE ON FUNCTION public.record_article_review(uuid,uuid,text,text,boolean,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_article_review(uuid,uuid,text,text,boolean,text) TO service_role;
ALTER FUNCTION public.owned_review_grant_ttl_seconds() SET search_path = public, pg_temp;
ALTER FUNCTION public.artifact_metadata_retention_seconds() SET search_path = public, pg_temp;
ALTER FUNCTION public.quota_result_is_content_bearing(jsonb) SET search_path = public, pg_temp;
ALTER FUNCTION public.exact_response_retention_seconds() SET search_path = public, pg_temp;
ALTER FUNCTION public.article_evidence_append_only() SET search_path = public, pg_temp;
-- Trigger invocation does not require client EXECUTE; direct RPC is not supported.
REVOKE EXECUTE ON FUNCTION public.enforce_product_generation_call_not_consumed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_product_job_no_unresolved() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_product_job_reconciliation_freeze() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_product_refinement_call_not_consumed() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_product_refinement_no_unresolved() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enforce_product_refinement_reconciliation_freeze() FROM PUBLIC, anon, authenticated;