ALTER TABLE public.shared_links
  ADD COLUMN IF NOT EXISTS signature_method text,
  ADD COLUMN IF NOT EXISTS qes_file_path text,
  ADD COLUMN IF NOT EXISTS qes_file_name text,
  ADD COLUMN IF NOT EXISTS qes_file_mime text,
  ADD COLUMN IF NOT EXISTS qes_file_size integer;