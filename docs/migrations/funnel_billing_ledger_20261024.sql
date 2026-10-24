ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS last_event_created bigint NOT NULL DEFAULT 0;
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS last_event_id text;
ALTER TABLE public.topup_purchases ADD COLUMN IF NOT EXISTS reversed_at timestamptz;
ALTER TABLE public.topup_purchases ADD COLUMN IF NOT EXISTS payment_intent_id text;
ALTER TABLE public.download_quota ADD COLUMN IF NOT EXISTS subscription_managed boolean NOT NULL DEFAULT false;
ALTER TABLE public.download_quota ADD COLUMN IF NOT EXISTS subscription_managed_until timestamptz;
CREATE TABLE public.billing_test_balances(user_id uuid PRIMARY KEY, ops_balance integer NOT NULL DEFAULT 0);
GRANT ALL ON public.billing_test_balances TO service_role;
ALTER TABLE public.billing_test_balances ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sync_subscription_event(p_subscription jsonb,p_environment text,p_event_created bigint,p_event_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid := (p_subscription->>'user_id')::uuid; old public.subscriptions%ROWTYPE; end_at timestamptz; cap integer;
BEGIN
 IF p_environment IS NULL OR p_environment NOT IN ('live','sandbox') OR p_event_created IS NULL OR p_event_created<=0 OR p_event_id IS NULL OR u IS NULL THEN RAISE EXCEPTION 'invalid_subscription_proof'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text||p_environment,0));
 SELECT * INTO old FROM public.subscriptions WHERE stripe_subscription_id=p_subscription->>'stripe_subscription_id' FOR UPDATE;
 IF FOUND THEN
 IF old.user_id<>u OR old.environment<>p_environment THEN RAISE EXCEPTION 'subscription_binding_mismatch'; END IF;
 IF old.last_event_created>p_event_created OR old.last_event_id=p_event_id THEN RETURN jsonb_build_object('ok',true,'applied',false); END IF;
 -- Equal-second competing snapshots cannot safely undo a terminal state.
 IF old.last_event_created=p_event_created AND old.status='canceled' AND p_subscription->>'status'<>'canceled' THEN RETURN jsonb_build_object('ok',true,'applied',false); END IF;
 END IF;
 INSERT INTO public.subscriptions(user_id,stripe_subscription_id,stripe_customer_id,product_id,price_id,status,current_period_start,current_period_end,cancel_at_period_end,environment,last_event_created,last_event_id)
 VALUES(u,p_subscription->>'stripe_subscription_id',p_subscription->>'stripe_customer_id',p_subscription->>'product_id',p_subscription->>'price_id',p_subscription->>'status',(p_subscription->>'current_period_start')::timestamptz,(p_subscription->>'current_period_end')::timestamptz,coalesce((p_subscription->>'cancel_at_period_end')::boolean,false),p_environment,p_event_created,p_event_id)
 ON CONFLICT(stripe_subscription_id) DO UPDATE SET status=excluded.status,price_id=excluded.price_id,product_id=excluded.product_id,current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,last_event_created=excluded.last_event_created,last_event_id=excluded.last_event_id,updated_at=now();
 IF p_environment='live' THEN
 SELECT max(current_period_end),max(CASE WHEN price_id LIKE 'entrepreneur%' THEN 100 ELSE 50 END) INTO end_at,cap FROM public.subscriptions WHERE user_id=u AND environment='live' AND ((status IN ('active','trialing','past_due') AND (current_period_end IS NULL OR current_period_end>now())) OR (status='canceled' AND current_period_end>now()));
 IF cap IS NOT NULL THEN
 UPDATE public.download_quota SET plan='pro',pro_until=greatest(pro_until,end_at),plan_ops_cap=greatest(plan_ops_cap,cap),subscription_managed=true,subscription_managed_until=end_at WHERE user_id=u;
 ELSIF EXISTS(SELECT 1 FROM public.download_quota WHERE user_id=u AND subscription_managed AND pro_until<=subscription_managed_until) THEN
 UPDATE public.download_quota SET plan='free',pro_until=NULL,plan_ops_cap=NULL,subscription_managed=false,subscription_managed_until=NULL WHERE user_id=u;
 END IF;
 END IF;
 RETURN jsonb_build_object('ok',true,'applied',true);
