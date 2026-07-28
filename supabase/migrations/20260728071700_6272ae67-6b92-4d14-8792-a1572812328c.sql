GRANT INSERT ON public.funnel_events TO anon;
GRANT INSERT, SELECT ON public.funnel_events TO authenticated;
GRANT ALL ON public.funnel_events TO service_role;