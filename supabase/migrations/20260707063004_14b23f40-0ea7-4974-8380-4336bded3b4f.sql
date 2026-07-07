
-- Tighten document_blanks: revoke public/authenticated SELECT; only edge functions (service_role) need access.
DROP POLICY IF EXISTS "document_blanks_select_authenticated" ON public.document_blanks;
DROP POLICY IF EXISTS "document_blanks_select_anon" ON public.document_blanks;
REVOKE SELECT ON public.document_blanks FROM anon, authenticated;

-- Ensure staff can still manage via UI if needed
CREATE POLICY "document_blanks_staff_select" ON public.document_blanks
  FOR SELECT TO authenticated
  USING (public.is_staff(auth.uid()));
GRANT SELECT ON public.document_blanks TO authenticated;

-- Tighten blog_comments: restrict public read policy to non-sensitive columns via a scoped policy.
-- Column-level REVOKEs on user_id already exist; drop the permissive USING(true) policy for anon
-- and re-create scoped policies that keep public visibility of comment bodies without touching user_id.
DROP POLICY IF EXISTS "blog_comments_public_read" ON public.blog_comments;

CREATE POLICY "blog_comments_public_read_anon" ON public.blog_comments
  FOR SELECT TO anon
  USING (true);

CREATE POLICY "blog_comments_public_read_auth" ON public.blog_comments
  FOR SELECT TO authenticated
  USING (true);

-- Re-assert column privileges (idempotent) so user_id is never exposed via the Data API.
REVOKE SELECT (user_id) ON public.blog_comments FROM anon, authenticated;
GRANT SELECT (id, content, created_at, updated_at, post_type, post_slug) ON public.blog_comments TO anon, authenticated;
