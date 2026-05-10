-- Roles enum for team members
CREATE TYPE public.team_role AS ENUM ('owner', 'admin', 'member');

-- Teams table
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  owner_id uuid NOT NULL,
  stripe_subscription_id text,
  stripe_customer_id text,
  seat_count integer NOT NULL DEFAULT 3,
  logo_url text,
  brand_color text,
  vat_data jsonb,
  status text NOT NULL DEFAULT 'active',
  environment text NOT NULL DEFAULT 'sandbox',
  current_period_start timestamptz,
  current_period_end timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  role public.team_role NOT NULL DEFAULT 'member',
  invited_at timestamptz NOT NULL DEFAULT now(),
  joined_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (team_id, user_id)
);
CREATE INDEX idx_team_members_user ON public.team_members(user_id);
CREATE INDEX idx_team_members_team ON public.team_members(team_id);

CREATE TABLE public.team_invitations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  email text NOT NULL,
  token text NOT NULL UNIQUE,
  invited_by uuid NOT NULL,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '14 days'),
  accepted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_team_invitations_team ON public.team_invitations(team_id);
CREATE INDEX idx_team_invitations_email ON public.team_invitations(lower(email));

CREATE TABLE public.team_audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  user_id uuid,
  action text NOT NULL,
  target_type text,
  target_id text,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_team_audit_log_team_created ON public.team_audit_log(team_id, created_at DESC);

CREATE TABLE public.team_usage (
  team_id uuid PRIMARY KEY REFERENCES public.teams(id) ON DELETE CASCADE,
  ops_used integer NOT NULL DEFAULT 0,
  period_start timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Add team_id to documents (nullable — personal docs continue to work)
ALTER TABLE public.saved_documents ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;
ALTER TABLE public.uploaded_contracts ADD COLUMN team_id uuid REFERENCES public.teams(id) ON DELETE SET NULL;

-- Helper: is the user a member of the given team?
CREATE OR REPLACE FUNCTION public.is_team_member(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id AND team_id = _team_id
  )
$$;

CREATE OR REPLACE FUNCTION public.is_team_admin(_user_id uuid, _team_id uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.team_members
    WHERE user_id = _user_id AND team_id = _team_id
      AND role IN ('owner','admin')
  )
$$;

-- Convenience: get current user's team_ids
CREATE OR REPLACE FUNCTION public.my_team_ids()
RETURNS SETOF uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT team_id FROM public.team_members WHERE user_id = auth.uid()
$$;

-- Enable RLS
ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_invitations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.team_usage ENABLE ROW LEVEL SECURITY;

-- RLS: teams
CREATE POLICY teams_select_member ON public.teams
  FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), id));
CREATE POLICY teams_update_admin ON public.teams
  FOR UPDATE TO authenticated
  USING (public.is_team_admin(auth.uid(), id))
  WITH CHECK (public.is_team_admin(auth.uid(), id));
CREATE POLICY teams_service_role ON public.teams
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RLS: team_members
CREATE POLICY team_members_select ON public.team_members
  FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), team_id));
CREATE POLICY team_members_admin_manage ON public.team_members
  FOR ALL TO authenticated
  USING (public.is_team_admin(auth.uid(), team_id))
  WITH CHECK (public.is_team_admin(auth.uid(), team_id));
CREATE POLICY team_members_service_role ON public.team_members
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RLS: team_invitations (admins only see/manage)
CREATE POLICY team_invitations_admin ON public.team_invitations
  FOR ALL TO authenticated
  USING (public.is_team_admin(auth.uid(), team_id))
  WITH CHECK (public.is_team_admin(auth.uid(), team_id));
CREATE POLICY team_invitations_service_role ON public.team_invitations
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RLS: team_audit_log (admins only)
CREATE POLICY team_audit_log_admin ON public.team_audit_log
  FOR SELECT TO authenticated
  USING (public.is_team_admin(auth.uid(), team_id));
CREATE POLICY team_audit_log_service_role ON public.team_audit_log
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- RLS: team_usage (members can see their team's usage)
CREATE POLICY team_usage_select ON public.team_usage
  FOR SELECT TO authenticated
  USING (public.is_team_member(auth.uid(), team_id));
CREATE POLICY team_usage_service_role ON public.team_usage
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Extend saved_documents RLS to include team-shared docs
DROP POLICY IF EXISTS saved_documents_all_own ON public.saved_documents;
CREATE POLICY saved_documents_all_own ON public.saved_documents
  FOR ALL TO authenticated
  USING (auth.uid() = user_id OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)))
  WITH CHECK (auth.uid() = user_id OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)));

DROP POLICY IF EXISTS uploaded_contracts_all_own ON public.uploaded_contracts;
CREATE POLICY uploaded_contracts_all_own ON public.uploaded_contracts
  FOR ALL TO authenticated
  USING (auth.uid() = user_id OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)))
  WITH CHECK (auth.uid() = user_id OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)));

-- Updated_at trigger for teams
CREATE TRIGGER teams_updated_at
  BEFORE UPDATE ON public.teams
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RPC: consume team quota (per-seat 100/month pooled)
CREATE OR REPLACE FUNCTION public.consume_team_quota(_team_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  _team public.teams%ROWTYPE;
  _usage public.team_usage%ROWTYPE;
  _cap integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_team_member(auth.uid(), _team_id) THEN
    RAISE EXCEPTION 'not_team_member' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _team FROM public.teams WHERE id = _team_id FOR UPDATE;
  IF NOT FOUND OR _team.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'team_inactive');
  END IF;

  _cap := _team.seat_count * 100;

  SELECT * INTO _usage FROM public.team_usage WHERE team_id = _team_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.team_usage (team_id) VALUES (_team_id) RETURNING * INTO _usage;
  END IF;

  -- Roll the period if 30+ days elapsed
  IF now() - _usage.period_start >= interval '30 days' THEN
    UPDATE public.team_usage SET ops_used = 0, period_start = now(), updated_at = now()
      WHERE team_id = _team_id;
    _usage.ops_used := 0;
  END IF;

  IF _usage.ops_used >= _cap THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'team_limit_reached',
                              'ops_used', _usage.ops_used, 'cap', _cap);
  END IF;

  UPDATE public.team_usage
     SET ops_used = ops_used + 1, updated_at = now()
   WHERE team_id = _team_id;

  RETURN jsonb_build_object('ok', true, 'ops_used', _usage.ops_used + 1, 'cap', _cap);
END;
$$;