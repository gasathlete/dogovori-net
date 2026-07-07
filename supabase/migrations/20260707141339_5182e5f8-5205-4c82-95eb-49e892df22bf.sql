-- 1) ai_prompt_sections: split ALL policy into explicit per-command policies scoped to authenticated staff
REVOKE ALL ON public.ai_prompt_sections FROM anon;

DROP POLICY IF EXISTS ai_prompt_sections_staff_all ON public.ai_prompt_sections;

CREATE POLICY ai_prompt_sections_staff_select
  ON public.ai_prompt_sections
  FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));

CREATE POLICY ai_prompt_sections_staff_insert
  ON public.ai_prompt_sections
  FOR INSERT
  TO authenticated
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY ai_prompt_sections_staff_update
  ON public.ai_prompt_sections
  FOR UPDATE
  TO authenticated
  USING (public.is_staff(auth.uid()))
  WITH CHECK (public.is_staff(auth.uid()));

CREATE POLICY ai_prompt_sections_staff_delete
  ON public.ai_prompt_sections
  FOR DELETE
  TO authenticated
  USING (public.is_staff(auth.uid()));

-- 2) storage user-contracts: restrict role scope from public to authenticated
ALTER POLICY user_contracts_select_own ON storage.objects TO authenticated;
ALTER POLICY user_contracts_insert_own ON storage.objects TO authenticated;
ALTER POLICY user_contracts_update_own ON storage.objects TO authenticated;
ALTER POLICY user_contracts_delete_own ON storage.objects TO authenticated;

-- 3) team_invitations: revoke anon access and tighten invitee visibility
REVOKE ALL ON public.team_invitations FROM anon;

DROP POLICY IF EXISTS team_invitations_invitee_select ON public.team_invitations;

CREATE POLICY team_invitations_invitee_select
  ON public.team_invitations
  FOR SELECT
  TO authenticated
  USING (
    lower(email) = lower(COALESCE(auth.email(), ''::text))
    AND accepted_at IS NULL
    AND (expires_at IS NULL OR expires_at > now())
  );