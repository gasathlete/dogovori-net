CREATE TABLE public.document_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  team_id uuid,
  parent_saved_id uuid REFERENCES public.saved_documents(id) ON DELETE CASCADE,
  parent_uploaded_id uuid REFERENCES public.uploaded_contracts(id) ON DELETE CASCADE,
  child_saved_id uuid REFERENCES public.saved_documents(id) ON DELETE CASCADE,
  child_uploaded_id uuid REFERENCES public.uploaded_contracts(id) ON DELETE CASCADE,
  ref_type text NOT NULL,
  ref_number int,
  ref_label text NOT NULL,
  version int NOT NULL DEFAULT 1,
  superseded_by uuid REFERENCES public.document_links(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT one_parent CHECK (
    (parent_saved_id IS NOT NULL)::int + (parent_uploaded_id IS NOT NULL)::int = 1
  ),
  CONSTRAINT one_child CHECK (
    (child_saved_id IS NOT NULL)::int + (child_uploaded_id IS NOT NULL)::int = 1
  )
);

CREATE INDEX idx_document_links_parent_saved ON public.document_links(parent_saved_id) WHERE parent_saved_id IS NOT NULL;
CREATE INDEX idx_document_links_parent_uploaded ON public.document_links(parent_uploaded_id) WHERE parent_uploaded_id IS NOT NULL;
CREATE INDEX idx_document_links_user ON public.document_links(user_id);
CREATE INDEX idx_document_links_active ON public.document_links(parent_saved_id, parent_uploaded_id) WHERE superseded_by IS NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_links TO authenticated;
GRANT ALL ON public.document_links TO service_role;

ALTER TABLE public.document_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_links_select_own ON public.document_links
  FOR SELECT TO authenticated
  USING (
    auth.uid() = user_id
    OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id))
  );

CREATE POLICY document_links_insert_own ON public.document_links
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (team_id IS NULL OR public.is_team_member(auth.uid(), team_id))
  );

CREATE POLICY document_links_update_own ON public.document_links
  FOR UPDATE TO authenticated
  USING (
    auth.uid() = user_id
    OR (team_id IS NOT NULL AND public.is_team_admin(auth.uid(), team_id))
  )
  WITH CHECK (
    auth.uid() = user_id
    OR (team_id IS NOT NULL AND public.is_team_admin(auth.uid(), team_id))
  );

CREATE POLICY document_links_delete_own ON public.document_links
  FOR DELETE TO authenticated
  USING (
    auth.uid() = user_id
    OR (team_id IS NOT NULL AND public.is_team_admin(auth.uid(), team_id))
  );

CREATE POLICY document_links_service_role ON public.document_links
  FOR ALL TO service_role USING (true) WITH CHECK (true);