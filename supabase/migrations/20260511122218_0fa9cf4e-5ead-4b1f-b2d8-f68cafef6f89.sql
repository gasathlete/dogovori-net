
create table public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  website_url text,
  logo_url text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  submitted_by uuid references auth.users(id) on delete set null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index partners_status_idx on public.partners(status, display_order desc, created_at desc);

alter table public.partners enable row level security;

create policy partners_select_approved on public.partners
  for select to anon, authenticated using (status = 'approved');

create policy partners_select_own on public.partners
  for select to authenticated using (auth.uid() = submitted_by);

create policy partners_select_staff on public.partners
  for select to authenticated using (public.is_staff(auth.uid()));

create policy partners_insert_authed on public.partners
  for insert to authenticated with check (auth.uid() = submitted_by and status = 'pending');

create policy partners_update_staff on public.partners
  for update to authenticated using (public.is_staff(auth.uid())) with check (public.is_staff(auth.uid()));

create policy partners_insert_staff on public.partners
  for insert to authenticated with check (public.is_staff(auth.uid()));

create policy partners_delete_staff on public.partners
  for delete to authenticated using (public.is_staff(auth.uid()));

create trigger partners_set_updated_at before update on public.partners
  for each row execute function public.set_updated_at();

insert into storage.buckets (id, name, public) values ('partner-logos','partner-logos', true)
  on conflict (id) do update set public = true;

create policy "partner-logos public read" on storage.objects
  for select to anon, authenticated using (bucket_id = 'partner-logos');

create policy "partner-logos authed upload" on storage.objects
  for insert to authenticated with check (bucket_id = 'partner-logos' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "partner-logos staff manage" on storage.objects
  for all to authenticated using (bucket_id = 'partner-logos' and public.is_staff(auth.uid()))
  with check (bucket_id = 'partner-logos' and public.is_staff(auth.uid()));
