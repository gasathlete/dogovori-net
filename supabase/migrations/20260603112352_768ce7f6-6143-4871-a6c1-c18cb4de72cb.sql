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
  v_q     text := nullif(trim(coalesce(q, '')), '');
  v_norm  text;
  v_query tsquery;
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
    select count(*)::bigint as total_count from base
  )
  select
    b.slug, b.name, b.category_id, b.category_title, b.purpose, b.key_clause,
    b.document_type, b.bilingual, b.has_dynamic_wizard, b.lawyer_reviewed,
    b.downloads, b.rank,
    (select total_count from counted) as total
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