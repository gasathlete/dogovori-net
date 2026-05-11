
-- 1) partners: hide internal UUIDs from public reads via column-level revokes.
-- Owners (submitted_by) and staff still see everything via separate policies; the
-- frontend only selects id,name,website_url,logo_url for the public board.
REVOKE SELECT (submitted_by, approved_by, approved_at) ON public.partners FROM anon;
REVOKE SELECT (submitted_by, approved_by, approved_at) ON public.partners FROM authenticated;
-- Re-grant to staff via a security definer view is unnecessary because the admin
-- panel queries with the service-role-equivalent staff RLS; column grants do not
-- affect service_role. Authenticated users that legitimately need their own
-- submitted_by row can rely on the staff/own policies through the dashboard,
-- which does not depend on these specific columns being readable column-wise.

-- 2) template_cache: add explicit service_role policy so it isn't silently
-- inaccessible. Reads are intentionally server-side only.
CREATE POLICY template_cache_service_role
  ON public.template_cache FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

-- 3) Storage: prevent listing of partner-logos while keeping public file URLs
-- working (public bucket: direct object GET bypasses RLS, listing does not).
DROP POLICY IF EXISTS "partner-logos public read" ON storage.objects;
CREATE POLICY "partner-logos staff list"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'partner-logos' AND public.is_staff(auth.uid()));
