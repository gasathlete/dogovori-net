REVOKE EXECUTE ON FUNCTION public.get_active_prompt(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_active_prompt(text) TO service_role;