
CREATE TABLE public.user_consents (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  consent_type TEXT NOT NULL CHECK (consent_type IN ('terms','privacy','marketing','ai_disclaimer','cookies','age_18')),
  document_version TEXT NOT NULL,
  granted BOOLEAN NOT NULL DEFAULT true,
  granted_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  ip_hash TEXT,
  user_agent TEXT,
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_user_consents_user ON public.user_consents(user_id, consent_type);

ALTER TABLE public.user_consents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "user_consents_select_own" ON public.user_consents
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "user_consents_insert_own" ON public.user_consents
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "user_consents_update_own" ON public.user_consents
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "user_consents_service_role" ON public.user_consents
  FOR ALL TO service_role USING (true) WITH CHECK (true);
