-- Server-computed idempotency key for exact same save (owner + tab session + doc_key + kind + title + payload digest).
ALTER TABLE public.saved_documents ADD COLUMN IF NOT EXISTS save_request_key text;
CREATE UNIQUE INDEX IF NOT EXISTS saved_documents_user_save_request_key
  ON public.saved_documents (user_id, save_request_key) WHERE save_request_key IS NOT NULL;
COMMENT ON COLUMN public.saved_documents.save_request_key IS 'Written only by download-document (service role); SHA-256 of owner-bound exact save request. Null for legacy rows.';