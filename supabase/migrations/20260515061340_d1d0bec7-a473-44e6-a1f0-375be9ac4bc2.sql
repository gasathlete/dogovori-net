
-- 1) Lock down SECURITY DEFINER helper/internal functions: revoke EXECUTE from public, anon, authenticated.
-- They remain callable from RLS expressions, triggers, and service_role / edge functions.
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_staff(uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_team_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_team_admin(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.my_team_ids() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.refund_quota(uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.consume_team_quota(uuid) FROM PUBLIC, anon, authenticated;

-- Re-grant has_role/is_staff to authenticated since the client uses them via RPC for role checks (Admin / Account pages).
GRANT EXECUTE ON FUNCTION public.is_staff(uuid) TO authenticated;

-- consume_quota is called from edge functions with the user's JWT (analyze-contract, download-blank).
-- Keep authenticated EXECUTE; explicit re-grant for clarity.
GRANT EXECUTE ON FUNCTION public.consume_quota(text) TO authenticated;

-- get_post_rating is read by anon + authenticated on the blog (BlogRatingAndComments).
GRANT EXECUTE ON FUNCTION public.get_post_rating(public.blog_post_type, text) TO anon, authenticated;

-- Admin RPCs called from Admin page; they enforce is_staff() inside.
GRANT EXECUTE ON FUNCTION public.admin_set_role(uuid, public.app_role, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_set_pro(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_revoke_pro(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_add_bonus_contracts(uuid, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, integer) TO authenticated;

-- 2) partners: hide sensitive admin/submitter UUIDs from public listings.
REVOKE SELECT (submitted_by, approved_by, approved_at) ON public.partners FROM anon, authenticated;

-- 3) blog_ratings: don't expose user_id publicly. Aggregate is available via get_post_rating().
REVOKE SELECT (user_id) ON public.blog_ratings FROM anon, authenticated;

-- 4) blog_comments: don't expose user_id publicly. Comments are joined to profiles in the UI.
REVOKE SELECT (user_id) ON public.blog_comments FROM anon;
-- Authenticated still needs user_id to know which comment is theirs (edit/delete UI).

-- 5) Storage: prevent anonymous listing of team-assets bucket.
-- Public URLs continue to work via the CDN (public bucket flag) without RLS evaluation;
-- the SELECT policy below only governs the storage API listing/download path.
DROP POLICY IF EXISTS "team_assets_read" ON storage.objects;
CREATE POLICY "team_assets_read_member"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'team-assets'
  AND is_team_member(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

-- 6) Storage: scope user-articles bucket SELECT to authenticated owners only;
-- public images are served via the public CDN URL and don't need a broad SELECT policy.
DROP POLICY IF EXISTS "user_articles_images_public_read" ON storage.objects;
CREATE POLICY "user_articles_images_owner_read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'user-articles'
  AND (auth.uid())::text = (storage.foldername(name))[1]
);
