-- Preserve historical wave allowances; new free accounts use the canonical
-- consent-independent monthly cap before the one-time consent bonus pool.
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef(oid) INTO definition FROM pg_proc WHERE proname='quota_wave_reserve' AND pronamespace='public'::regnamespace;
 IF definition NOT LIKE '%_cap := COALESCE(_quota.plan_ops_cap, CASE WHEN _is_pro THEN 100 ELSE 10 END);%' THEN RAISE EXCEPTION 'unexpected wave cap'; END IF;
 definition := replace(definition,'_cap := COALESCE(_quota.plan_ops_cap, CASE WHEN _is_pro THEN 100 ELSE 10 END);','_cap := CASE WHEN _is_pro OR _quota.marketing_bonus_legacy THEN COALESCE(_quota.plan_ops_cap, CASE WHEN _is_pro THEN 100 ELSE 10 END) ELSE public.free_ops_cap(p_user_id) END;');
 EXECUTE definition;
 SELECT pg_get_functiondef(oid) INTO definition FROM pg_proc WHERE proname='charge_corrections_wave' AND pronamespace='public'::regnamespace;
 IF definition NOT LIKE '%v_cap := COALESCE(v_quota.plan_ops_cap, CASE WHEN v_is_pro THEN 100 ELSE 10 END);%' THEN RAISE EXCEPTION 'unexpected correction cap'; END IF;
 definition := replace(definition,'v_cap := COALESCE(v_quota.plan_ops_cap, CASE WHEN v_is_pro THEN 100 ELSE 10 END);','v_cap := CASE WHEN v_is_pro OR v_quota.marketing_bonus_legacy THEN COALESCE(v_quota.plan_ops_cap, CASE WHEN v_is_pro THEN 100 ELSE 10 END) ELSE public.free_ops_cap(p_user_id) END;');
 EXECUTE definition;
END $migration$;