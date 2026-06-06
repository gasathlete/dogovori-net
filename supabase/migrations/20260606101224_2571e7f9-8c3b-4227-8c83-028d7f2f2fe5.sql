-- Allow the invited user to read their own invitation row.
-- Matches either by the authenticated user's verified email (lowercased)
-- or by the unique invitation token (used by accept-invite flows).
CREATE POLICY "team_invitations_invitee_select"
  ON public.team_invitations
  FOR SELECT
  TO authenticated
  USING (
    lower(email) = lower(coalesce(auth.email(), ''))
  );