
-- 1) Storage bucket for uploaded contracts (private)
INSERT INTO storage.buckets (id, name, public)
VALUES ('user-contracts', 'user-contracts', false)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS: each user can only access files under their own user_id/ folder
CREATE POLICY "user_contracts_select_own"
ON storage.objects FOR SELECT
USING (bucket_id = 'user-contracts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "user_contracts_insert_own"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'user-contracts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "user_contracts_update_own"
ON storage.objects FOR UPDATE
USING (bucket_id = 'user-contracts' AND auth.uid()::text = (storage.foldername(name))[1]);

CREATE POLICY "user_contracts_delete_own"
ON storage.objects FOR DELETE
USING (bucket_id = 'user-contracts' AND auth.uid()::text = (storage.foldername(name))[1]);

-- 2) uploaded_contracts table
CREATE TABLE public.uploaded_contracts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  folder_id UUID NULL REFERENCES public.folders(id) ON DELETE SET NULL,
  contact_id UUID NULL REFERENCES public.contacts(id) ON DELETE SET NULL,
  title TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('pdf','docx','paste')),
  original_filename TEXT NULL,
  storage_path TEXT NULL,
  mime_type TEXT NULL,
  size_bytes INTEGER NULL,
  extracted_text TEXT NOT NULL DEFAULT '',
  text_hash TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.uploaded_contracts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "uploaded_contracts_all_own"
ON public.uploaded_contracts
FOR ALL
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER uploaded_contracts_set_updated_at
BEFORE UPDATE ON public.uploaded_contracts
FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE INDEX idx_uploaded_contracts_user ON public.uploaded_contracts(user_id, created_at DESC);

-- 3) risk_analyses table
CREATE TABLE public.risk_analyses (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  uploaded_contract_id UUID NOT NULL REFERENCES public.uploaded_contracts(id) ON DELETE CASCADE,
  user_id UUID NOT NULL,
  model TEXT NOT NULL,
  score INTEGER NOT NULL CHECK (score BETWEEN 1 AND 10),
  contract_type TEXT NOT NULL DEFAULT '',
  summary TEXT NOT NULL DEFAULT '',
  issues JSONB NOT NULL DEFAULT '[]'::jsonb,
  missing_clauses JSONB NOT NULL DEFAULT '[]'::jsonb,
  text_hash TEXT NOT NULL DEFAULT '',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.risk_analyses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "risk_analyses_select_own"
ON public.risk_analyses FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "risk_analyses_service_role"
ON public.risk_analyses FOR ALL
TO service_role
USING (true) WITH CHECK (true);

CREATE INDEX idx_risk_analyses_contract ON public.risk_analyses(uploaded_contract_id, created_at DESC);

-- 4) quota column for analyses
ALTER TABLE public.download_quota
ADD COLUMN IF NOT EXISTS analyses_used INTEGER NOT NULL DEFAULT 0;
