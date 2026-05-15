GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.is_team_admin(uuid, uuid) TO authenticated, anon;
GRANT EXECUTE ON FUNCTION public.my_team_ids() TO authenticated, anon;