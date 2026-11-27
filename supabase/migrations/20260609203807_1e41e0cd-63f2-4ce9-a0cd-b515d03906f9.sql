-- 1) deal status enum
DO $$ BEGIN
  CREATE TYPE public.deal_status AS ENUM ('draft','negotiating','signing','active','closed','archived');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- 2) deals table
CREATE TABLE IF NOT EXISTS public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL,
  title text NOT NULL DEFAULT 'Нова сделка',
  status public.deal_status NOT NULL DEFAULT 'draft',
  counterparty text,
  counterparty_email text,
  amount_eur numeric(14,2),
  due_date date,
  tags text[] NOT NULL DEFAULT '{}',
  notes text,
  pinned boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS deals_user_idx ON public.deals(user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS deals_team_idx ON public.deals(team_id, updated_at DESC) WHERE team_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS deals_status_idx ON public.deals(status);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.deals TO authenticated;
GRANT ALL ON public.deals TO service_role;

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY "deals_select_owner_or_team" ON public.deals FOR SELECT TO authenticated
USING (
  user_id = auth.uid()
  OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id))
);

CREATE POLICY "deals_insert_self" ON public.deals FOR INSERT TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND (team_id IS NULL OR public.is_team_member(auth.uid(), team_id))
);

CREATE POLICY "deals_update_owner_or_team" ON public.deals FOR UPDATE TO authenticated
USING (
  user_id = auth.uid()
  OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id))
)
WITH CHECK (
  user_id = auth.uid()
  OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id))
);

CREATE POLICY "deals_delete_owner_or_team_admin" ON public.deals FOR DELETE TO authenticated
USING (
  user_id = auth.uid()
  OR (team_id IS NOT NULL AND public.is_team_admin(auth.uid(), team_id))
);

DROP TRIGGER IF EXISTS deals_set_updated_at ON public.deals;
CREATE TRIGGER deals_set_updated_at
  BEFORE UPDATE ON public.deals
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- 3) Optional deal_id columns on existing document tables
ALTER TABLE public.saved_documents     ADD COLUMN IF NOT EXISTS deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL;
ALTER TABLE public.uploaded_contracts  ADD COLUMN IF NOT EXISTS deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL;
ALTER TABLE public.signing_requests    ADD COLUMN IF NOT EXISTS deal_id uuid REFERENCES public.deals(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS saved_documents_deal_idx     ON public.saved_documents(deal_id)    WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS uploaded_contracts_deal_idx  ON public.uploaded_contracts(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS signing_requests_deal_idx    ON public.signing_requests(deal_id)   WHERE deal_id IS NOT NULL;