-- Revoke sensitive UUID columns from anon role to prevent public exposure
-- while keeping the existing RLS SELECT policies intact for authenticated flows.

-- blog_comments: hide user_id from anonymous visitors
REVOKE SELECT (user_id) ON public.blog_comments FROM anon;

-- partners: hide internal submitter/approver UUIDs from anonymous visitors
REVOKE SELECT (submitted_by) ON public.partners FROM anon;
REVOKE SELECT (approved_by) ON public.partners FROM anon;