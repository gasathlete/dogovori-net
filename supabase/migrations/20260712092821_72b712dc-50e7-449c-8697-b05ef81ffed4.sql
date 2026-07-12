
CREATE OR REPLACE FUNCTION public.get_first90_remaining()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT GREATEST(
    0,
    90 - (
      SELECT COUNT(*)::int
      FROM public.subscriptions
      WHERE status IN ('active','trialing','past_due')
    )
  );
$$;

CREATE OR REPLACE FUNCTION public.get_registered_users_count()
RETURNS integer
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT GREATEST(
    100,
    (SELECT COUNT(*)::int FROM public.profiles)
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_first90_remaining() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_registered_users_count() TO anon, authenticated;
