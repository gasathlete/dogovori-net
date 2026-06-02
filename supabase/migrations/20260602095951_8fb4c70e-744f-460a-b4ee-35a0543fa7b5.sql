-- Document Kits: предефинирани и потребителски комплекти от документи
CREATE TABLE public.document_kits (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  team_id uuid,
  title text NOT NULL,
  source_kit_id text,
  status text NOT NULL DEFAULT 'in_progress',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_kits TO authenticated;
GRANT ALL ON public.document_kits TO service_role;

ALTER TABLE public.document_kits ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_kits_select_own ON public.document_kits
  FOR SELECT TO authenticated
  USING ((auth.uid() = user_id) OR (team_id IS NOT NULL AND is_team_member(auth.uid(), team_id)));

CREATE POLICY document_kits_insert_own ON public.document_kits
  FOR INSERT TO authenticated
  WITH CHECK ((auth.uid() = user_id) AND (team_id IS NULL OR is_team_member(auth.uid(), team_id)));

CREATE POLICY document_kits_update_own ON public.document_kits
  FOR UPDATE TO authenticated
  USING ((auth.uid() = user_id) OR (team_id IS NOT NULL AND is_team_admin(auth.uid(), team_id)))
  WITH CHECK ((auth.uid() = user_id) OR (team_id IS NOT NULL AND is_team_admin(auth.uid(), team_id)));

CREATE POLICY document_kits_delete_own ON public.document_kits
  FOR DELETE TO authenticated
  USING ((auth.uid() = user_id) OR (team_id IS NOT NULL AND is_team_admin(auth.uid(), team_id)));

CREATE POLICY document_kits_service_role ON public.document_kits
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_document_kits_user ON public.document_kits (user_id);
CREATE INDEX idx_document_kits_team ON public.document_kits (team_id) WHERE team_id IS NOT NULL;

CREATE TRIGGER document_kits_set_updated_at
  BEFORE UPDATE ON public.document_kits
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Kit items
CREATE TABLE public.document_kit_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kit_id uuid NOT NULL REFERENCES public.document_kits(id) ON DELETE CASCADE,
  role text NOT NULL,
  ref_label text NOT NULL,
  saved_id uuid,
  uploaded_id uuid,
  planned_doc_name text,
  position int NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_kit_items TO authenticated;
GRANT ALL ON public.document_kit_items TO service_role;

ALTER TABLE public.document_kit_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY document_kit_items_select_own ON public.document_kit_items
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.document_kits k
    WHERE k.id = document_kit_items.kit_id
      AND ((auth.uid() = k.user_id) OR (k.team_id IS NOT NULL AND is_team_member(auth.uid(), k.team_id)))
  ));

CREATE POLICY document_kit_items_insert_own ON public.document_kit_items
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.document_kits k
    WHERE k.id = document_kit_items.kit_id
      AND ((auth.uid() = k.user_id) OR (k.team_id IS NOT NULL AND is_team_member(auth.uid(), k.team_id)))
  ));

CREATE POLICY document_kit_items_update_own ON public.document_kit_items
  FOR UPDATE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.document_kits k
    WHERE k.id = document_kit_items.kit_id
      AND ((auth.uid() = k.user_id) OR (k.team_id IS NOT NULL AND is_team_admin(auth.uid(), k.team_id)))
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.document_kits k
    WHERE k.id = document_kit_items.kit_id
      AND ((auth.uid() = k.user_id) OR (k.team_id IS NOT NULL AND is_team_admin(auth.uid(), k.team_id)))
  ));

CREATE POLICY document_kit_items_delete_own ON public.document_kit_items
  FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.document_kits k
    WHERE k.id = document_kit_items.kit_id
      AND ((auth.uid() = k.user_id) OR (k.team_id IS NOT NULL AND is_team_admin(auth.uid(), k.team_id)))
  ));

CREATE POLICY document_kit_items_service_role ON public.document_kit_items
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_document_kit_items_kit ON public.document_kit_items (kit_id);