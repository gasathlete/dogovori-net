-- Production defaults also grant new functions directly to anon/authenticated.
-- Revoking PUBLIC alone does not remove those explicit grants. These ledger
-- helpers are called by server handlers using service_role; browser requests
-- must continue through authenticated, validated handlers. No rows are changed.
BEGIN;

REVOKE ALL ON FUNCTION public.anon_delivery_cancel(uuid,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anon_delivery_cancel(uuid,text,text,text,text) TO service_role;

REVOKE ALL ON FUNCTION public.anon_delivery_commit(uuid,text,text,jsonb,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anon_delivery_commit(uuid,text,text,jsonb,text) TO service_role;

REVOKE ALL ON FUNCTION public.anon_delivery_lookup(uuid,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anon_delivery_lookup(uuid,text,text,text) TO service_role;

REVOKE ALL ON FUNCTION public.anon_delivery_reserve(uuid,text,text,text,integer,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anon_delivery_reserve(uuid,text,text,text,integer,integer,integer) TO service_role;

REVOKE ALL ON FUNCTION public.anon_delivery_state(text,text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.anon_delivery_state(text,text,integer,integer) TO service_role;

REVOKE ALL ON FUNCTION public.cancel_corrections_wave(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_corrections_wave(uuid,uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.charge_corrections_wave(uuid,uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.charge_corrections_wave(uuid,uuid,integer) TO service_role;

REVOKE ALL ON FUNCTION public.consume_quota_for(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_quota_for(uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.corrections_wave_bind(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corrections_wave_bind(uuid,uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.corrections_wave_set_result(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.corrections_wave_set_result(uuid,uuid,jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.quota_cancel(uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quota_cancel(uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.quota_commit(uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quota_commit(uuid,jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.quota_lookup(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quota_lookup(uuid) TO service_role;

REVOKE ALL ON FUNCTION public.quota_operation_lookup(uuid,uuid,text,text,uuid,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quota_operation_lookup(uuid,uuid,text,text,uuid,text,uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.quota_reconcile_stale(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quota_reconcile_stale(integer) TO service_role;

REVOKE ALL ON FUNCTION public.quota_reserve(uuid,uuid,text,text,uuid,text,uuid,text,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quota_reserve(uuid,uuid,text,text,uuid,text,uuid,text,integer) TO service_role;

REVOKE ALL ON FUNCTION public.quota_reserve_no_charge(uuid,uuid,text,text,text,text,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quota_reserve_no_charge(uuid,uuid,text,text,text,text,uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.quota_result_is_content_bearing(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quota_result_is_content_bearing(jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.quota_wave_cancel(uuid,uuid,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quota_wave_cancel(uuid,uuid,text) TO service_role;

REVOKE ALL ON FUNCTION public.quota_wave_commit(uuid,uuid,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quota_wave_commit(uuid,uuid,jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.quota_wave_reconcile_stale(integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quota_wave_reconcile_stale(integer) TO service_role;

REVOKE ALL ON FUNCTION public.quota_wave_reserve(uuid,uuid,text,text,text,text,uuid,text,integer,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.quota_wave_reserve(uuid,uuid,text,text,text,text,uuid,text,integer,integer) TO service_role;

REVOKE ALL ON FUNCTION public.review_grant_nonce_consume(uuid,text,text,text,text,text,timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_grant_nonce_consume(uuid,text,text,text,text,text,timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.review_operation_cancel(uuid,text,text,boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_operation_cancel(uuid,text,text,boolean) TO service_role;

REVOKE ALL ON FUNCTION public.review_operation_commit(uuid,text,jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_operation_commit(uuid,text,jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.review_operation_lookup(uuid,text,text,text,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_operation_lookup(uuid,text,text,text,text,text) TO service_role;

REVOKE ALL ON FUNCTION public.review_operation_reserve(uuid,text,text,text,text,text,timestamp with time zone,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.review_operation_reserve(uuid,text,text,text,text,text,timestamp with time zone,integer) TO service_role;

REVOKE ALL ON FUNCTION public.storage_artifact_bind(uuid,uuid,text,text,text,text,timestamp with time zone) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storage_artifact_bind(uuid,uuid,text,text,text,text,timestamp with time zone) TO service_role;

REVOKE ALL ON FUNCTION public.storage_artifact_lookup(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.storage_artifact_lookup(uuid) TO service_role;

REVOKE ALL ON TABLE public.quota_operations FROM anon, authenticated;
GRANT ALL ON TABLE public.quota_operations TO service_role;

COMMIT;
