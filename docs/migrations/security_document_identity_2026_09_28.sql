-- Document ownership and storage binding; reviewed security follow-through.
-- Client creates use the signed-in owner; team edits cannot rewrite ownership.
-- Service-role/definer workflows retain their existing behavior.
BEGIN;
CREATE OR REPLACE FUNCTION public.document_client_identity_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public, pg_temp AS $$
DECLARE p text;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF auth.uid() IS NULL OR NEW.user_id IS DISTINCT FROM auth.uid() THEN
      RAISE EXCEPTION 'document_owner_required' USING ERRCODE='42501';
    END IF;
  ELSIF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
    RAISE EXCEPTION 'document_owner_immutable' USING ERRCODE='42501';
  END IF;
  IF TG_TABLE_NAME = 'saved_documents' THEN
    p := NEW.payload ->> 'storage_path';
  ELSE
    p := NEW.storage_path;
  END IF;
  IF p IS NOT NULL AND (
    split_part(p,'/',1) IS DISTINCT FROM NEW.user_id::text
    OR position('..' in p)>0 OR position(chr(92) in p)>0
    OR position('//' in p)>0 OR position('/./' in p)>0
    OR p ~* '%(2e|2f|5c)'
  ) THEN
    RAISE EXCEPTION 'document_storage_owner_required' USING ERRCODE='42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.document_client_identity_guard() FROM PUBLIC,anon,authenticated;
DROP TRIGGER IF EXISTS trg_document_client_identity ON public.saved_documents;
CREATE TRIGGER trg_document_client_identity BEFORE INSERT OR UPDATE ON public.saved_documents
FOR EACH ROW EXECUTE FUNCTION public.document_client_identity_guard();
DROP TRIGGER IF EXISTS trg_document_client_identity ON public.uploaded_contracts;
CREATE TRIGGER trg_document_client_identity BEFORE INSERT OR UPDATE ON public.uploaded_contracts
FOR EACH ROW EXECUTE FUNCTION public.document_client_identity_guard();
COMMIT;
