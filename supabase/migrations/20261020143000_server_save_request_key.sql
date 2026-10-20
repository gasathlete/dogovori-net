-- Idempotency provenance is computed by server handlers only. A client must
-- not pre-populate or redirect a server lookup by writing this digest.
BEGIN;
CREATE OR REPLACE FUNCTION public.guard_saved_document_request_key()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path=public
AS $function$
BEGIN
 IF current_user IN ('anon','authenticated') THEN
  IF (TG_OP='INSERT' AND NEW.save_request_key IS NOT NULL)
     OR (TG_OP='UPDATE' AND NEW.save_request_key IS DISTINCT FROM OLD.save_request_key) THEN
   RAISE EXCEPTION 'server_save_request_key_required' USING ERRCODE='42501';
  END IF;
 END IF;
 RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.guard_saved_document_request_key() FROM PUBLIC,anon,authenticated;
CREATE TRIGGER saved_document_request_key_server_only
 BEFORE INSERT OR UPDATE ON public.saved_documents
 FOR EACH ROW EXECUTE FUNCTION public.guard_saved_document_request_key();
COMMIT;
