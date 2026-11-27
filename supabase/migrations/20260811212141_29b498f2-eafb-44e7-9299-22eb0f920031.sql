CREATE OR REPLACE FUNCTION public.purge_old_funnel_events()
RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  DELETE FROM public.funnel_events WHERE created_at < now() - interval '13 months';
$$;

REVOKE ALL ON FUNCTION public.purge_old_funnel_events() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_old_funnel_events() TO service_role;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('purge-funnel-events') WHERE EXISTS (
      SELECT 1 FROM cron.job WHERE jobname = 'purge-funnel-events'
    );
    PERFORM cron.schedule('purge-funnel-events', '0 3 1 * *', 'SELECT public.purge_old_funnel_events();');
  END IF;
END $$;