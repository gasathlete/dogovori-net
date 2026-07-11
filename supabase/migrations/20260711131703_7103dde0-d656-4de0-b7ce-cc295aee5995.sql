CREATE INDEX IF NOT EXISTS idx_saved_documents_user_created ON public.saved_documents (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_risk_analyses_user_created ON public.risk_analyses (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_session_path_event_created ON public.page_views (session_id, path, event, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_page_views_created_at ON public.page_views (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_download_quota_user ON public.download_quota (user_id);
CREATE INDEX IF NOT EXISTS idx_team_members_user ON public.team_members (user_id);
CREATE INDEX IF NOT EXISTS idx_partners_status_order ON public.partners (status, display_order DESC);