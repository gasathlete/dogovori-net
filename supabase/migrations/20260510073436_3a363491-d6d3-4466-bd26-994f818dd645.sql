REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.is_team_admin(uuid, uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.my_team_ids() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.consume_team_quota(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_team_admin(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.my_team_ids() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.consume_team_quota(uuid) TO authenticated, service_role;