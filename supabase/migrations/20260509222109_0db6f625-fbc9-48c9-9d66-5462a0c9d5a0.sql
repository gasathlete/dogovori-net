alter table public.shared_links
  add column if not exists owner_signed_at timestamptz,
  add column if not exists owner_signature text,
  add column if not exists owner_signer_name text;