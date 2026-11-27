-- Ensure required extensions
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any prior schedule with the same name (idempotent)
DO $$
DECLARE jid bigint;
BEGIN
  SELECT jobid INTO jid FROM cron.job WHERE jobname = 'expire-pro-notify-daily';
  IF jid IS NOT NULL THEN
    PERFORM cron.unschedule(jid);
  END IF;
END $$;

-- Run daily at 09:00 UTC
SELECT cron.schedule(
  'expire-pro-notify-daily',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://wkbxojefiovdczkwhved.supabase.co/functions/v1/expire-pro-notify',
    headers := '{"Content-Type":"application/json","Authorization":"Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndrYnhvamVmaW92ZGN6a3dodmVkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzgwMTA4NTksImV4cCI6MjA5MzU4Njg1OX0.V8vOXm81XDKQyU9yDK2FFrsOd70585-Qj1wrVW92D1w"}'::jsonb,
    body := jsonb_build_object('time', now())
  ) AS request_id;
  $$
);