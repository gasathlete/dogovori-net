
CREATE TABLE IF NOT EXISTS public.document_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  saved_document_id uuid NOT NULL REFERENCES public.saved_documents(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  title text NOT NULL,
  payload jsonb NOT NULL,
  version_no integer NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_document_versions_doc ON public.document_versions(saved_document_id, version_no DESC);
CREATE INDEX IF NOT EXISTS idx_document_versions_user ON public.document_versions(user_id);

GRANT SELECT, INSERT, DELETE ON public.document_versions TO authenticated;
GRANT ALL ON public.document_versions TO service_role;

ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_versions_select_own ON public.document_versions
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY document_versions_insert_own ON public.document_versions
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY document_versions_delete_own ON public.document_versions
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

-- Auto-snapshot the OLD payload whenever a saved_document is updated with new payload
CREATE OR REPLACE FUNCTION public.snapshot_saved_document_version()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_no integer;
BEGIN
  IF OLD.payload IS DISTINCT FROM NEW.payload OR OLD.title IS DISTINCT FROM NEW.title THEN
    SELECT COALESCE(MAX(version_no), 0) + 1 INTO next_no
      FROM public.document_versions WHERE saved_document_id = OLD.id;
    INSERT INTO public.document_versions(saved_document_id, user_id, title, payload, version_no)
      VALUES (OLD.id, OLD.user_id, OLD.title, OLD.payload, next_no);
    -- Keep only the last 20 versions per document
    DELETE FROM public.document_versions
      WHERE saved_document_id = OLD.id
        AND id NOT IN (
          SELECT id FROM public.document_versions
            WHERE saved_document_id = OLD.id
            ORDER BY version_no DESC LIMIT 20
        );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_snapshot_saved_document ON public.saved_documents;
CREATE TRIGGER trg_snapshot_saved_document
  BEFORE UPDATE ON public.saved_documents
  FOR EACH ROW EXECUTE FUNCTION public.snapshot_saved_document_version();
