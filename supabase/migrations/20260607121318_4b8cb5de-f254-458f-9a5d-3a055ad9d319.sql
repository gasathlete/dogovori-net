ALTER TABLE public.download_quota
  ADD COLUMN IF NOT EXISTS free_signing_used boolean NOT NULL DEFAULT false;

-- Reset for all currently free users so each gets one free online-signing export.
UPDATE public.download_quota
   SET free_signing_used = false
 WHERE plan = 'free'::public.user_plan
   AND (pro_until IS NULL OR pro_until <= now());