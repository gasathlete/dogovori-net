ALTER TABLE public.shared_links
  ADD COLUMN IF NOT EXISTS password_hash text,
  ADD COLUMN IF NOT EXISTS password_salt text;

COMMENT ON COLUMN public.shared_links.password_hash IS 'SHA-256 hex of (salt || password). Set by create-share-link when the owner provides a password.';
COMMENT ON COLUMN public.shared_links.password_salt IS 'Random hex salt (16 bytes) used with password_hash for verification.';