
-- 1) Atomic quota consumption RPC to prevent free-tier bypass via concurrent requests.
CREATE OR REPLACE FUNCTION public.consume_quota(_kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _row public.download_quota%ROWTYPE;
  _is_pro boolean;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF _kind NOT IN ('contract','template','analysis') THEN
    RAISE EXCEPTION 'invalid kind' USING ERRCODE = '22023';
  END IF;

  -- Lock the row to serialize concurrent quota mutations.
  SELECT * INTO _row FROM public.download_quota
   WHERE user_id = _uid FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.download_quota (user_id) VALUES (_uid)
      RETURNING * INTO _row;
  END IF;

  _is_pro := _row.plan = 'pro'::public.user_plan
             OR (_row.pro_until IS NOT NULL AND _row.pro_until > now());

  IF _kind = 'contract' THEN
    IF _is_pro THEN
      UPDATE public.download_quota SET contracts_used = contracts_used + 1, updated_at = now()
        WHERE user_id = _uid;
      RETURN jsonb_build_object('ok', true, 'used_bonus', false, 'is_pro', true);
    END IF;
    IF _row.contracts_used < 1 THEN
      UPDATE public.download_quota SET contracts_used = contracts_used + 1, updated_at = now()
        WHERE user_id = _uid;
      RETURN jsonb_build_object('ok', true, 'used_bonus', false, 'is_pro', false);
    END IF;
    IF _row.bonus_contracts > 0 THEN
      UPDATE public.download_quota SET bonus_contracts = bonus_contracts - 1, updated_at = now()
        WHERE user_id = _uid;
      RETURN jsonb_build_object('ok', true, 'used_bonus', true, 'is_pro', false);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'quota_exceeded', 'is_pro', false);
  ELSIF _kind = 'template' THEN
    IF _is_pro THEN
      UPDATE public.download_quota SET templates_used = templates_used + 1, updated_at = now()
        WHERE user_id = _uid;
      RETURN jsonb_build_object('ok', true, 'is_pro', true);
    END IF;
    IF _row.templates_used < 1 THEN
      UPDATE public.download_quota SET templates_used = templates_used + 1, updated_at = now()
        WHERE user_id = _uid;
      RETURN jsonb_build_object('ok', true, 'is_pro', false);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'quota_exceeded', 'is_pro', false);
  ELSE -- analysis
    IF _is_pro THEN
      UPDATE public.download_quota SET analyses_used = analyses_used + 1, updated_at = now()
        WHERE user_id = _uid;
      RETURN jsonb_build_object('ok', true, 'is_pro', true);
    END IF;
    IF _row.analyses_used < 1 THEN
      UPDATE public.download_quota SET analyses_used = analyses_used + 1, updated_at = now()
        WHERE user_id = _uid;
      RETURN jsonb_build_object('ok', true, 'is_pro', false);
    END IF;
    RETURN jsonb_build_object('ok', false, 'reason', 'quota_exceeded', 'is_pro', false);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.consume_quota(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.consume_quota(text) TO authenticated, service_role;

-- Refund (used when an AI/edge call fails after consuming).
CREATE OR REPLACE FUNCTION public.refund_quota(_user_id uuid, _kind text, _used_bonus boolean DEFAULT false)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF _kind = 'contract' THEN
    IF _used_bonus THEN
      UPDATE public.download_quota
         SET bonus_contracts = bonus_contracts + 1, updated_at = now()
       WHERE user_id = _user_id;
    ELSE
      UPDATE public.download_quota
         SET contracts_used = GREATEST(0, contracts_used - 1), updated_at = now()
       WHERE user_id = _user_id;
    END IF;
  ELSIF _kind = 'template' THEN
    UPDATE public.download_quota
       SET templates_used = GREATEST(0, templates_used - 1), updated_at = now()
     WHERE user_id = _user_id;
  ELSIF _kind = 'analysis' THEN
    UPDATE public.download_quota
       SET analyses_used = GREATEST(0, analyses_used - 1), updated_at = now()
     WHERE user_id = _user_id;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.refund_quota(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.refund_quota(uuid, text, boolean) TO service_role;

-- 2) Fix Supabase linter: pin search_path on email queue helpers.
CREATE OR REPLACE FUNCTION public.enqueue_email(queue_name text, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pgmq
AS $function$
BEGIN
  RETURN pgmq.send(queue_name, payload);
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN pgmq.send(queue_name, payload);
END;
$function$;

CREATE OR REPLACE FUNCTION public.read_email_batch(queue_name text, batch_size integer, vt integer)
 RETURNS TABLE(msg_id bigint, read_ct integer, message jsonb)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pgmq
AS $function$
BEGIN
  RETURN QUERY SELECT r.msg_id, r.read_ct, r.message FROM pgmq.read(queue_name, vt, batch_size) r;
EXCEPTION WHEN undefined_table THEN
  PERFORM pgmq.create(queue_name);
  RETURN;
END;
$function$;

CREATE OR REPLACE FUNCTION public.delete_email(queue_name text, message_id bigint)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pgmq
AS $function$
BEGIN
  RETURN pgmq.delete(queue_name, message_id);
EXCEPTION WHEN undefined_table THEN
  RETURN FALSE;
END;
$function$;

CREATE OR REPLACE FUNCTION public.move_to_dlq(source_queue text, dlq_name text, message_id bigint, payload jsonb)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = public, pgmq
AS $function$
DECLARE new_id BIGINT;
BEGIN
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  PERFORM pgmq.delete(source_queue, message_id);
  RETURN new_id;
EXCEPTION WHEN undefined_table THEN
  BEGIN
    PERFORM pgmq.create(dlq_name);
  EXCEPTION WHEN OTHERS THEN
    NULL;
  END;
  SELECT pgmq.send(dlq_name, payload) INTO new_id;
  BEGIN
    PERFORM pgmq.delete(source_queue, message_id);
  EXCEPTION WHEN undefined_table THEN
    NULL;
  END;
  RETURN new_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path = public
AS $function$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$function$;

-- 3) Lock down EXECUTE on SECURITY DEFINER functions: callable only by the
-- intended principals. Trigger and queue-internal functions should not be
-- callable from the PostgREST API at all.
REVOKE ALL ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;

REVOKE ALL ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint) TO service_role;

REVOKE ALL ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) TO service_role;

REVOKE ALL ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- has_role / is_staff are referenced by RLS policies and need authenticated
-- callers (RLS evaluates with the calling role's privileges). Keep them
-- callable by authenticated and service_role only.
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated, service_role;

-- Admin RPCs self-check is_staff, but block anon callers entirely.
REVOKE ALL ON FUNCTION public.admin_set_role(uuid, app_role, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, app_role, boolean) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_list_users(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_set_pro(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_set_pro(uuid, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_revoke_pro(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_revoke_pro(uuid) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.admin_add_bonus_contracts(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_add_bonus_contracts(uuid, integer) TO authenticated, service_role;

-- 4) Add an explicit owner-scoped SELECT policy for ai_usage so the
-- intent (each user can only ever see their own AI usage rows) is encoded
-- in the schema and survives future policy edits.
DROP POLICY IF EXISTS ai_usage_select_own ON public.ai_usage;
CREATE POLICY ai_usage_select_own ON public.ai_usage
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);
