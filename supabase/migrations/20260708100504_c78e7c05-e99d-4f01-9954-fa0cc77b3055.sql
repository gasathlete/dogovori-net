
ALTER TABLE public.download_quota
  ADD COLUMN IF NOT EXISTS corrections_free_used_count integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION public.free_ops_cap(_user_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT CASE
    WHEN signup_at > (now() - interval '30 days') THEN 5
    ELSE 2
  END
  FROM public.download_quota
  WHERE user_id = _user_id
$$;

GRANT EXECUTE ON FUNCTION public.free_ops_cap(uuid) TO authenticated, service_role;
