CREATE TABLE public.shared_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id uuid NOT NULL,
  owner_id uuid NOT NULL,
  token text NOT NULL UNIQUE,
  expires_at timestamptz NOT NULL,
  viewed_at timestamptz,
  signed_at timestamptz,
  signed_signature text,
  signer_name text,
  signer_ip_hash text,
  revoked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shared_links_token_idx ON public.shared_links(token);
CREATE INDEX shared_links_owner_idx ON public.shared_links(owner_id, created_at DESC);

ALTER TABLE public.shared_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY "shared_links_select_own"
  ON public.shared_links FOR SELECT
  USING (auth.uid() = owner_id);

CREATE POLICY "shared_links_update_own"
  ON public.shared_links FOR UPDATE
  USING (auth.uid() = owner_id);

CREATE POLICY "shared_links_service_role"
  ON public.shared_links FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);