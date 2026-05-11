ALTER TABLE public.shared_links ALTER COLUMN document_id DROP NOT NULL;
ALTER TABLE public.shared_links ADD COLUMN IF NOT EXISTS uploaded_contract_id uuid;
ALTER TABLE public.shared_links ADD COLUMN IF NOT EXISTS signed_pdf_path text;
ALTER TABLE public.shared_links DROP CONSTRAINT IF EXISTS shared_links_target_xor;
ALTER TABLE public.shared_links ADD CONSTRAINT shared_links_target_xor CHECK (
  (document_id IS NOT NULL AND uploaded_contract_id IS NULL)
  OR (document_id IS NULL AND uploaded_contract_id IS NOT NULL)
);
CREATE INDEX IF NOT EXISTS idx_shared_links_uploaded ON public.shared_links(uploaded_contract_id);