DO $$ BEGIN
  CREATE TYPE public.feedback_category AS ENUM ('bug', 'idea', 'template_request', 'ui', 'other');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.feedback_status AS ENUM ('new', 'triaged', 'done', 'wontfix');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.feedback_submissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  email text,
  category public.feedback_category NOT NULL DEFAULT 'other',
  source_page text,
  source_context jsonb NOT NULL DEFAULT '{}'::jsonb,
  subject text NOT NULL,
  body text NOT NULL,
  rating int CHECK (rating IS NULL OR (rating >= 1 AND rating <= 5)),
  status public.feedback_status NOT NULL DEFAULT 'new',
  admin_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.feedback_submissions TO authenticated;
GRANT INSERT ON public.feedback_submissions TO anon;
GRANT ALL ON public.feedback_submissions TO service_role;

ALTER TABLE public.feedback_submissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "anyone_can_submit_feedback"
  ON public.feedback_submissions FOR INSERT
  TO anon, authenticated
  WITH CHECK (true);

CREATE POLICY "users_see_own_feedback"
  ON public.feedback_submissions FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "staff_see_all_feedback"
  ON public.feedback_submissions FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "staff_update_feedback"
  ON public.feedback_submissions FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE INDEX IF NOT EXISTS feedback_submissions_status_idx ON public.feedback_submissions (status, created_at DESC);
CREATE INDEX IF NOT EXISTS feedback_submissions_user_idx ON public.feedback_submissions (user_id, created_at DESC);