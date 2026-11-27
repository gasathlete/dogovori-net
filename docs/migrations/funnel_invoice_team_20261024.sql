CREATE TABLE public.subscription_invoice_ledger (
 invoice_id text PRIMARY KEY, stripe_subscription_id text NOT NULL, user_id uuid NOT NULL, team_id uuid,
 stripe_customer_id text NOT NULL, environment text NOT NULL, currency text NOT NULL,
 amount_paid bigint NOT NULL, amount_refunded bigint NOT NULL DEFAULT 0,
 period_start timestamptz NOT NULL, period_end timestamptz NOT NULL, last_event_id text NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.subscription_invoice_ledger TO service_role;
ALTER TABLE public.subscription_invoice_ledger ENABLE ROW LEVEL SECURITY;
CREATE INDEX subscription_invoice_binding_idx ON public.subscription_invoice_ledger(stripe_subscription_id,environment);
ALTER TABLE public.subscriptions ADD COLUMN IF NOT EXISTS provider_status text;
CREATE TABLE public.team_subscription_ledger (
 stripe_subscription_id text PRIMARY KEY, team_id uuid NOT NULL, user_id uuid NOT NULL, environment text NOT NULL,
 stripe_customer_id text NOT NULL, status text NOT NULL, seat_count integer NOT NULL,
 current_period_start timestamptz, current_period_end timestamptz,
 last_event_created bigint NOT NULL, last_event_id text NOT NULL, provider_status text
);
GRANT ALL ON public.team_subscription_ledger TO service_role;
ALTER TABLE public.team_subscription_ledger ENABLE ROW LEVEL SECURITY;
CREATE OR REPLACE FUNCTION public.sync_subscription_event(p_subscription jsonb,p_environment text,p_event_created bigint,p_event_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid := (p_subscription->>'user_id')::uuid; old public.subscriptions%ROWTYPE; end_at timestamptz; cap integer;
BEGIN
 IF p_environment IS NULL OR p_environment NOT IN ('live','sandbox') OR p_event_created IS NULL OR p_event_created<=0 OR p_event_id IS NULL OR u IS NULL THEN RAISE EXCEPTION 'invalid_subscription_proof'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(u::text||p_environment,0));
 SELECT * INTO old FROM public.subscriptions WHERE stripe_subscription_id=p_subscription->>'stripe_subscription_id' FOR UPDATE;
 IF FOUND THEN
 IF old.user_id<>u OR old.environment<>p_environment OR old.stripe_customer_id<>p_subscription->>'stripe_customer_id' THEN RAISE EXCEPTION 'subscription_binding_mismatch'; END IF;
 IF NOT coalesce((p_subscription->>'invoice_refresh')::boolean,false) AND (old.last_event_created>p_event_created OR old.last_event_id=p_event_id) THEN RETURN jsonb_build_object('ok',true,'applied',false); END IF;
 -- Equal-second competing snapshots cannot safely undo a terminal state.
 IF NOT coalesce((p_subscription->>'invoice_refresh')::boolean,false) AND old.last_event_created=p_event_created AND old.status='canceled' AND p_subscription->>'status'<>'canceled' THEN RETURN jsonb_build_object('ok',true,'applied',false); END IF;
 END IF;
 INSERT INTO public.subscriptions(user_id,stripe_subscription_id,stripe_customer_id,product_id,price_id,status,provider_status,current_period_start,current_period_end,cancel_at_period_end,environment,last_event_created,last_event_id)
 VALUES(u,p_subscription->>'stripe_subscription_id',p_subscription->>'stripe_customer_id',p_subscription->>'product_id',p_subscription->>'price_id',p_subscription->>'status',p_subscription->>'status',(p_subscription->>'current_period_start')::timestamptz,(p_subscription->>'current_period_end')::timestamptz,coalesce((p_subscription->>'cancel_at_period_end')::boolean,false),p_environment,p_event_created,p_event_id)
 ON CONFLICT(stripe_subscription_id) DO UPDATE SET status=excluded.status,provider_status=excluded.provider_status,price_id=excluded.price_id,product_id=excluded.product_id,current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,cancel_at_period_end=excluded.cancel_at_period_end,last_event_created=excluded.last_event_created,last_event_id=excluded.last_event_id,updated_at=now();
 IF EXISTS(SELECT 1 FROM public.subscription_invoice_ledger i WHERE i.environment=p_environment AND i.stripe_subscription_id=p_subscription->>'stripe_subscription_id' AND i.amount_refunded=i.amount_paid AND i.period_start<=(p_subscription->>'current_period_start')::timestamptz AND i.period_end>=(p_subscription->>'current_period_end')::timestamptz AND NOT EXISTS(SELECT 1 FROM public.subscription_invoice_ledger paid WHERE paid.environment=i.environment AND paid.stripe_subscription_id=i.stripe_subscription_id AND paid.amount_refunded<paid.amount_paid AND paid.period_start<=i.period_start AND paid.period_end>=i.period_end)) THEN
 UPDATE public.subscriptions SET status='refunded' WHERE stripe_subscription_id=p_subscription->>'stripe_subscription_id'; END IF;
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


CREATE OR REPLACE FUNCTION public.sync_team_subscription_event(p_subscription jsonb,p_environment text,p_event_created bigint,p_event_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE u uuid := (p_subscription->>'user_id')::uuid; tid uuid := (p_subscription->>'team_id')::uuid;
 old public.team_subscription_ledger%ROWTYPE; t public.teams%ROWTYPE; chosen public.team_subscription_ledger%ROWTYPE;
BEGIN
 IF p_environment IS NULL OR p_environment NOT IN ('live','sandbox') OR u IS NULL OR tid IS NULL OR p_event_created IS NULL OR p_event_created<=0 OR nullif(p_event_id,'') IS NULL OR (p_subscription->>'seat_count')::integer NOT BETWEEN 3 AND 100 THEN RAISE EXCEPTION 'invalid_team_proof'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(tid::text||p_environment,0));
 SELECT * INTO t FROM public.teams WHERE id=tid FOR UPDATE;
 IF NOT FOUND OR t.owner_id<>u OR t.environment<>p_environment THEN RAISE EXCEPTION 'team_binding_mismatch'; END IF;
 SELECT * INTO old FROM public.team_subscription_ledger WHERE stripe_subscription_id=p_subscription->>'stripe_subscription_id' FOR UPDATE;
 IF FOUND THEN
 IF old.user_id<>u OR old.team_id<>tid OR old.environment<>p_environment OR old.stripe_customer_id<>p_subscription->>'stripe_customer_id' THEN RAISE EXCEPTION 'team_subscription_binding_mismatch'; END IF;
 IF NOT coalesce((p_subscription->>'invoice_refresh')::boolean,false) AND (old.last_event_created>p_event_created OR old.last_event_id=p_event_id OR (old.last_event_created=p_event_created AND old.status='canceled' AND p_subscription->>'status'<>'canceled')) THEN RETURN jsonb_build_object('ok',true,'applied',false); END IF;
 ELSIF t.stripe_subscription_id=p_subscription->>'stripe_subscription_id' AND t.stripe_customer_id IS NOT NULL AND t.stripe_customer_id<>p_subscription->>'stripe_customer_id' THEN RAISE EXCEPTION 'team_customer_binding_mismatch'; END IF;
 INSERT INTO public.team_subscription_ledger VALUES(p_subscription->>'stripe_subscription_id',tid,u,p_environment,p_subscription->>'stripe_customer_id',p_subscription->>'status',(p_subscription->>'seat_count')::integer,(p_subscription->>'current_period_start')::timestamptz,(p_subscription->>'current_period_end')::timestamptz,p_event_created,p_event_id,p_subscription->>'status')
 ON CONFLICT(stripe_subscription_id) DO UPDATE SET status=excluded.status,provider_status=excluded.provider_status,seat_count=excluded.seat_count,current_period_start=excluded.current_period_start,current_period_end=excluded.current_period_end,last_event_created=excluded.last_event_created,last_event_id=excluded.last_event_id;
 UPDATE public.team_subscription_ledger s SET status='refunded' WHERE s.team_id=tid AND s.environment=p_environment AND EXISTS(
 SELECT 1 FROM public.subscription_invoice_ledger i WHERE i.stripe_subscription_id=s.stripe_subscription_id AND i.environment=s.environment AND i.amount_refunded=i.amount_paid AND i.period_start<=s.current_period_start AND i.period_end>=s.current_period_end AND NOT EXISTS(SELECT 1 FROM public.subscription_invoice_ledger paid WHERE paid.stripe_subscription_id=i.stripe_subscription_id AND paid.environment=i.environment AND paid.amount_refunded<paid.amount_paid AND paid.period_start<=i.period_start AND paid.period_end>=i.period_end));
 SELECT * INTO chosen FROM public.team_subscription_ledger WHERE team_id=tid AND environment=p_environment AND ((status IN('active','trialing','past_due') AND (current_period_end IS NULL OR current_period_end>now())) OR (status='canceled' AND current_period_end>now())) ORDER BY seat_count DESC,current_period_end DESC NULLS FIRST LIMIT 1;
 IF FOUND THEN
 UPDATE public.teams SET status='active',stripe_subscription_id=chosen.stripe_subscription_id,stripe_customer_id=chosen.stripe_customer_id,seat_count=chosen.seat_count,current_period_start=chosen.current_period_start,current_period_end=chosen.current_period_end,updated_at=now() WHERE id=tid;
 ELSIF t.stripe_subscription_id IS NULL OR EXISTS(SELECT 1 FROM public.team_subscription_ledger WHERE stripe_subscription_id=t.stripe_subscription_id AND environment=p_environment) THEN
 UPDATE public.teams SET status='canceled',updated_at=now() WHERE id=tid;
 END IF;
 RETURN jsonb_build_object('ok',true,'applied',true);
END $$;
REVOKE ALL ON FUNCTION public.sync_team_subscription_event(jsonb,text,bigint,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.sync_team_subscription_event(jsonb,text,bigint,text) TO service_role;

CREATE OR REPLACE FUNCTION public.reconcile_subscription_invoice(p_invoice jsonb,p_environment text,p_event_id text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE old public.subscription_invoice_ledger%ROWTYPE; u uuid := (p_invoice->>'user_id')::uuid; tid uuid := (p_invoice->>'team_id')::uuid; s public.subscriptions%ROWTYPE; ts public.team_subscription_ledger%ROWTYPE;
BEGIN
 IF p_environment IS NULL OR p_environment NOT IN('live','sandbox') OR u IS NULL OR nullif(p_event_id,'') IS NULL OR p_invoice->>'currency'<>'eur' OR (p_invoice->>'amount_paid')::bigint<=0 OR (p_invoice->>'amount_refunded')::bigint<0 OR (p_invoice->>'amount_refunded')::bigint>(p_invoice->>'amount_paid')::bigint OR (p_invoice->>'period_end')::timestamptz<=(p_invoice->>'period_start')::timestamptz THEN RAISE EXCEPTION 'invalid_invoice_proof'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(coalesce(tid,u)::text||p_environment,0));
 IF tid IS NOT NULL THEN
 IF NOT EXISTS(SELECT 1 FROM public.teams WHERE id=tid AND owner_id=u AND environment=p_environment) THEN RAISE EXCEPTION 'invoice_team_binding_mismatch'; END IF;
 SELECT * INTO ts FROM public.team_subscription_ledger WHERE stripe_subscription_id=p_invoice->>'stripe_subscription_id';
 IF FOUND AND (ts.user_id<>u OR ts.team_id<>tid OR ts.environment<>p_environment OR ts.stripe_customer_id<>p_invoice->>'stripe_customer_id') THEN RAISE EXCEPTION 'invoice_subscription_binding_mismatch'; END IF;
 ELSE
 SELECT * INTO s FROM public.subscriptions WHERE stripe_subscription_id=p_invoice->>'stripe_subscription_id';
 IF FOUND AND (s.user_id<>u OR s.environment<>p_environment OR s.stripe_customer_id<>p_invoice->>'stripe_customer_id') THEN RAISE EXCEPTION 'invoice_subscription_binding_mismatch'; END IF;
 END IF;
 SELECT * INTO old FROM public.subscription_invoice_ledger WHERE invoice_id=p_invoice->>'invoice_id' FOR UPDATE;
 IF FOUND AND (old.user_id<>u OR old.team_id IS DISTINCT FROM tid OR old.environment<>p_environment OR old.stripe_subscription_id<>p_invoice->>'stripe_subscription_id' OR old.stripe_customer_id<>p_invoice->>'stripe_customer_id' OR old.amount_paid<>(p_invoice->>'amount_paid')::bigint OR old.period_start<>(p_invoice->>'period_start')::timestamptz OR old.period_end<>(p_invoice->>'period_end')::timestamptz) THEN RAISE EXCEPTION 'invoice_binding_mismatch'; END IF;
 INSERT INTO public.subscription_invoice_ledger(invoice_id,stripe_subscription_id,user_id,team_id,stripe_customer_id,environment,currency,amount_paid,amount_refunded,period_start,period_end,last_event_id)
 VALUES(p_invoice->>'invoice_id',p_invoice->>'stripe_subscription_id',u,tid,p_invoice->>'stripe_customer_id',p_environment,'eur',(p_invoice->>'amount_paid')::bigint,(p_invoice->>'amount_refunded')::bigint,(p_invoice->>'period_start')::timestamptz,(p_invoice->>'period_end')::timestamptz,p_event_id)
 ON CONFLICT(invoice_id) DO UPDATE SET amount_refunded=greatest(subscription_invoice_ledger.amount_refunded,excluded.amount_refunded),last_event_id=excluded.last_event_id;
 -- Refresh existing authoritative state even when the provider event's timestamp is older.
 IF s.stripe_subscription_id IS NOT NULL THEN
 PERFORM public.sync_subscription_event(jsonb_build_object('invoice_refresh',true,'user_id',s.user_id,'stripe_subscription_id',s.stripe_subscription_id,'stripe_customer_id',s.stripe_customer_id,'product_id',s.product_id,'price_id',s.price_id,'status',coalesce(s.provider_status,s.status),'current_period_start',s.current_period_start,'current_period_end',s.current_period_end,'cancel_at_period_end',s.cancel_at_period_end),p_environment,greatest(s.last_event_created,1),coalesce(s.last_event_id,'legacy'));
 END IF;
 IF ts.stripe_subscription_id IS NOT NULL THEN
 PERFORM public.sync_team_subscription_event(jsonb_build_object('invoice_refresh',true,'user_id',ts.user_id,'team_id',ts.team_id,'stripe_subscription_id',ts.stripe_subscription_id,'stripe_customer_id',ts.stripe_customer_id,'seat_count',ts.seat_count,'status',coalesce(ts.provider_status,ts.status),'current_period_start',ts.current_period_start,'current_period_end',ts.current_period_end),p_environment,ts.last_event_created,ts.last_event_id);
 END IF;
 RETURN jsonb_build_object('ok',true);
END $$;
REVOKE ALL ON FUNCTION public.reconcile_subscription_invoice(jsonb,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reconcile_subscription_invoice(jsonb,text,text) TO service_role;

-- TEST subscription writes must not detach real team memberships.
CREATE OR REPLACE FUNCTION public.cleanup_team_on_subscription() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF NEW.environment='live' AND NEW.status IN('active','trialing','past_due') THEN
 DELETE FROM public.team_members tm USING public.teams t WHERE tm.team_id=t.id AND tm.user_id=NEW.user_id AND t.owner_id<>NEW.user_id AND t.environment='live';
 END IF; RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.enforce_no_team_when_subscribed() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM public.subscriptions s JOIN public.teams t ON t.id=NEW.team_id WHERE s.user_id=NEW.user_id AND s.environment=t.environment AND ((s.status IN('active','trialing','past_due') AND (s.current_period_end IS NULL OR s.current_period_end>now())) OR (s.status='canceled' AND s.current_period_end>now()))) THEN
 RAISE EXCEPTION 'Имате активен индивидуален абонамент.' USING ERRCODE='check_violation'; END IF;
 RETURN NEW;
END $$;
CREATE OR REPLACE FUNCTION public.consume_team_quota(_team_id uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE t public.teams%ROWTYPE; usage public.team_usage%ROWTYPE; cap integer;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='28000'; END IF;
 IF NOT public.is_team_member(auth.uid(),_team_id) THEN RAISE EXCEPTION 'not_team_member' USING ERRCODE='42501'; END IF;
 SELECT * INTO t FROM public.teams WHERE id=_team_id FOR UPDATE;
 IF NOT FOUND OR t.environment<>'live' OR t.status<>'active' OR (t.current_period_end IS NOT NULL AND t.current_period_end<=now()) THEN RETURN jsonb_build_object('ok',false,'reason','team_inactive'); END IF;
 cap := t.seat_count*100;
 SELECT * INTO usage FROM public.team_usage WHERE team_id=_team_id FOR UPDATE;
 IF NOT FOUND THEN INSERT INTO public.team_usage(team_id) VALUES(_team_id) RETURNING * INTO usage; END IF;
 IF now()-usage.period_start>=interval '30 days' THEN UPDATE public.team_usage SET ops_used=0,period_start=now(),updated_at=now() WHERE team_id=_team_id; usage.ops_used:=0; END IF;
 IF usage.ops_used>=cap THEN RETURN jsonb_build_object('ok',false,'reason','team_limit_reached','ops_used',usage.ops_used,'cap',cap); END IF;
 UPDATE public.team_usage SET ops_used=ops_used+1,lifetime_ops=lifetime_ops+1,updated_at=now() WHERE team_id=_team_id;
 RETURN jsonb_build_object('ok',true,'ops_used',usage.ops_used+1,'cap',cap,'lifetime_ops',usage.lifetime_ops+1);
END $$;
REVOKE ALL ON FUNCTION public.consume_team_quota(uuid) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.consume_team_quota(uuid) TO authenticated,service_role;
