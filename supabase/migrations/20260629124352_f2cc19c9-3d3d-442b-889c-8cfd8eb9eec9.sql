
ALTER TABLE public.saved_documents ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}';
CREATE INDEX IF NOT EXISTS saved_documents_tags_gin ON public.saved_documents USING gin (tags);

ALTER TABLE public.teams ADD COLUMN IF NOT EXISTS sso_config jsonb NOT NULL DEFAULT '{}'::jsonb;
