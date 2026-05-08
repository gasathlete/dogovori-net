-- AI usage tracking for rate limiting on generate-contract
CREATE TABLE public.ai_usage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid,
  ip_hash text,
  function_name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_ai_usage_user_created ON public.ai_usage(user_id, created_at DESC);
CREATE INDEX idx_ai_usage_ip_created ON public.ai_usage(ip_hash, created_at DESC);

ALTER TABLE public.ai_usage ENABLE ROW LEVEL SECURITY;

-- Only the service role (used by edge functions) can read or write.
-- No public policies — table is invisible to authenticated users by design.

-- Soft-delete for contacts so saved_documents references are preserved
ALTER TABLE public.contacts ADD COLUMN deleted_at timestamptz;
CREATE INDEX idx_contacts_user_active ON public.contacts(user_id) WHERE deleted_at IS NULL;