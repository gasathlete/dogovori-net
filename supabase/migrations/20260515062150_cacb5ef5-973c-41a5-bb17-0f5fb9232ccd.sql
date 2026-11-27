
-- 1) Partners: hide reviewer/submitter UUIDs from anon/authenticated
REVOKE SELECT (submitted_by, approved_by, approved_at) ON public.partners FROM anon, authenticated;

-- 2) blog_ratings: stop exposing user_id to everyone
DROP POLICY IF EXISTS blog_ratings_select_all ON public.blog_ratings;

CREATE POLICY blog_ratings_select_own
  ON public.blog_ratings
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- Aggregate access (avg, count) remains available to everyone via
-- public.get_post_rating(_post_type, _post_slug) which is SECURITY DEFINER.
