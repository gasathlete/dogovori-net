CREATE INDEX IF NOT EXISTS idx_risk_analyses_user_created ON public.risk_analyses (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_documents_user_created ON public.saved_documents (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_saved_documents_team_created ON public.saved_documents (team_id, created_at DESC) WHERE team_id IS NOT NULL;