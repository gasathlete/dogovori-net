-- Preserve the corrected four-column conflict target and serialize same-document
-- reservations across tabs before reading/consuming quota. No data/ACL changes.
CREATE OR REPLACE FUNCTION public.consume_quota_session(_kind text, _doc_key text, _session_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _existing public.quota_session_charges%ROWTYPE;
  _result jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF _kind NOT IN ('contract','template','analysis') THEN
    RAISE EXCEPTION 'invalid kind' USING ERRCODE = '22023';
  END IF;
  IF _doc_key IS NULL OR length(_doc_key) = 0 OR _session_id IS NULL THEN
    RETURN public.consume_quota(_kind);
  END IF;

  -- Lock covers the 24-hour reuse scope as well as the current tab.
  PERFORM pg_advisory_xact_lock(hashtextextended(
    _uid::text || '|' || _kind || '|' || _doc_key, 0));

  SELECT * INTO _existing
    FROM public.quota_session_charges
   WHERE user_id = _uid AND session_id = _session_id AND doc_key = _doc_key AND kind = _kind
   FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'charged', false,
      'used_bonus', false,
      'is_pro', (SELECT plan = 'pro'::public.user_plan
                        OR (pro_until IS NOT NULL AND pro_until > now())
                  FROM public.download_quota WHERE user_id = _uid),
      'reused_session_charge', true
    );
  END IF;

  SELECT * INTO _existing
    FROM public.quota_session_charges
   WHERE user_id = _uid
     AND doc_key = _doc_key
     AND kind = _kind
     AND created_at > now() - interval '24 hours'
   ORDER BY created_at DESC
   LIMIT 1;

  IF FOUND THEN
    INSERT INTO public.quota_session_charges (user_id, session_id, doc_key, kind)
      VALUES (_uid, _session_id, _doc_key, _kind)
      ON CONFLICT (user_id, session_id, doc_key, kind) DO NOTHING;
    RETURN jsonb_build_object(
      'ok', true,
      'charged', false,
      'used_bonus', false,
      'is_pro', (SELECT plan = 'pro'::public.user_plan
                        OR (pro_until IS NOT NULL AND pro_until > now())
                  FROM public.download_quota WHERE user_id = _uid),
      'reused_session_charge', true,
      'reused_within_24h', true
    );
  END IF;

  _result := public.consume_quota(_kind);

  IF COALESCE((_result->>'ok')::boolean, false) THEN
    INSERT INTO public.quota_session_charges (user_id, session_id, doc_key, kind)
      VALUES (_uid, _session_id, _doc_key, _kind)
      ON CONFLICT (user_id, session_id, doc_key, kind) DO NOTHING;
    _result := _result || jsonb_build_object('charged', true);
  ELSE
    _result := _result || jsonb_build_object('charged', false);
  END IF;

  RETURN _result;
END;
$function$;