END $$;
REVOKE ALL ON FUNCTION public.sync_subscription_event(jsonb,text,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_subscription_event(jsonb,text,bigint,text) TO service_role;

CREATE OR REPLACE FUNCTION public.credit_topup_ops(p_user_id uuid,p_price_id text,p_ops integer,p_amount numeric,p_session_id text,p_environment text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.topup_purchases%ROWTYPE;
BEGIN
 IF p_environment IS NULL OR p_environment NOT IN ('live','sandbox') OR p_user_id IS NULL OR p_session_id IS NULL OR p_ops IS NULL OR p_ops<1 OR p_ops>1000 OR p_amount IS NULL OR p_amount<=0 THEN RAISE EXCEPTION 'invalid_credit_proof'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id,0));
 SELECT * INTO old FROM public.topup_purchases WHERE stripe_session_id=p_session_id FOR UPDATE;
 IF FOUND THEN
 IF old.user_id<>p_user_id OR old.environment<>p_environment OR old.price_id<>p_price_id OR old.ops_added<>p_ops OR old.amount_eur IS DISTINCT FROM p_amount THEN RAISE EXCEPTION 'credit_binding_mismatch'; END IF;
 RETURN jsonb_build_object('ok',true,'credited',false); END IF;
 INSERT INTO public.topup_purchases(user_id,price_id,ops_added,amount_eur,stripe_session_id,environment) VALUES(p_user_id,p_price_id,p_ops,p_amount,p_session_id,p_environment);
 IF p_environment='sandbox' THEN
 INSERT INTO public.billing_test_balances(user_id,ops_balance) VALUES(p_user_id,p_ops) ON CONFLICT(user_id) DO UPDATE SET ops_balance=billing_test_balances.ops_balance+p_ops;
 ELSE
 INSERT INTO public.download_quota(user_id) VALUES(p_user_id) ON CONFLICT(user_id) DO NOTHING;
 UPDATE public.download_quota SET topup_ops_balance=coalesce(topup_ops_balance,0)+p_ops WHERE user_id=p_user_id;
 END IF;
 RETURN jsonb_build_object('ok',true,'credited',true);
END $$;
REVOKE ALL ON FUNCTION public.credit_topup_ops(uuid,text,integer,numeric,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.credit_topup_ops(uuid,text,integer,numeric,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.reverse_topup_payment(p_session_id text,p_payment_intent text,p_environment text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.topup_purchases%ROWTYPE;
BEGIN
 IF p_environment IS NULL OR p_environment NOT IN ('live','sandbox') OR p_payment_intent IS NULL OR p_session_id IS NULL THEN RAISE EXCEPTION 'invalid_reversal_proof'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(p_session_id,0));
 SELECT * INTO t FROM public.topup_purchases WHERE stripe_session_id=p_session_id FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'reversed',false); END IF;
 IF t.environment<>p_environment OR (t.payment_intent_id IS NOT NULL AND t.payment_intent_id<>p_payment_intent) THEN RAISE EXCEPTION 'reversal_binding_mismatch'; END IF;
 IF t.reversed_at IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'reversed',false); END IF;
 IF p_environment='sandbox' THEN UPDATE public.billing_test_balances SET ops_balance=ops_balance-t.ops_added WHERE user_id=t.user_id;
 ELSE UPDATE public.download_quota SET topup_ops_balance=coalesce(topup_ops_balance,0)-t.ops_added WHERE user_id=t.user_id; END IF;
 UPDATE public.topup_purchases SET reversed_at=now(),payment_intent_id=p_payment_intent WHERE id=t.id;
 RETURN jsonb_build_object('ok',true,'reversed',true);
END $$;
REVOKE ALL ON FUNCTION public.reverse_topup_payment(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reverse_topup_payment(text,text,text) TO service_role;