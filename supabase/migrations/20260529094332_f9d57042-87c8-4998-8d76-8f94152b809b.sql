-- Drop blanket SELECT on blog_comments from anon and re-grant only safe columns
REVOKE SELECT ON public.blog_comments FROM anon;
GRANT SELECT (id, post_slug, post_type, content, created_at, updated_at)
  ON public.blog_comments TO anon;