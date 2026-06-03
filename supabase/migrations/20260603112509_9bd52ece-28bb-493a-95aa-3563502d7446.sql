create or replace function public.bg_to_lat(input text)
returns text
language sql
immutable
as $$
  select
    translate(
      regexp_replace(
        regexp_replace(
          regexp_replace(
            regexp_replace(
              regexp_replace(
                regexp_replace(
                  regexp_replace(
                    regexp_replace(
                      regexp_replace(
                        regexp_replace(
                          lower(coalesce(input,'')),
                          'щ','sht','g'),
                        'ш','sh','g'),
                      'ч','ch','g'),
                    'ц','ts','g'),
                  'ю','yu','g'),
                'я','ya','g'),
              'ж','zh','g'),
            'Щ','sht','g'),
          'Ш','sh','g'),
        'Ч','ch','g'),
      'абвгдезийклмнопрстуфхъь',
      'abvgdezyyklmnoprstufha y'
    );
$$;

create or replace function public.template_search_index_refresh_tsv()
returns trigger
language plpgsql
as $$
begin
  new.search_tsv :=
       setweight(to_tsvector('simple', unaccent(coalesce(new.name,''))),                            'A')
    || setweight(to_tsvector('simple', public.bg_to_lat(coalesce(new.name,''))),                    'A')
    || setweight(to_tsvector('simple', unaccent(coalesce(new.purpose,''))),                         'B')
    || setweight(to_tsvector('simple', public.bg_to_lat(coalesce(new.purpose,''))),                 'B')
    || setweight(to_tsvector('simple', unaccent(coalesce(new.key_clause,''))),                      'C')
    || setweight(to_tsvector('simple', public.bg_to_lat(coalesce(new.key_clause,''))),              'C')
    || setweight(to_tsvector('simple', unaccent(coalesce(new.category_title,''))),                  'D')
    || setweight(to_tsvector('simple', public.bg_to_lat(coalesce(new.category_title,''))),          'D');
  new.updated_at := now();
  return new;
end$$;

-- backfill
update public.template_search_index set name = name;