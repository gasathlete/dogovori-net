
-- 1) Drop redundant service_role-only policy on document_reminders (service_role bypasses RLS anyway)
DROP POLICY IF EXISTS document_reminders_service_role ON public.document_reminders;

-- 2) Replace permissive INSERT policy on feedback_submissions with constrained version
DROP POLICY IF EXISTS anyone_can_submit_feedback ON public.feedback_submissions;
CREATE POLICY anyone_can_submit_feedback
  ON public.feedback_submissions
  FOR INSERT
  TO anon, authenticated
  WITH CHECK (
    char_length(coalesce(body, '')) BETWEEN 1 AND 5000
    AND char_length(coalesce(subject, '')) <= 200
    AND (user_id IS NULL OR user_id = auth.uid())
  );
