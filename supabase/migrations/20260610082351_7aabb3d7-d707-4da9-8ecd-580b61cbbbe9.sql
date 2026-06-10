
-- ============================================================
-- Wave A: post-launch compliance scaffolding
-- ============================================================

-- 1) AI post-market monitoring metrics (AI Act Art. 72)
CREATE TABLE public.ai_post_market_metrics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  operation text NOT NULL,
  total_calls integer NOT NULL DEFAULT 0,
  blocked_count integer NOT NULL DEFAULT 0,
  redaction_count integer NOT NULL DEFAULT 0,
  fallback_count integer NOT NULL DEFAULT 0,
  special_category_blocks integer NOT NULL DEFAULT 0,
  user_complaints integer NOT NULL DEFAULT 0,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (date, operation)
);

GRANT SELECT ON public.ai_post_market_metrics TO authenticated;
GRANT ALL ON public.ai_post_market_metrics TO service_role;

ALTER TABLE public.ai_post_market_metrics ENABLE ROW LEVEL SECURITY;

CREATE POLICY ai_pmm_staff_read ON public.ai_post_market_metrics
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));
CREATE POLICY ai_pmm_service ON public.ai_post_market_metrics
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_ai_pmm_date ON public.ai_post_market_metrics(date DESC);

-- 2) Vendor / subprocessor assessments (GDPR Art. 28)
CREATE TABLE public.vendor_assessments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vendor_name text NOT NULL UNIQUE,
  category text NOT NULL,
  role text NOT NULL,
  country text,
  dpa_url text,
  scc_signed boolean NOT NULL DEFAULT false,
  scc_module text,
  soc2_url text,
  iso27001 boolean NOT NULL DEFAULT false,
  security_contact text,
  last_reviewed_at date,
  next_review_at date,
  status text NOT NULL DEFAULT 'pending',
  risk_level text NOT NULL DEFAULT 'medium',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.vendor_assessments TO authenticated;
GRANT ALL ON public.vendor_assessments TO service_role;

ALTER TABLE public.vendor_assessments ENABLE ROW LEVEL SECURITY;

CREATE POLICY vendor_assessments_staff ON public.vendor_assessments
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY vendor_assessments_service ON public.vendor_assessments
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 3) Breach incidents (GDPR Art. 33-34)
CREATE TABLE public.breach_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  detected_at timestamptz NOT NULL,
  reported_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  category text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  affected_subjects_count integer NOT NULL DEFAULT 0,
  data_categories text[] NOT NULL DEFAULT '{}',
  description text NOT NULL,
  risk_assessment text,
  root_cause text,
  remediation text,
  kzld_notified_at timestamptz,
  kzld_reference text,
  subjects_notified_at timestamptz,
  status text NOT NULL DEFAULT 'open',
  closed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.breach_incidents TO authenticated;
GRANT ALL ON public.breach_incidents TO service_role;

ALTER TABLE public.breach_incidents ENABLE ROW LEVEL SECURITY;

CREATE POLICY breach_incidents_staff ON public.breach_incidents
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY breach_incidents_service ON public.breach_incidents
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_breach_incidents_status ON public.breach_incidents(status, detected_at DESC);

-- 4) Staff training register (SOC2 CC1.4 / GDPR Art. 39)
CREATE TABLE public.staff_training (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  document_key text NOT NULL,
  document_version text NOT NULL,
  acknowledged_at timestamptz NOT NULL DEFAULT now(),
  ip inet,
  UNIQUE (user_id, document_key, document_version)
);

GRANT SELECT, INSERT ON public.staff_training TO authenticated;
GRANT ALL ON public.staff_training TO service_role;

ALTER TABLE public.staff_training ENABLE ROW LEVEL SECURITY;

CREATE POLICY staff_training_self_read ON public.staff_training
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_staff(auth.uid()));
CREATE POLICY staff_training_self_insert ON public.staff_training
  FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());
CREATE POLICY staff_training_service ON public.staff_training
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 5) Legal versions (changelog of legal documents)
CREATE TABLE public.legal_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  doc_key text NOT NULL,
  version text NOT NULL,
  effective_at date NOT NULL,
  summary text NOT NULL,
  changelog_md text,
  material_change boolean NOT NULL DEFAULT false,
  published_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (doc_key, version)
);

GRANT SELECT ON public.legal_versions TO anon, authenticated;
GRANT ALL ON public.legal_versions TO service_role;

ALTER TABLE public.legal_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY legal_versions_public_read ON public.legal_versions
  FOR SELECT TO anon, authenticated USING (true);
CREATE POLICY legal_versions_staff_write ON public.legal_versions
  FOR ALL TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));
CREATE POLICY legal_versions_service ON public.legal_versions
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE INDEX idx_legal_versions_doc ON public.legal_versions(doc_key, effective_at DESC);

-- 6) Extend restore_drills with tabletop flag
ALTER TABLE public.restore_drills
  ADD COLUMN IF NOT EXISTS tabletop_exercise boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS scenario text;

-- 7) updated_at triggers
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_ai_pmm_updated BEFORE UPDATE ON public.ai_post_market_metrics
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_vendor_assessments_updated BEFORE UPDATE ON public.vendor_assessments
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER trg_breach_incidents_updated BEFORE UPDATE ON public.breach_incidents
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- ============================================================
-- Seed data
-- ============================================================

INSERT INTO public.vendor_assessments
  (vendor_name, category, role, country, dpa_url, scc_signed, scc_module, soc2_url, iso27001, security_contact, last_reviewed_at, next_review_at, status, risk_level, notes)
