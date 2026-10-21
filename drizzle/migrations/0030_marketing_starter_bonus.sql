-- Existing accounts already received the legacy first-month starter allowance.
-- Mark history without resetting or granting any balance.
ALTER TABLE public.download_quota ADD COLUMN IF NOT EXISTS marketing_bonus_claimed_at timestamptz;
ALTER TABLE public.download_quota ADD COLUMN IF NOT EXISTS marketing_bonus_legacy boolean NOT NULL DEFAULT false;
UPDATE public.download_quota SET marketing_bonus_legacy = true;

CREATE OR REPLACE FUNCTION public.free_ops_cap(_user_id uuid) RETURNS integer
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
 SELECT CASE WHEN marketing_bonus_legacy AND signup_at > now()-interval '30 days' THEN 5
 ELSE 2 END
 FROM public.download_quota WHERE user_id=_user_id
$$;

CREATE OR REPLACE FUNCTION public.marketing_bonus_status() RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE q public.download_quota%ROWTYPE;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE='28000'; END IF;
 SELECT * INTO q FROM public.download_quota WHERE user_id=auth.uid();
 RETURN jsonb_build_object('eligible', FOUND AND NOT q.marketing_bonus_legacy AND q.marketing_bonus_claimed_at IS NULL,
 'initial_cap',5,'regular_cap',2,'bonus_ops',5-2);
END $$;
REVOKE ALL ON FUNCTION public.marketing_bonus_status() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.marketing_bonus_status() TO authenticated,service_role;

CREATE OR REPLACE FUNCTION public.guard_marketing_bonus_columns() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
 IF current_user IN ('authenticated','anon') AND
 (NEW.marketing_bonus_legacy IS DISTINCT FROM OLD.marketing_bonus_legacy OR
 NEW.marketing_bonus_claimed_at IS DISTINCT FROM OLD.marketing_bonus_claimed_at) THEN
 RAISE EXCEPTION 'server_only_bonus' USING ERRCODE='42501'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER guard_marketing_bonus_columns BEFORE UPDATE ON public.download_quota
FOR EACH ROW EXECUTE FUNCTION public.guard_marketing_bonus_columns();

-- All explicit consent paths (including signup flush) share this locked grant.
CREATE OR REPLACE FUNCTION public.grant_marketing_bonus_on_consent() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
 IF NEW.consent_type='marketing' AND NEW.granted IS TRUE THEN
 UPDATE public.download_quota SET marketing_bonus_claimed_at=now(), topup_ops_balance=COALESCE(topup_ops_balance,0)+(5-2)
 WHERE user_id=NEW.user_id AND NOT marketing_bonus_legacy AND marketing_bonus_claimed_at IS NULL;
 END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER grant_marketing_bonus_on_consent AFTER INSERT ON public.user_consents
FOR EACH ROW EXECUTE FUNCTION public.grant_marketing_bonus_on_consent();

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
 RETURN jsonb_build_object('ok',true,'granted',true,'initial_cap',5,'regular_cap',2,'bonus_ops',5-2);
END $$;
REVOKE ALL ON FUNCTION public.claim_marketing_bonus(boolean,uuid,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.claim_marketing_bonus(boolean,uuid,text) TO authenticated,service_role;


-- Replace only the legacy unconditional signup cap; retain all metering/ACL logic.
DO $migration$
DECLARE signature text; definition text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['public.consume_quota(text)','public.consume_quota_for(uuid,text)'] LOOP
 SELECT pg_get_functiondef(signature::regprocedure) INTO definition;
 definition := regexp_replace(definition,
 'IF now\(\) - _row.signup_at < interval ''30 days'' THEN[[:space:]]+_free_monthly_cap := 5;[[:space:]]+ELSE[[:space:]]+_free_monthly_cap := 2;[[:space:]]+END IF;',
 '_free_monthly_cap := public.free_ops_cap(_row.user_id);');
 IF definition NOT LIKE '%_free_monthly_cap := public.free_ops_cap(_row.user_id);%' THEN RAISE EXCEPTION 'unexpected quota definition'; END IF;
 EXECUTE definition;
 END LOOP;
END $migration$;

-- Exhausted assistant messages may consume the same bonus pool, not a second grant.
DO $migration$
DECLARE definition text;
BEGIN
 SELECT pg_get_functiondef(oid) INTO definition FROM pg_proc WHERE proname='assistant_turn_reserve' AND pronamespace='public'::regnamespace;
 IF definition NOT LIKE '%IF _q.ai_messages_used >= _cap THEN%' THEN RAISE EXCEPTION 'unexpected assistant definition'; END IF;
 definition := replace(definition,'IF _q.ai_messages_used >= _cap THEN', 'IF _q.ai_messages_used >= _cap AND COALESCE(_q.topup_ops_balance,0)<=0 THEN');
 definition := replace(definition,'SET ai_messages_used = ai_messages_used + 1,',
 'SET topup_ops_balance = CASE WHEN _q.ai_messages_used >= _cap THEN COALESCE(topup_ops_balance,0)-1 ELSE topup_ops_balance END, ai_messages_used = ai_messages_used + 1,');
 definition := replace(definition,'''source'', ''free'', ''ai_messages_used'', 1,',
 '''source'', ''free'', ''topup_ops_balance'', CASE WHEN _q.ai_messages_used > _cap THEN 1 ELSE 0 END, ''ai_messages_used'', 1,');
 EXECUTE definition;
 SELECT pg_get_functiondef(oid) INTO definition FROM pg_proc WHERE proname='assistant_turn_cancel' AND pronamespace='public'::regnamespace;
 IF definition NOT LIKE '%SET ai_messages_used = ai_messages_used -%' THEN RAISE EXCEPTION 'unexpected assistant cancel'; END IF;
 definition := replace(definition,'SET ai_messages_used = ai_messages_used -',
 'SET topup_ops_balance = COALESCE(topup_ops_balance,0)+COALESCE((_alloc->>''topup_ops_balance'')::integer,0), ai_messages_used = ai_messages_used -');
 EXECUTE definition;
END $migration$;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)));

  INSERT INTO public.folders (user_id, name, is_favorites, color)
  VALUES (NEW.id, 'Любими', true, 'gold');

  INSERT INTO public.download_quota (user_id) VALUES (NEW.id);

  INSERT INTO public.notifications (user_id, kind, title, body, link)
  SELECT
    NEW.id,
    'welcome',
    'Добре дошли в Dogovori.net 👋',
    'Профилът Ви е създаден. Безплатният план включва 2 операции месечно. При изрично съгласие за имейл маркетинг получавате еднократно още 3 операции. Съгласието е по желание и може да бъде оттеглено без отнемане на бонуса.',
    '/catalog'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = NEW.id AND n.kind = 'welcome'
  );

  RETURN NEW;
END;
$function$
