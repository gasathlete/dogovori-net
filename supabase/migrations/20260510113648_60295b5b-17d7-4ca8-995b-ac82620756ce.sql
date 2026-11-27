-- C1: refund_quota — add caller check + revoke from authenticated/anon
CREATE OR REPLACE FUNCTION public.refund_quota(_user_id uuid, _kind text, _used_bonus boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Only service role or staff may invoke this; prevent self-refund abuse.
  IF auth.role() <> 'service_role'
     AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

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
$function$;

REVOKE EXECUTE ON FUNCTION public.refund_quota(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.refund_quota(uuid, text, boolean) TO service_role;

-- C2: pgmq helper functions — service role only
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint)              FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb)  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.enqueue_email(text, jsonb)              TO service_role;
GRANT EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.delete_email(text, bigint)              TO service_role;
GRANT EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb)  TO service_role;