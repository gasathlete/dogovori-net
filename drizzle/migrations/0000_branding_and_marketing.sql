CREATE TABLE public.branding_profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  name text NOT NULL DEFAULT 'Основен стил',
  is_active boolean NOT NULL DEFAULT true,
  settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.branding_profiles TO authenticated;
GRANT ALL ON public.branding_profiles TO service_role;

ALTER TABLE public.branding_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own branding profiles select" ON public.branding_profiles
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own branding profiles insert" ON public.branding_profiles
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own branding profiles update" ON public.branding_profiles
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own branding profiles delete" ON public.branding_profiles
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX branding_profiles_user_idx ON public.branding_profiles (user_id);
CREATE UNIQUE INDEX branding_profiles_one_active ON public.branding_profiles (user_id) WHERE is_active;

CREATE TABLE public.branding_unlocks (
  user_id uuid PRIMARY KEY,
  source text NOT NULL DEFAULT 'purchase',
  stripe_session_id text,
  environment text,
  amount_eur numeric(10,2),
  unlocked_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.branding_unlocks TO authenticated;
GRANT ALL ON public.branding_unlocks TO service_role;

ALTER TABLE public.branding_unlocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own branding unlock select" ON public.branding_unlocks
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.marketing_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  template_key text NOT NULL,
  title text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.marketing_documents TO authenticated;
GRANT ALL ON public.marketing_documents TO service_role;

ALTER TABLE public.marketing_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own marketing docs select" ON public.marketing_documents
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "own marketing docs insert" ON public.marketing_documents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own marketing docs update" ON public.marketing_documents
  FOR UPDATE TO authenticated USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "own marketing docs delete" ON public.marketing_documents
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE INDEX marketing_documents_user_idx ON public.marketing_documents (user_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER branding_profiles_touch BEFORE UPDATE ON public.branding_profiles
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
CREATE TRIGGER marketing_documents_touch BEFORE UPDATE ON public.marketing_documents
  FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();