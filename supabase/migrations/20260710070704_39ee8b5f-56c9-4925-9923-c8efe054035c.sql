
-- Strict document unlocks: one-off 0.40€ payment that unlocks a specific
-- wizard-generated contract for 24h. Free users see a blurred preview and
-- must either subscribe or buy this unlock to download.

CREATE TABLE public.strict_doc_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  doc_key text NOT NULL,
  sector_id text,
  doc_name text,
  paid_price_eur numeric(6,2) NOT NULL DEFAULT 0.40,
  stripe_session_id text,
  environment text NOT NULL DEFAULT 'sandbox',
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours'),
  UNIQUE (user_id, doc_key)
);

CREATE INDEX idx_strict_doc_unlocks_user ON public.strict_doc_unlocks(user_id);
CREATE INDEX idx_strict_doc_unlocks_lookup ON public.strict_doc_unlocks(user_id, doc_key, expires_at);

GRANT SELECT ON public.strict_doc_unlocks TO authenticated;
GRANT ALL ON public.strict_doc_unlocks TO service_role;

ALTER TABLE public.strict_doc_unlocks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own unlocks"
  ON public.strict_doc_unlocks
  FOR SELECT
  USING (auth.uid() = user_id);

-- Inserts happen only from the Stripe webhook via service role.
