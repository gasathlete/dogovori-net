-- =========================================================================
-- Sprint 3 — Discovery & Catalog 2.0 (data layer) — retry with trigger tsv
-- =========================================================================

create extension if not exists pg_trgm;
create extension if not exists unaccent;

-- -------------------------------------------------------------------------
-- 1) template_search_index
-- -------------------------------------------------------------------------
create table if not exists public.template_search_index (
  slug              text primary key,
  name              text not null,
  category_id       text not null,
  category_title    text not null,
  purpose           text not null default '',
  key_clause        text not null default '',
  document_type     text,
  bilingual         boolean not null default false,
  has_dynamic_wizard boolean not null default false,
  lawyer_reviewed   boolean not null default false,
  locale            text not null default 'bg',
  search_tsv        tsvector,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

grant select on public.template_search_index to anon, authenticated;
grant all on public.template_search_index to service_role;

alter table public.template_search_index enable row level security;

create policy "Search index is public-readable"
on public.template_search_index for select
using (true);

do $$
begin
  if exists (select 1 from pg_proc where proname = 'has_role') then
    execute $p$
      create policy "Staff manage search index"
      on public.template_search_index for all
      to authenticated
      using (public.has_role(auth.uid(), 'admin'))
      with check (public.has_role(auth.uid(), 'admin'));
    $p$;
  end if;
end$$;

-- Trigger-maintained tsvector (unaccent isn't immutable so we can't use STORED).
create or replace function public.template_search_index_refresh_tsv()
returns trigger
language plpgsql
as $$
begin
  new.search_tsv :=
       setweight(to_tsvector('simple', unaccent(coalesce(new.name,''))),           'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(new.purpose,''))),        'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(new.key_clause,''))),     'C')
    || setweight(to_tsvector('simple', unaccent(coalesce(new.category_title,''))), 'D');
  new.updated_at := now();
  return new;
end$$;

drop trigger if exists trg_template_search_index_tsv on public.template_search_index;
create trigger trg_template_search_index_tsv
before insert or update on public.template_search_index
for each row execute function public.template_search_index_refresh_tsv();

create index if not exists template_search_index_tsv_idx
  on public.template_search_index using gin (search_tsv);
create index if not exists template_search_index_name_trgm_idx
  on public.template_search_index using gin (name gin_trgm_ops);
create index if not exists template_search_index_category_idx
  on public.template_search_index (category_id);
create index if not exists template_search_index_doctype_idx
  on public.template_search_index (document_type);

-- -------------------------------------------------------------------------
-- 2) template_download_counts
-- -------------------------------------------------------------------------
create table if not exists public.template_download_counts (
  slug        text primary key,
  count       bigint not null default 0,
  last_at     timestamptz,
  updated_at  timestamptz not null default now()
);

grant select on public.template_download_counts to anon, authenticated;
grant all on public.template_download_counts to service_role;

alter table public.template_download_counts enable row level security;

create policy "Download counts are public-readable"
on public.template_download_counts for select
using (true);

create index if not exists template_download_counts_count_idx
  on public.template_download_counts (count desc);

-- -------------------------------------------------------------------------
-- 3) Auto-increment trigger on audit_log downloads
-- -------------------------------------------------------------------------
create or replace function public.bump_template_download_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_slug text;
begin
  if new.action not in ('download', 'redownload') then
    return new;
  end if;
  v_slug := nullif(trim(coalesce(new.metadata->>'template_slug', '')), '');
  if v_slug is null then
    return new;
  end if;
  insert into public.template_download_counts (slug, count, last_at, updated_at)
  values (v_slug, 1, new.created_at, now())
  on conflict (slug) do update
    set count      = template_download_counts.count + 1,
        last_at    = greatest(template_download_counts.last_at, excluded.last_at),
        updated_at = now();
  return new;
exception when others then
  return new;
end;
$$;

drop trigger if exists trg_bump_template_download_count on public.audit_log;
create trigger trg_bump_template_download_count
after insert on public.audit_log
for each row execute function public.bump_template_download_count();

-- -------------------------------------------------------------------------
-- 4) search_templates RPC
-- -------------------------------------------------------------------------
create or replace function public.search_templates(
  q                 text default null,
  p_category        text default null,
  p_document_type   text default null,
  p_bilingual_only  boolean default false,
  p_dynamic_only    boolean default false,
  p_sort            text default 'relevance',
  p_limit           int  default 30,
  p_offset          int  default 0
)
returns table (
  slug               text,
  name               text,
  category_id        text,
  category_title     text,
  purpose            text,
  key_clause         text,
  document_type      text,
  bilingual          boolean,
  has_dynamic_wizard boolean,
  lawyer_reviewed    boolean,
  downloads          bigint,
  rank               real,
  total              bigint
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_q       text := nullif(trim(coalesce(q, '')), '');
  v_norm    text;
  v_query   tsquery;
begin
  if v_q is not null then
    v_norm := trim(regexp_replace(unaccent(lower(v_q)), '[^a-z0-9а-я]+', ' ', 'gi'));
    if length(v_norm) > 0 then
      v_query := to_tsquery(
        'simple',
        array_to_string(
          array(
            select t || ':*'
            from regexp_split_to_table(v_norm, '\s+') as t
            where length(t) > 0
          ),
          ' & '
        )
      );
    end if;
  end if;

  return query
  with base as (
    select
      tsi.*,
      coalesce(tdc.count, 0) as downloads,
      case
        when v_query is null then 0::real
        else ts_rank(tsi.search_tsv, v_query)
             + 0.3 * similarity(tsi.name, coalesce(v_q,''))
      end as rank
    from public.template_search_index tsi
    left join public.template_download_counts tdc on tdc.slug = tsi.slug
    where (v_query is null
           or tsi.search_tsv @@ v_query
           or (v_q is not null and tsi.name % v_q))
      and (p_category is null or tsi.category_id = p_category)
      and (p_document_type is null or tsi.document_type = p_document_type)
      and (not p_bilingual_only or tsi.bilingual = true)
      and (not p_dynamic_only or tsi.has_dynamic_wizard = true)
  ),
  counted as (
    select count(*) as total from base
  )
  select
    b.slug, b.name, b.category_id, b.category_title, b.purpose, b.key_clause,
    b.document_type, b.bilingual, b.has_dynamic_wizard, b.lawyer_reviewed,
    b.downloads, b.rank,
    (select total from counted) as total
  from base b
  order by
    case when p_sort = 'popular'   then -b.downloads end nulls last,
    case when p_sort = 'name'      then b.name end asc nulls last,
    case when p_sort = 'new'       then b.created_at end desc nulls last,
    case when p_sort = 'relevance' then -b.rank end nulls last,
    b.name asc
  limit greatest(1, least(p_limit, 100))
  offset greatest(0, p_offset);
end;
$$;

grant execute on function public.search_templates(
  text, text, text, boolean, boolean, text, int, int
) to anon, authenticated;