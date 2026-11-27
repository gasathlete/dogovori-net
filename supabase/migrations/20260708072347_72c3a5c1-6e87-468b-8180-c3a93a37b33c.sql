
CREATE OR REPLACE FUNCTION public.get_first100_remaining()
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT GREATEST(
    0,
    100 - (
      SELECT COUNT(*)::int
      FROM public.subscriptions
      WHERE status IN ('active','trialing','past_due')
    )
  );
$$;

GRANT EXECUTE ON FUNCTION public.get_first100_remaining() TO anon, authenticated;
