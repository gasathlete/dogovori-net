CREATE OR REPLACE FUNCTION public.verify_cron_secret(_secret text)
RETURNS boolean
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_expected text;
BEGIN
  IF _secret IS NULL OR length(_secret) < 20 THEN
    RETURN false;
  END IF;
  SELECT decrypted_secret INTO v_expected
    FROM vault.decrypted_secrets
   WHERE name = 'growth_brief_cron_secret'
   LIMIT 1;
  IF v_expected IS NULL THEN
    RETURN false;
  END IF;
  RETURN v_expected = _secret;
END;
$function$;

REVOKE ALL ON FUNCTION public.verify_cron_secret(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.verify_cron_secret(text) TO service_role;