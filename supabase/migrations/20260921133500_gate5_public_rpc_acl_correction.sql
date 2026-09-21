-- Gate 5: restore the least-privilege browser ACL required by public home RPCs
-- and authenticated RLS policies. No tables, rows, or policies are changed.
BEGIN;

-- top_blog_articles was present in the live schema but was not represented by a
-- migration in the repository. Define the audited implementation so fresh
-- environments are reproducible.
CREATE OR REPLACE FUNCTION public.top_blog_articles(_limit integer DEFAULT 2)
RETURNS TABLE(path text, views bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT pv.path, count(*)::bigint AS views
  FROM public.page_views pv
  WHERE pv.path LIKE '/blog/%'
    AND pv.created_at > now() - interval '180 days'
  GROUP BY pv.path
  ORDER BY count(*) DESC, pv.path ASC
  LIMIT LEAST(GREATEST(COALESCE(_limit, 2), 1), 12)
$function$;

-- Preserve fixed resolution for all three SECURITY DEFINER helpers.
ALTER FUNCTION public.get_registered_users_count() SET search_path TO 'public';
ALTER FUNCTION public.top_blog_articles(integer) SET search_path TO 'public';
ALTER FUNCTION public.is_team_member(uuid, uuid) SET search_path TO 'public';

-- Start closed, then grant only the roles required by verified call sites.
REVOKE ALL ON FUNCTION public.get_registered_users_count()
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.top_blog_articles(integer)
  FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.is_team_member(uuid, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.get_registered_users_count()
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.top_blog_articles(integer)
  TO anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid)
  TO authenticated, service_role;

COMMIT;
