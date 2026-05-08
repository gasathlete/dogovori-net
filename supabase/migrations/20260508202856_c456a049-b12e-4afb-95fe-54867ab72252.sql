-- Audit log for compliance / GDPR
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb,
  ip_hash text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_log_user_created ON public.audit_log(user_id, created_at DESC);
CREATE INDEX idx_audit_log_action_created ON public.audit_log(action, created_at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY audit_log_select_own ON public.audit_log
  FOR SELECT USING (auth.uid() = user_id);

CREATE POLICY audit_log_service_role ON public.audit_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Lock down ai_usage: only service role writes/reads (currently has no policies)
ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;
CREATE POLICY ai_usage_service_role ON public.ai_usage
  FOR ALL TO service_role USING (true) WITH CHECK (true);