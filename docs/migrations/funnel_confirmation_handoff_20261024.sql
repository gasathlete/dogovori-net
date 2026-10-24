CREATE TABLE public.signup_handoffs (
 user_id uuid PRIMARY KEY, event_id uuid NOT NULL, evidence jsonb NOT NULL,
 return_path text NOT NULL DEFAULT '/account', created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now() + interval '24 hours', consumed_at timestamptz
);
GRANT ALL ON public.signup_handoffs TO service_role;
ALTER TABLE public.signup_handoffs ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.capture_signup_handoff() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE e jsonb := NEW.raw_user_meta_data->'signup_handoff'; r text;
BEGIN
 IF jsonb_typeof(e) IS DISTINCT FROM 'object' OR e->>'event_id' !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
 OR e->'terms' IS DISTINCT FROM 'true'::jsonb OR e->'privacy' IS DISTINCT FROM 'true'::jsonb
 OR e->'age_18' IS DISTINCT FROM 'true'::jsonb OR e->'operational_notifications' IS DISTINCT FROM 'true'::jsonb
 OR (e ? 'marketing' AND e->'marketing' NOT IN ('true'::jsonb,'false'::jsonb)) THEN RETURN NEW; END IF;
 r := e->>'return_path';
 IF r IS NULL OR length(r)>2048 OR r !~ '^/[a-zA-Z0-9]' OR r ~ '[\\#[:cntrl:]]' OR r ~* '%(2f|5c|0a|0d)' THEN r := '/account'; END IF;
 INSERT INTO public.signup_handoffs(user_id,event_id,evidence,return_path)
 VALUES(NEW.id,(e->>'event_id')::uuid,jsonb_build_object('terms',true,'privacy',true,'age_18',true,'operational_notifications',true,'marketing',e->'marketing'),r)
 ON CONFLICT(user_id) DO NOTHING;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.capture_signup_handoff() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER capture_signup_handoff AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.capture_signup_handoff();

CREATE OR REPLACE FUNCTION public.consume_signup_handoff() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE h public.signup_handoffs%ROWTYPE; k text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'unauthenticated'; END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.users WHERE id=auth.uid() AND email_confirmed_at IS NOT NULL) THEN
 RETURN jsonb_build_object('ok',false,'reason','confirmation_required'); END IF;
 SELECT * INTO h FROM public.signup_handoffs WHERE user_id=auth.uid() FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('ok',true,'reason','nothing_pending'); END IF;
 IF h.consumed_at IS NOT NULL THEN RETURN jsonb_build_object('ok',true,'reason','already_consumed'); END IF;
 IF h.expires_at <= now() THEN RETURN jsonb_build_object('ok',false,'reason','expired'); END IF;
 FOREACH k IN ARRAY ARRAY['terms','privacy','age_18','operational_notifications','marketing'] LOOP
 IF (k <> 'marketing' OR h.evidence->'marketing'='true'::jsonb)
 AND NOT EXISTS(SELECT 1 FROM public.user_consents WHERE user_id=h.user_id AND consent_type=k AND created_at>h.created_at) THEN
 INSERT INTO public.user_consents(user_id,consent_type,document_version,granted,consent_event_id,metadata)
 VALUES(h.user_id,k,CASE WHEN k='marketing' THEN '2026-10-21' WHEN k='operational_notifications' THEN '2026-09-15' ELSE '2026-05-16' END,true,h.event_id,jsonb_build_object('source','confirmed_signup'))
 ON CONFLICT(user_id,consent_type,consent_event_id) DO NOTHING;
 END IF;
 END LOOP;
 UPDATE public.signup_handoffs SET consumed_at=now() WHERE user_id=h.user_id;
 RETURN jsonb_build_object('ok',true,'return_path',h.return_path);
END $$;
REVOKE ALL ON FUNCTION public.consume_signup_handoff() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.consume_signup_handoff() TO authenticated,service_role;