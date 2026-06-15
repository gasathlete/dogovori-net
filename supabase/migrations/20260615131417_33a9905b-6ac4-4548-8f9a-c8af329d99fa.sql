
REVOKE EXECUTE ON FUNCTION public.sync_plans_into_prompts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.tg_sync_plans_into_prompts() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.render_plans_section_content() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.sync_plans_into_prompts() TO service_role;
GRANT EXECUTE ON FUNCTION public.render_plans_section_content() TO service_role;
