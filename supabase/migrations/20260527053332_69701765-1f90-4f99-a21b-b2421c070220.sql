
CREATE TABLE public.illegal_content_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  user_email text,
  ip_hash text,
  function_name text NOT NULL,
  category text NOT NULL,
  matched_term text,
  payload_excerpt text,
  user_agent text,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.illegal_content_attempts TO authenticated;
GRANT ALL ON public.illegal_content_attempts TO service_role;

ALTER TABLE public.illegal_content_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "illegal_attempts_staff_select"
  ON public.illegal_content_attempts
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY "illegal_attempts_service_role"
  ON public.illegal_content_attempts
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

CREATE INDEX idx_illegal_attempts_created ON public.illegal_content_attempts(created_at DESC);
CREATE INDEX idx_illegal_attempts_user ON public.illegal_content_attempts(user_id) WHERE user_id IS NOT NULL;
CREATE INDEX idx_illegal_attempts_category ON public.illegal_content_attempts(category);
