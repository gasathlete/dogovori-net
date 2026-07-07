
CREATE OR REPLACE FUNCTION public.admin_list_ai_disclaimer_consents(
  _search text DEFAULT NULL,
  _limit int DEFAULT 200
)
RETURNS TABLE (
  user_id uuid,
  email text,
  display_name text,
  granted_at timestamptz,
  document_version text,
  session_id text,
  path text,
  user_agent text,
  metadata jsonb
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not_authorized';
  END IF;

  RETURN QUERY
  SELECT
    uc.user_id,
    u.email::text                       AS email,
    p.display_name,
    uc.granted_at,
    uc.document_version,
    (uc.metadata ->> 'session_id')      AS session_id,
    (uc.metadata ->> 'path')            AS path,
    uc.user_agent,
    uc.metadata
  FROM public.user_consents uc
  LEFT JOIN auth.users u    ON u.id = uc.user_id
  LEFT JOIN public.profiles p ON p.id = uc.user_id
  WHERE uc.consent_type = 'ai_disclaimer'
    AND uc.granted = true
    AND (
      _search IS NULL OR _search = ''
      OR u.email ILIKE '%' || _search || '%'
      OR COALESCE(p.display_name, '') ILIKE '%' || _search || '%'
    )
  ORDER BY uc.granted_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 1000));
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_ai_disclaimer_consents(text, int) TO authenticated;
