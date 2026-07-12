
-- 1) blog_comments: stop exposing raw table (with user_id) to anon/authenticated.
--    Public reads already go through the blog_comments_public view (no user_id).
DROP POLICY IF EXISTS blog_comments_public_read_anon ON public.blog_comments;
DROP POLICY IF EXISTS blog_comments_public_read_auth ON public.blog_comments;

CREATE POLICY blog_comments_select_own
  ON public.blog_comments FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY blog_comments_select_staff
  ON public.blog_comments FOR SELECT
  TO authenticated
  USING (is_staff(auth.uid()));

-- 2) shared_links: add an explicit owner-scoped INSERT policy so intent is clear
--    and no future broad ALL policy silently grants access. Edge functions using
--    the service role bypass RLS and are unaffected.
CREATE POLICY shared_links_insert_own
  ON public.shared_links FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = owner_id);
