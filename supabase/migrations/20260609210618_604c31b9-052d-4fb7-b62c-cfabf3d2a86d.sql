-- AI audit log: content-free record of every AI gateway call.
CREATE TABLE public.ai_audit_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  team_id UUID REFERENCES public.teams(id) ON DELETE SET NULL,
  operation TEXT NOT NULL,
  model TEXT NOT NULL,
  fallback_used BOOLEAN NOT NULL DEFAULT false,
  fallback_model TEXT,
  risk_level TEXT NOT NULL CHECK (risk_level IN ('low','medium','high','blocked')),
  redaction_applied BOOLEAN NOT NULL DEFAULT false,
  contains_personal_data BOOLEAN NOT NULL DEFAULT false,
  contains_special_category_data BOOLEAN NOT NULL DEFAULT false,
  tokens_in INTEGER,
  tokens_out INTEGER,
  status TEXT NOT NULL CHECK (status IN ('ok','blocked','error')),
  error_code TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_audit_log_user_created ON public.ai_audit_log (user_id, created_at DESC);
CREATE INDEX idx_ai_audit_log_team_created ON public.ai_audit_log (team_id, created_at DESC) WHERE team_id IS NOT NULL;
CREATE INDEX idx_ai_audit_log_created ON public.ai_audit_log (created_at);

GRANT SELECT ON public.ai_audit_log TO authenticated;
GRANT ALL ON public.ai_audit_log TO service_role;

ALTER TABLE public.ai_audit_log ENABLE ROW LEVEL SECURITY;

-- Users can read their own audit entries.
CREATE POLICY "Users read own ai_audit_log"
ON public.ai_audit_log
FOR SELECT
TO authenticated
USING (user_id = auth.uid());

-- Staff can read all entries for support.
CREATE POLICY "Staff read all ai_audit_log"
ON public.ai_audit_log
FOR SELECT
TO authenticated
USING (public.is_staff(auth.uid()));

-- Inserts only happen via service_role (edge functions); no INSERT policy for authenticated.