VALUES
  ('Lovable Cloud (Supabase)', 'Infrastructure / DB / Auth / Storage', 'Processor', 'EU (Frankfurt)', 'https://supabase.com/legal/dpa', true, 'Module 2 / 3', 'https://supabase.com/security', true, 'security@supabase.io', '2026-06-10', '2027-06-10', 'approved', 'low', 'Primary backend, EU region, SOC2 Type II + ISO 27001.'),
  ('Lovable AI Gateway', 'AI inference proxy', 'Processor', 'EU/US', 'https://lovable.dev/legal/dpa', true, 'Module 2', NULL, false, 'security@lovable.dev', '2026-06-10', '2027-06-10', 'approved', 'medium', 'Routes prompts to Gemini 2.5 family; classification + redaction enforced upstream.'),
  ('Stripe', 'Payments', 'Processor (independent controller for fraud)', 'IE (EU HQ)', 'https://stripe.com/legal/dpa', true, 'Module 2', 'https://stripe.com/docs/security/stripe', true, 'security@stripe.com', '2026-06-10', '2027-06-10', 'approved', 'low', 'Embedded checkout; no card data touches our servers.'),
  ('Resend', 'Transactional email', 'Processor', 'US', 'https://resend.com/legal/dpa', true, 'Module 2', 'https://resend.com/security', false, 'security@resend.com', '2026-06-10', '2027-06-10', 'approved', 'medium', 'Outbound email only; suppression list synced.'),
  ('Cloudflare', 'DNS / CDN / WAF', 'Processor', 'US (EU edge)', 'https://www.cloudflare.com/cloudflare-customer-dpa/', true, 'Module 2', 'https://www.cloudflare.com/trust-hub/compliance-resources/', true, 'security@cloudflare.com', '2026-06-10', '2027-06-10', 'approved', 'low', 'DNS and edge; no application data stored.')
ON CONFLICT (vendor_name) DO NOTHING;

INSERT INTO public.legal_versions (doc_key, version, effective_at, summary, changelog_md, material_change) VALUES
  ('terms',      '2026-06-25', '2026-06-25', 'Initial public version at launch.', 'Първоначална версия на Общите условия.', true),
  ('privacy',    '2026-06-25', '2026-06-25', 'Initial public version at launch.', 'Първоначална версия на Политиката за поверителност (GDPR).', true),
  ('cookies',    '2026-06-25', '2026-06-25', 'Initial public version at launch.', 'Първоначална версия на Политика за бисквитки (ЗЕТ чл. 4а).', true),
  ('dpa',        '2026-06-25', '2026-06-25', 'Initial public version at launch.', 'Първоначална версия на DPA / Споразумение за обработка на данни.', true),
  ('refund',     '2026-06-25', '2026-06-25', 'Initial public version at launch.', 'Първоначална версия на Политика за връщане и възстановяване.', true),
  ('withdrawal', '2026-06-25', '2026-06-25', 'Initial public version at launch.', 'Първоначална версия на Формуляр за отказ (ЗЗП).', true)
ON CONFLICT (doc_key, version) DO NOTHING;

INSERT INTO public.compliance_items (framework, control_ref, title, status, owner_role, evidence_url, evidence_notes, due_date, priority)
VALUES
  ('AI_ACT', 'ART11',     'Technical documentation file',         'in_progress', 'DPO',   '/docs/AI_ACT_TECHNICAL_FILE.md', 'Maintained alongside model-router policy.',                       '2026-07-25', 'high'),
  ('AI_ACT', 'ART13',     'Transparency obligations',             'done',        'DPO',   '/legal/ai-processing-policy',    'AI disclaimer + per-operation labelling.',                        NULL,         'high'),
  ('AI_ACT', 'ART27',     'Fundamental Rights Impact Assessment', 'in_progress', 'DPO',   '/docs/FRIA.md',                  'Limited-risk AI; FRIA voluntarily maintained.',                   '2026-07-25', 'medium'),
  ('AI_ACT', 'ART50',     'Generative AI labelling',              'done',        'DPO',   '/legal/ai-processing-policy',    'Outputs labelled as AI-generated; user disclaimer required.',     NULL,         'high'),
  ('AI_ACT', 'ART72',     'Post-market monitoring',               'in_progress', 'DPO',   '/admin/ai-post-market',          'Daily rollup job feeds ai_post_market_metrics.',                  '2026-07-25', 'high'),
  ('GDPR',   'ART33',     'Breach notification workflow (72h)',   'in_progress', 'DPO',   '/admin/breaches',                'breach_incidents table + playbook.',                              '2026-07-25', 'high'),
  ('GDPR',   'ART35',     'DPIA maintenance',                     'done',        'DPO',   '/legal/dpia-summary',            'Public summary live; full DPIA retained internally.',             NULL,         'high'),
  ('GDPR',   'VENDOR_DD', 'Subprocessor due diligence',           'in_progress', 'DPO',   '/admin/vendors',                 'Annual review per vendor.',                                       '2026-07-25', 'high'),
  ('SOC2',   'CC7.2',     'Continuous monitoring',                'in_progress', 'Owner', '/admin/ai-post-market',          'Audit logs + anomaly review.',                                    '2026-09-25', 'medium'),
  ('SOC2',   'CC9.1',     'Vendor risk management',               'in_progress', 'Owner', '/admin/vendors',                 'Vendor assessments + reviews.',                                   '2026-09-25', 'medium')
ON CONFLICT DO NOTHING;
