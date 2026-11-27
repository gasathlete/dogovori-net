-- A receipt is successful only when the locked grant marker actually exists.
CREATE OR REPLACE FUNCTION public.claim_marketing_bonus(_accept boolean,_event_id uuid,_version text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE q public.download_quota%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='28000'; END IF;
 IF _accept IS DISTINCT FROM true OR _event_id IS NULL OR _version IS DISTINCT FROM '2026-10-21' THEN
 RAISE EXCEPTION 'explicit_current_consent_required' USING ERRCODE='22023'; END IF;
 SELECT * INTO q FROM public.download_quota WHERE user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'quota_unavailable'; END IF;
 IF q.marketing_bonus_legacy OR q.marketing_bonus_claimed_at IS NOT NULL THEN
 RETURN jsonb_build_object('ok',true,'granted',false,'already_claimed',true); END IF;
 INSERT INTO public.user_consents(user_id,consent_type,document_version,granted,consent_event_id,metadata)
 VALUES(auth.uid(),'marketing',_version,true,_event_id,jsonb_build_object('source','insufficient_credit_bonus'))
 ON CONFLICT(user_id,consent_type,consent_event_id) DO NOTHING;
 SELECT * INTO q FROM public.download_quota WHERE user_id=auth.uid();
 IF q.marketing_bonus_claimed_at IS NULL THEN
 RAISE EXCEPTION 'bonus_not_granted' USING ERRCODE='22023'; END IF;
 RETURN jsonb_build_object('ok',true,'granted',true,'initial_cap',5,'regular_cap',2,'bonus_ops',5-2);
END $$;
REVOKE ALL ON FUNCTION public.claim_marketing_bonus(boolean,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_marketing_bonus(boolean,uuid,text) TO authenticated,service_role;

-- Exhausted paid assistant quota uses the same pool with exact reversible allocation.
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef(oid) INTO definition FROM pg_proc WHERE proname='assistant_turn_reserve' AND pronamespace='public'::regnamespace;
 IF definition NOT LIKE '%IF _eff_pro_used >= _cap THEN%' THEN RAISE EXCEPTION 'unexpected assistant paid definition'; END IF;
 definition := replace(definition,'IF _eff_pro_used >= _cap THEN', 'IF _eff_pro_used >= _cap AND COALESCE(_q.topup_ops_balance,0)<=0 THEN');
 definition := replace(definition,'pro_monthly_used = _eff_pro_used + 1,', 'topup_ops_balance = CASE WHEN _eff_pro_used >= _cap THEN COALESCE(topup_ops_balance,0)-1 ELSE topup_ops_balance END, pro_monthly_used = _eff_pro_used + CASE WHEN _eff_pro_used >= _cap THEN 0 ELSE 1 END,');
 definition := replace(definition,'''source'', ''pro'', ''pro_monthly_used'', 1,', '''source'', ''pro'', ''topup_ops_balance'', CASE WHEN _eff_pro_used >= _cap THEN 1 ELSE 0 END, ''pro_monthly_used'', CASE WHEN _eff_pro_used >= _cap THEN 0 ELSE 1 END,');
 EXECUTE definition;
END $migration$;