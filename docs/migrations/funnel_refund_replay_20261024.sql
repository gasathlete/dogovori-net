CREATE TABLE public.billing_reversal_tombstones (
 stripe_session_id text PRIMARY KEY, environment text NOT NULL, payment_intent_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.billing_reversal_tombstones TO service_role;
ALTER TABLE public.billing_reversal_tombstones ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.block_reversed_topup_credit() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE r public.billing_reversal_tombstones%ROWTYPE;
BEGIN
 SELECT * INTO r FROM public.billing_reversal_tombstones WHERE stripe_session_id=NEW.stripe_session_id;
 IF FOUND THEN
 IF r.environment<>NEW.environment THEN RAISE EXCEPTION 'credit_binding_mismatch'; END IF;
 RAISE EXCEPTION 'payment_already_reversed';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.block_reversed_topup_credit() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER block_reversed_topup_credit BEFORE INSERT ON public.topup_purchases FOR EACH ROW EXECUTE FUNCTION public.block_reversed_topup_credit();
CREATE OR REPLACE FUNCTION public.reverse_topup_payment(p_session_id text,p_payment_intent text,p_environment text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.topup_purchases%ROWTYPE; r public.billing_reversal_tombstones%ROWTYPE;
BEGIN
 IF p_environment IS NULL OR p_environment NOT IN ('live','sandbox') OR p_payment_intent IS NULL OR p_session_id IS NULL THEN RAISE EXCEPTION 'invalid_reversal_proof'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id,0));
 SELECT * INTO r FROM public.billing_reversal_tombstones WHERE stripe_session_id=p_session_id;
 IF FOUND AND (r.environment<>p_environment OR r.payment_intent_id<>p_payment_intent) THEN RAISE EXCEPTION 'reversal_binding_mismatch'; END IF;
 SELECT * INTO t FROM public.topup_purchases WHERE stripe_session_id=p_session_id FOR UPDATE;
 IF FOUND AND (t.environment<>p_environment OR (t.payment_intent_id IS NOT NULL AND t.payment_intent_id<>p_payment_intent)) THEN RAISE EXCEPTION 'reversal_binding_mismatch'; END IF;
 INSERT INTO public.billing_reversal_tombstones(stripe_session_id,environment,payment_intent_id) VALUES(p_session_id,p_environment,p_payment_intent) ON CONFLICT(stripe_session_id) DO NOTHING;
 IF t.id IS NULL OR t.reversed_at IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'reversed',false); END IF;
 IF p_environment='sandbox' THEN UPDATE public.billing_test_balances SET ops_balance=ops_balance-t.ops_added WHERE user_id=t.user_id;
 ELSE UPDATE public.download_quota SET topup_ops_balance=coalesce(topup_ops_balance,0)-t.ops_added WHERE user_id=t.user_id; END IF;
 UPDATE public.topup_purchases SET reversed_at=now(),payment_intent_id=p_payment_intent WHERE id=t.id;
 RETURN jsonb_build_object('ok',true,'reversed',true);
END $$;
REVOKE ALL ON FUNCTION public.reverse_topup_payment(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_topup_payment(text,text,text) TO service_role;