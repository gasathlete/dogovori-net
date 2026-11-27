DROP VIEW IF EXISTS public.blog_comments_public;
CREATE VIEW public.blog_comments_public
WITH (security_invoker = true) AS
SELECT c.id,
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