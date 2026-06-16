-- Stop exposing blog_comments rows (including user_id) directly to anon/authenticated.
DROP POLICY IF EXISTS blog_comments_select_all ON public.blog_comments;

-- Make the safe view independent of base-table RLS so the app keeps working.
ALTER VIEW public.blog_comments_public SET (security_invoker = off);

-- Ensure the API roles can read the safe view.
GRANT SELECT ON public.blog_comments_public TO anon, authenticated;