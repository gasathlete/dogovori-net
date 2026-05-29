
-- 1) Partners: hide internal user UUIDs from anonymous visitors via column-level grants.
REVOKE SELECT ON public.partners FROM anon;
GRANT SELECT (
  id, name, website_url, logo_url, status, display_order,
  created_at, updated_at, approved_at
) ON public.partners TO anon;

-- 2) user_articles: hide author/reviewer UUIDs and rejection_reason from anonymous visitors.
REVOKE SELECT ON public.user_articles FROM anon;
GRANT SELECT (
  id, slug, title, summary, intro, sections, takeaways, faq,
  image_url, category, status, source, word_count, meta_description,
  published_at, created_at, updated_at, reviewed_at
) ON public.user_articles TO anon;

-- 3) Storage: let team members read contract files belonging to records they
--    can already access via uploaded_contracts/saved_documents RLS.
DROP POLICY IF EXISTS "user_contracts_team_select" ON storage.objects;
CREATE POLICY "user_contracts_team_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'user-contracts'
  AND (
    EXISTS (
      SELECT 1 FROM public.uploaded_contracts uc
      WHERE uc.storage_path = storage.objects.name
        AND uc.team_id IS NOT NULL
        AND public.is_team_member(auth.uid(), uc.team_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.saved_documents sd
      WHERE sd.team_id IS NOT NULL
        AND public.is_team_member(auth.uid(), sd.team_id)
        AND sd.payload ->> 'storage_path' = storage.objects.name
    )
  )
);

-- 4) Fix mutable search_path on admin helper functions.
ALTER FUNCTION public.admin_set_role(uuid, public.app_role, boolean) SET search_path = public;
ALTER FUNCTION public.admin_set_pro(uuid, integer) SET search_path = public;
ALTER FUNCTION public.admin_revoke_pro(uuid) SET search_path = public;
ALTER FUNCTION public.admin_add_bonus_contracts(uuid, integer) SET search_path = public;
