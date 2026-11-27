CREATE OR REPLACE FUNCTION public.enforce_no_client_document_text_write()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE v_new jsonb; v_old jsonb;
BEGIN
  IF current_user NOT IN ('anon', 'authenticated') THEN RETURN NEW; END IF;
  v_new := to_jsonb(NEW);
  IF TG_OP = 'INSERT' THEN
    IF btrim(coalesce(v_new ->> 'extracted_text', '')) <> '' OR btrim(coalesce(v_new ->> 'text_content', '')) <> '' THEN
      RAISE EXCEPTION 'client_document_text_write_denied' USING ERRCODE = '42501',
        HINT = 'Raw document text must be written by a server role only.';
    END IF;
    RETURN NEW;
  END IF;
  v_old := to_jsonb(OLD);
  IF (v_new ->> 'extracted_text') IS DISTINCT FROM (v_old ->> 'extracted_text')
     OR (v_new ->> 'text_hash') IS DISTINCT FROM (v_old ->> 'text_hash')
     OR (v_new ->> 'text_content') IS DISTINCT FROM (v_old ->> 'text_content') THEN
    RAISE EXCEPTION 'client_document_text_write_denied' USING ERRCODE = '42501',
      HINT = 'Raw document text must be written by a server role only.';
  END IF;
  RETURN NEW;
END; $$;
COMMENT ON FUNCTION public.enforce_no_client_document_text_write() IS 'Denies raw document text/hash writes from anon/authenticated; only server roles (uploaded-text-intake) write text. Reads, metadata edits and deletes unaffected.';
REVOKE ALL ON FUNCTION public.enforce_no_client_document_text_write() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS uploaded_contracts_no_client_text_write ON public.uploaded_contracts;
CREATE TRIGGER uploaded_contracts_no_client_text_write BEFORE INSERT OR UPDATE ON public.uploaded_contracts
FOR EACH ROW EXECUTE FUNCTION public.enforce_no_client_document_text_write();