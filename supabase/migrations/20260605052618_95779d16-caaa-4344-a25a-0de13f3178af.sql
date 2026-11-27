
-- 1. Restrict signer email visibility to owner + team admins only
DROP POLICY IF EXISTS "signing_signers_select_via_request" ON public.signing_request_signers;

CREATE POLICY "signing_signers_select_owner_or_admin"
ON public.signing_request_signers FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.signing_requests r
    WHERE r.id = request_id
      AND (
        r.owner_id = auth.uid()
        OR (r.team_id IS NOT NULL AND public.is_team_admin(auth.uid(), r.team_id))
      )
  )
);

-- 2. Realtime authorization — restrict realtime.messages subscriptions
-- Only authenticated users can receive realtime messages, and only for topics
-- they own (per-user notification channels) or shared app channels they belong to.
-- postgres_changes events are still filtered by source-table RLS (notifications).
ALTER TABLE realtime.messages ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "realtime_authenticated_read_own_topics" ON realtime.messages;
CREATE POLICY "realtime_authenticated_read_own_topics"
ON realtime.messages FOR SELECT TO authenticated
USING (
  -- Per-user notification channels include the user id in the topic name
  (realtime.topic() LIKE 'notifications-unread-' || auth.uid()::text || '%')
  -- Shared notifications channel (events still filtered by notifications RLS)
  OR realtime.topic() = 'notifications-tab'
);

DROP POLICY IF EXISTS "realtime_authenticated_write_own_topics" ON realtime.messages;
CREATE POLICY "realtime_authenticated_write_own_topics"
ON realtime.messages FOR INSERT TO authenticated
WITH CHECK (
  (realtime.topic() LIKE 'notifications-unread-' || auth.uid()::text || '%')
  OR realtime.topic() = 'notifications-tab'
);

-- 3. Fix functions with mutable search_path
CREATE OR REPLACE FUNCTION public.bg_to_lat(input text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.template_search_index_refresh_tsv()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
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
end$function$;
