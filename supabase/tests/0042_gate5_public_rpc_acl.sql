BEGIN;
SET LOCAL search_path TO public, extensions, auth, storage;
SELECT plan(19);

SELECT has_function('public', 'get_registered_users_count', ARRAY[]::text[],
  'registered-user counter exists');
SELECT has_function('public', 'top_blog_articles', ARRAY['integer'],
  'top-article aggregate exists');
SELECT has_function('public', 'is_team_member', ARRAY['uuid', 'uuid'],
  'team-membership helper exists');

SELECT ok(NOT has_function_privilege('public',
  'public.get_registered_users_count()', 'EXECUTE'),
  'PUBLIC cannot execute the registered-user counter');
SELECT ok(has_function_privilege('anon',
  'public.get_registered_users_count()', 'EXECUTE')
  AND has_function_privilege('authenticated',
  'public.get_registered_users_count()', 'EXECUTE'),
  'home counter is available to anonymous and signed-in visitors');

SELECT ok(NOT has_function_privilege('public',
  'public.top_blog_articles(integer)', 'EXECUTE'),
  'PUBLIC cannot execute the top-articles aggregate');
SELECT ok(has_function_privilege('anon',
  'public.top_blog_articles(integer)', 'EXECUTE')
  AND has_function_privilege('authenticated',
  'public.top_blog_articles(integer)', 'EXECUTE'),
  'top articles are available to anonymous and signed-in visitors');

SELECT ok(NOT has_function_privilege('public',
  'public.is_team_member(uuid,uuid)', 'EXECUTE')
  AND NOT has_function_privilege('anon',
  'public.is_team_member(uuid,uuid)', 'EXECUTE'),
  'team membership is unavailable to PUBLIC and anon');
SELECT ok(has_function_privilege('authenticated',
  'public.is_team_member(uuid,uuid)', 'EXECUTE'),
  'authenticated RLS policies can execute the team-membership helper');

SELECT ok(has_function_privilege('service_role',
  'public.get_registered_users_count()', 'EXECUTE')
  AND has_function_privilege('service_role',
  'public.top_blog_articles(integer)', 'EXECUTE')
  AND has_function_privilege('service_role',
  'public.is_team_member(uuid,uuid)', 'EXECUTE'),
  'service role retains execution on all three helpers');

SELECT ok((SELECT bool_and(p.prosecdef)
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('get_registered_users_count',
                      'top_blog_articles', 'is_team_member')),
  'all three helpers are SECURITY DEFINER');
SELECT is((SELECT count(*)::int
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('get_registered_users_count',
                      'top_blog_articles', 'is_team_member')
    AND p.proconfig @> ARRAY['search_path=public']), 3,
  'all three helpers pin search_path to public');
SELECT is((SELECT count(*)::int
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname IN ('get_registered_users_count',
                      'top_blog_articles', 'is_team_member')
    AND p.provolatile = 's'), 3,
  'all three helpers are STABLE');

SET LOCAL role anon;
SELECT ok(public.get_registered_users_count() >= 100,
  'anon can read the aggregate registered-user counter');
SELECT ok((SELECT count(*) <= 2 FROM public.top_blog_articles(2)),
  'anon top-article result respects the requested limit');
SELECT ok((SELECT count(*) <= 12 FROM public.top_blog_articles(1000)),
  'top-article limit is clamped to twelve');

RESET role;
SET LOCAL role authenticated;
SELECT ok(public.get_registered_users_count() >= 100,
  'authenticated visitors can read the aggregate counter');
SELECT ok((SELECT count(*) <= 2 FROM public.top_blog_articles(NULL)),
  'authenticated top-article result applies the default limit');
SELECT is(public.is_team_member(gen_random_uuid(), gen_random_uuid()), false,
  'unknown authenticated membership is denied');

SELECT * FROM finish();
ROLLBACK;
