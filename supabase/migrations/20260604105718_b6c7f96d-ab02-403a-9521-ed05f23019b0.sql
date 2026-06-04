
REVOKE EXECUTE ON FUNCTION public.award_user_loyalty(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.award_team_loyalty(uuid, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.award_user_loyalty(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.award_team_loyalty(uuid, integer) TO authenticated;
