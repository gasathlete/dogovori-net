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
                    lower(coalesce(input,'')),
                    'щ','sht','g'),
                  'ш','sh','g'),
                'ч','ch','g'),
              'ц','ts','g'),
            'ю','yu','g'),
          'я','ya','g'),
        'ж','zh','g'),
      'абвгдезийклмнопрстуфхъь',
      'abvgdeziyklmnoprstufha '
    );
$$;

update public.template_search_index set name = name;