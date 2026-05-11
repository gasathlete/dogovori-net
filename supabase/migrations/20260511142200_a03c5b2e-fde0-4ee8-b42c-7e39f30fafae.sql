
-- Bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('document-blanks', 'document-blanks', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: only service role writes; authenticated users can read via signed URLs (no direct policy needed because edge function uses service role to sign)
CREATE POLICY "blanks_service_role_all"
ON storage.objects
FOR ALL
TO service_role
USING (bucket_id = 'document-blanks')
WITH CHECK (bucket_id = 'document-blanks');

-- Index table
CREATE TABLE public.document_blanks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sector_id TEXT NOT NULL,
  document_name TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (sector_id, document_name)
);

CREATE INDEX idx_document_blanks_sector ON public.document_blanks(sector_id);

ALTER TABLE public.document_blanks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "document_blanks_select_authenticated"
ON public.document_blanks
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "document_blanks_select_anon"
ON public.document_blanks
FOR SELECT
TO anon
USING (true);

CREATE POLICY "document_blanks_service_role"
ON public.document_blanks
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

CREATE TRIGGER document_blanks_updated_at
BEFORE UPDATE ON public.document_blanks
FOR EACH ROW
EXECUTE FUNCTION public.set_updated_at();
