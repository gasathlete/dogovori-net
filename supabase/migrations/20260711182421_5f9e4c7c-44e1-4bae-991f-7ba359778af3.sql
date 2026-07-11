ALTER TABLE public.signing_request_signers
  ADD COLUMN IF NOT EXISTS signature_method text NOT NULL DEFAULT 'drawn',
  ADD COLUMN IF NOT EXISTS qes_file_path text,
  ADD COLUMN IF NOT EXISTS qes_file_name text,
  ADD COLUMN IF NOT EXISTS qes_file_size integer,
  ADD COLUMN IF NOT EXISTS qes_file_mime text;