ALTER TABLE public.home_testimonials
  ADD COLUMN IF NOT EXISTS about text,
  ADD COLUMN IF NOT EXISTS consent_public boolean NOT NULL DEFAULT false;