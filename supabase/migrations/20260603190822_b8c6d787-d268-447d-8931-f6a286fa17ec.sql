-- =========================================================
-- SPRINT 5: Multi-party e-signing
-- =========================================================

create type public.signing_status as enum
  ('draft','pending','in_progress','completed','cancelled','expired','declined');

create type public.signing_order_mode as enum ('sequential','parallel');

create type public.signer_status as enum
  ('pending','notified','viewed','otp_sent','signed','declined');

-- ---------- signing_requests ----------
create table public.signing_requests (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null,
  team_id uuid,
  saved_document_id uuid references public.saved_documents(id) on delete set null,
  uploaded_contract_id uuid,
  title text not null,
  document_snapshot jsonb not null,
  status public.signing_status not null default 'pending',
  order_mode public.signing_order_mode not null default 'parallel',
  expires_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index signing_requests_owner_idx on public.signing_requests(owner_id);
create index signing_requests_team_idx  on public.signing_requests(team_id) where team_id is not null;
create index signing_requests_status_idx on public.signing_requests(status);

grant select, insert, update on public.signing_requests to authenticated;
grant all on public.signing_requests to service_role;
alter table public.signing_requests enable row level security;

create policy "signing_requests_select_own"
on public.signing_requests for select to authenticated
using (
  auth.uid() = owner_id
  or (team_id is not null and is_team_member(auth.uid(), team_id))
);

create policy "signing_requests_insert_own"
on public.signing_requests for insert to authenticated
with check (
  auth.uid() = owner_id
  and (team_id is null or is_team_member(auth.uid(), team_id))
);

create policy "signing_requests_update_own"
on public.signing_requests for update to authenticated
using (
  auth.uid() = owner_id
  or (team_id is not null and is_team_admin(auth.uid(), team_id))
)
with check (
  auth.uid() = owner_id
  or (team_id is not null and is_team_admin(auth.uid(), team_id))
);

create policy "signing_requests_service_role"
on public.signing_requests for all to service_role using (true) with check (true);

-- ---------- signing_request_signers ----------
create table public.signing_request_signers (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.signing_requests(id) on delete cascade,
  email text not null,
  name text not null,
  role text,
  order_idx integer not null default 0,
  status public.signer_status not null default 'pending',
  sign_token text not null unique,
  otp_code_hash text,
  otp_expires_at timestamptz,
  otp_attempts integer not null default 0,
  notified_at timestamptz,
  viewed_at timestamptz,
  signed_at timestamptz,
  declined_at timestamptz,
  decline_reason text,
  signature_data_url text,
  signature_name text,
  signer_ip_hash text,
  signer_user_agent text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index signing_signers_request_idx on public.signing_request_signers(request_id);
create unique index signing_signers_request_order_idx
  on public.signing_request_signers(request_id, order_idx);

grant select, insert, update on public.signing_request_signers to authenticated;
grant all on public.signing_request_signers to service_role;
alter table public.signing_request_signers enable row level security;

create policy "signing_signers_select_via_request"
on public.signing_request_signers for select to authenticated
using (
  exists (
    select 1 from public.signing_requests r
    where r.id = request_id
      and (r.owner_id = auth.uid() or (r.team_id is not null and is_team_member(auth.uid(), r.team_id)))
  )
);

create policy "signing_signers_insert_via_request"
on public.signing_request_signers for insert to authenticated
with check (
  exists (
    select 1 from public.signing_requests r
    where r.id = request_id
      and (r.owner_id = auth.uid() or (r.team_id is not null and is_team_admin(auth.uid(), r.team_id)))
  )
);

create policy "signing_signers_update_via_request"
on public.signing_request_signers for update to authenticated
using (
  exists (
    select 1 from public.signing_requests r
    where r.id = request_id
      and (r.owner_id = auth.uid() or (r.team_id is not null and is_team_admin(auth.uid(), r.team_id)))
  )
);

create policy "signing_signers_service_role"
on public.signing_request_signers for all to service_role using (true) with check (true);

-- ---------- signing_audit_events ----------
create table public.signing_audit_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.signing_requests(id) on delete cascade,
  signer_id uuid references public.signing_request_signers(id) on delete set null,
  event_type text not null,
  metadata jsonb not null default '{}'::jsonb,
  ip_hash text,
  user_agent text,
  created_at timestamptz not null default now()
);

create index signing_audit_request_idx on public.signing_audit_events(request_id, created_at);

grant select on public.signing_audit_events to authenticated;
grant all on public.signing_audit_events to service_role;
alter table public.signing_audit_events enable row level security;

create policy "signing_audit_select_via_request"
on public.signing_audit_events for select to authenticated
using (
  exists (
    select 1 from public.signing_requests r
    where r.id = request_id
      and (r.owner_id = auth.uid() or (r.team_id is not null and is_team_member(auth.uid(), r.team_id)))
  )
);

create policy "signing_audit_service_role"
on public.signing_audit_events for all to service_role using (true) with check (true);

-- updated_at trigger reuse
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end;
$$;

create trigger trg_signing_requests_touch
before update on public.signing_requests
for each row execute function public.touch_updated_at();

create trigger trg_signing_signers_touch
before update on public.signing_request_signers
for each row execute function public.touch_updated_at();

-- =========================================================
-- SPRINT 4: Glossary
-- =========================================================

create table public.glossary_terms (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  term text not null,
  short_definition text not null,
  body_md text not null default '',
  related_template_slugs text[] not null default '{}',
  seo_title text,
  seo_description text,
  published boolean not null default true,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index glossary_terms_published_idx on public.glossary_terms(published);
create index glossary_terms_slug_idx on public.glossary_terms(slug);

grant select on public.glossary_terms to anon, authenticated;
grant all on public.glossary_terms to service_role;
alter table public.glossary_terms enable row level security;

create policy "glossary_select_published"
on public.glossary_terms for select to anon, authenticated
using (published = true);

create policy "glossary_staff_all"
on public.glossary_terms for all to authenticated
using (is_staff(auth.uid())) with check (is_staff(auth.uid()));

create policy "glossary_service_role"
on public.glossary_terms for all to service_role using (true) with check (true);

create trigger trg_glossary_touch
before update on public.glossary_terms
for each row execute function public.touch_updated_at();