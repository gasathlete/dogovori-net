-- ACL hardening for public.credit_topup_ops.
--
-- Context: an earlier migration granted EXECUTE to authenticated, which defeats
-- the intended service-role-only boundary. This migration removes that
-- inherited grant and leaves execution restricted to service_role only.
--
-- No function body, ownership, tables, rows, or previous migrations are changed.

REVOKE ALL PRIVILEGES ON FUNCTION public.credit_topup_ops(uuid, text, integer, numeric, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.credit_topup_ops(uuid, text, integer, numeric, text, text) TO service_role;
