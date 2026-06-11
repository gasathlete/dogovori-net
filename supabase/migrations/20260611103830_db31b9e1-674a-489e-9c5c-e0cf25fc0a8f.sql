-- Revoke direct visibility of user_id from authenticated users.
-- Anon already had only safe-column grants; authenticated keeps update/delete via RLS on the base table.
REVOKE SELECT (user_id) ON public.blog_comments FROM authenticated;

-- Safe public view: never exposes user_id, joins display_name from profiles,
-- and returns is_mine for the current auth session so the UI can render delete buttons.
CREATE OR REPLACE VIEW public.blog_comments_public
WITH (security_invoker = on) AS
SELECT
  c.id,
  c.content,
  c.created_at,
  c.updated_at,
  c.post_type,
  c.post_slug,
  p.display_name AS author_name,
  (auth.uid() IS NOT NULL AND auth.uid() = c.user_id) AS is_mine
FROM public.blog_comments c
LEFT JOIN public.profiles p ON p.id = c.user_id;

GRANT SELECT ON public.blog_comments_public TO anon, authenticated;
GRANT ALL ON public.blog_comments_public TO service_role;