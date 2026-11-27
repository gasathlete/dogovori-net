
-- 1) blog_comments: hide user_id from anonymous visitors
REVOKE SELECT ON public.blog_comments FROM anon;
GRANT SELECT (id, content, created_at, updated_at, post_type, post_slug) ON public.blog_comments TO anon;

-- 2) signing_request_signers: hide sensitive columns from authenticated clients.
-- Service role retains full access for edge functions.
REVOKE SELECT ON public.signing_request_signers FROM authenticated;
GRANT SELECT (
  id, request_id, name, email, role, order_idx, status,
  signed_at, declined_at, viewed_at, sign_token, created_at
) ON public.signing_request_signers TO authenticated;

-- 3) user_roles: restrict policies to authenticated role instead of public
ALTER POLICY user_roles_admin_manage ON public.user_roles TO authenticated;
ALTER POLICY user_roles_select_own ON public.user_roles TO authenticated;
