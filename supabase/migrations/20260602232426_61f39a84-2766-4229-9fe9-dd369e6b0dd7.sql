-- Sprint 1: Conditional Clause Engine — DB-backed clause definitions.
-- Allows staff to edit clauses in-app and powers the dynamic decision tree.

CREATE TABLE public.template_clauses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_slug text NOT NULL,
  clause_id text NOT NULL,
  title text NOT NULL DEFAULT '',
  body_md text NOT NULL,
  include_when text,
  "order" integer NOT NULL DEFAULT 0,
  severity text NOT NULL DEFAULT 'recommended'
    CHECK (severity IN ('required','recommended','optional')),
  locale text NOT NULL DEFAULT 'bg',
  active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid,
  UNIQUE (template_slug, clause_id, locale)
);

CREATE INDEX template_clauses_slug_active_idx
  ON public.template_clauses (template_slug, locale, active, "order");

-- GRANTs — anon needs read access for the live preview to work on public
-- template landing pages without login; staff manages content via authed UI.
GRANT SELECT ON public.template_clauses TO anon;
GRANT SELECT ON public.template_clauses TO authenticated;
GRANT ALL ON public.template_clauses TO service_role;

ALTER TABLE public.template_clauses ENABLE ROW LEVEL SECURITY;

-- Anyone may read active clauses (template content is public).
CREATE POLICY template_clauses_select_active_all
  ON public.template_clauses FOR SELECT
  TO anon, authenticated
  USING (active = true);

-- Staff (admin/moderator) sees everything, including drafts.
CREATE POLICY template_clauses_select_staff
  ON public.template_clauses FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY template_clauses_insert_staff
  ON public.template_clauses FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY template_clauses_update_staff
  ON public.template_clauses FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY template_clauses_delete_staff
  ON public.template_clauses FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- updated_at trigger reuses existing set_updated_at()
CREATE TRIGGER template_clauses_set_updated_at
  BEFORE UPDATE ON public.template_clauses
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
