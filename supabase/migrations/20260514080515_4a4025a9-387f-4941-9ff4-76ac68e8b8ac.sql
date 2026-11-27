
-- Stage 1: Branding + shared contacts

-- Add branding columns to teams (logo_url, brand_color already exist)
ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS letterhead_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS signature_data_url text,
  ADD COLUMN IF NOT EXISTS signature_name text,
  ADD COLUMN IF NOT EXISTS company_eik text,
  ADD COLUMN IF NOT EXISTS company_vat text,
  ADD COLUMN IF NOT EXISTS company_address text,
  ADD COLUMN IF NOT EXISTS company_mol text,
  ADD COLUMN IF NOT EXISTS company_email text,
  ADD COLUMN IF NOT EXISTS company_phone text,
  ADD COLUMN IF NOT EXISTS company_website text;

-- Add team_id to contacts for shared company contacts
ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS team_id uuid;

CREATE INDEX IF NOT EXISTS idx_contacts_team_id ON public.contacts(team_id) WHERE team_id IS NOT NULL;

-- Replace RLS policy on contacts to allow team access
DROP POLICY IF EXISTS contacts_all_own ON public.contacts;

CREATE POLICY contacts_select ON public.contacts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)));

CREATE POLICY contacts_insert ON public.contacts
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id AND (team_id IS NULL OR public.is_team_member(auth.uid(), team_id)));

CREATE POLICY contacts_update ON public.contacts
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR (team_id IS NOT NULL AND public.is_team_admin(auth.uid(), team_id)))
  WITH CHECK (auth.uid() = user_id OR (team_id IS NOT NULL AND public.is_team_admin(auth.uid(), team_id)));

CREATE POLICY contacts_delete ON public.contacts
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR (team_id IS NOT NULL AND public.is_team_admin(auth.uid(), team_id)));

-- Storage bucket for team assets (logos, signatures)
INSERT INTO storage.buckets (id, name, public)
VALUES ('team-assets', 'team-assets', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policies for team-assets: team members can read; admins can write
CREATE POLICY "team_assets_read" ON storage.objects
  FOR SELECT TO public
  USING (bucket_id = 'team-assets');

CREATE POLICY "team_assets_admin_write" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'team-assets'
    AND public.is_team_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "team_assets_admin_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'team-assets'
    AND public.is_team_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
  );

CREATE POLICY "team_assets_admin_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'team-assets'
    AND public.is_team_admin(auth.uid(), (storage.foldername(name))[1]::uuid)
  );
