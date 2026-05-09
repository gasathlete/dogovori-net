-- Roles enum + table
do $$ begin
  create type public.app_role as enum ('admin','moderator','user');
exception when duplicate_object then null; end $$;

create table if not exists public.user_roles (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.app_role not null,
  created_at timestamptz not null default now(),
  unique (user_id, role)
);

alter table public.user_roles enable row level security;

create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role = _role)
$$;

create or replace function public.is_staff(_user_id uuid)
returns boolean language sql stable security definer set search_path = public
as $$
  select exists (select 1 from public.user_roles where user_id = _user_id and role in ('admin','moderator'))
$$;

drop policy if exists user_roles_select_own on public.user_roles;
create policy user_roles_select_own on public.user_roles
  for select using (auth.uid() = user_id or public.is_staff(auth.uid()));

drop policy if exists user_roles_admin_manage on public.user_roles;
create policy user_roles_admin_manage on public.user_roles
  for all using (public.has_role(auth.uid(), 'admin'))
  with check (public.has_role(auth.uid(), 'admin'));

-- Grant moderator to imdevelopmentoffice@gmail.com (and also admin so they can manage roles)
insert into public.user_roles (user_id, role)
select id, 'moderator'::public.app_role from auth.users where lower(email) = 'imdevelopmentoffice@gmail.com'
on conflict do nothing;

insert into public.user_roles (user_id, role)
select id, 'admin'::public.app_role from auth.users where lower(email) = 'imdevelopmentoffice@gmail.com'
on conflict do nothing;

-- Allow staff to view & manage download_quota
drop policy if exists quota_staff_select on public.download_quota;
create policy quota_staff_select on public.download_quota
  for select using (public.is_staff(auth.uid()));

drop policy if exists quota_staff_update on public.download_quota;
create policy quota_staff_update on public.download_quota
  for update using (public.is_staff(auth.uid()))
  with check (public.is_staff(auth.uid()));

-- RPC: list users with email + plan (staff only)
create or replace function public.admin_list_users(_search text default null, _limit int default 100)
returns table (
  user_id uuid,
  email text,
  display_name text,
  plan public.user_plan,
  pro_until timestamptz,
  contracts_used int,
  analyses_used int,
  bonus_contracts int,
  is_moderator boolean,
  is_admin boolean,
  created_at timestamptz
) language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'forbidden';
  end if;
  return query
  select u.id, u.email::text, p.display_name,
    coalesce(q.plan, 'free'::public.user_plan), q.pro_until,
    coalesce(q.contracts_used,0), coalesce(q.analyses_used,0), coalesce(q.bonus_contracts,0),
    public.has_role(u.id,'moderator'), public.has_role(u.id,'admin'),
    u.created_at
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.download_quota q on q.user_id = u.id
  where _search is null or u.email ilike '%'||_search||'%' or p.display_name ilike '%'||_search||'%'
  order by u.created_at desc
  limit _limit;
end $$;

-- RPC: grant or revoke pro
create or replace function public.admin_set_pro(_user_id uuid, _months int)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'forbidden';
  end if;
  insert into public.download_quota (user_id, plan, pro_until)
  values (_user_id, 'pro'::public.user_plan, now() + (_months || ' months')::interval)
  on conflict (user_id) do update
    set plan = 'pro'::public.user_plan,
        pro_until = greatest(coalesce(public.download_quota.pro_until, now()), now()) + (_months || ' months')::interval,
        updated_at = now();
end $$;

create or replace function public.admin_revoke_pro(_user_id uuid)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'forbidden';
  end if;
  update public.download_quota set plan='free'::public.user_plan, pro_until=null, updated_at=now()
  where user_id = _user_id;
end $$;

create or replace function public.admin_add_bonus_contracts(_user_id uuid, _count int)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_staff(auth.uid()) then raise exception 'forbidden'; end if;
  insert into public.download_quota (user_id, bonus_contracts)
  values (_user_id, _count)
  on conflict (user_id) do update set bonus_contracts = public.download_quota.bonus_contracts + _count, updated_at = now();
end $$;

create or replace function public.admin_set_role(_user_id uuid, _role public.app_role, _grant boolean)
returns void language plpgsql security definer set search_path = public
as $$
begin
  if not public.has_role(auth.uid(),'admin') then raise exception 'forbidden'; end if;
  if _grant then
    insert into public.user_roles (user_id, role) values (_user_id, _role) on conflict do nothing;
  else
    delete from public.user_roles where user_id = _user_id and role = _role;
  end if;
end $$;