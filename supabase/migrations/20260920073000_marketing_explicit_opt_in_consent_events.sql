-- 0028 — Маркетингът е изричен opt-in + идемпотентни съгласия.
--
-- 1) `consent_event_id` прави повторния запис на един и същ пакет съгласия
--    безопасен: мрежова грешка при регистрация вече не води до второ събитие
--    и не губи доказателството (виж src/lib/consents.ts).
-- 2) Кампаниите се изпращат САМО на потребители, чието ПОСЛЕДНО маркетингово
--    събитие е granted = true. Липса на запис и последен отказ изключват.
--    Историята на съгласията не се пренаписва и не се попълва изкуствено.
--
-- ВАЖНО: няма backfill на съгласие. Съществуващите редове получават
-- самостоятелен event id през DEFAULT, което запазва историята такава,
-- каквато е.

ALTER TABLE public.user_consents
  ADD COLUMN IF NOT EXISTS consent_event_id uuid NOT NULL DEFAULT gen_random_uuid();

CREATE UNIQUE INDEX IF NOT EXISTS user_consents_event_unique
  ON public.user_consents (user_id, consent_type, consent_event_id);

-- ---------------------------------------------------------------------------
-- Получатели на кампании: само изричен opt-in по последно събитие.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_list_marketing_recipients(
  _search text DEFAULT NULL::text,
  _limit integer DEFAULT 200
)
RETURNS TABLE(user_id uuid, email text, display_name text, created_at timestamp with time zone)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT u.id, u.email::text, p.display_name, u.created_at
  FROM auth.users u
  LEFT JOIN public.profiles p ON p.id = u.id
  WHERE public.is_staff(auth.uid())
    AND u.deleted_at IS NULL
    AND COALESCE((
      SELECT c.granted
      FROM public.user_consents c
      WHERE c.user_id = u.id AND c.consent_type = 'marketing'
      ORDER BY c.granted_at DESC, c.created_at DESC, c.id DESC
      LIMIT 1
    ), false) = true
    AND (
      _search IS NULL OR _search = ''
      OR u.email ILIKE '%' || _search || '%'
      OR COALESCE(p.display_name, '') ILIKE '%' || _search || '%'
    )
  ORDER BY u.created_at DESC
  LIMIT LEAST(COALESCE(_limit, 200), 1000)
$function$;

-- ---------------------------------------------------------------------------
-- Изпращане: същото правило, наложено в базата — стар интерфейс не може да
-- разшири получателите.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.admin_send_campaign_topic(_topic_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_topic public.email_campaign_topics;
  v_count integer := 0;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  SELECT * INTO v_topic FROM public.email_campaign_topics WHERE id = _topic_id;
  IF v_topic.id IS NULL THEN
    RAISE EXCEPTION 'topic not found';
  END IF;
  IF v_topic.is_active = false THEN
    RAISE EXCEPTION 'topic is not active';
  END IF;

  INSERT INTO public.notifications (user_id, kind, title, body, link, created_by)
  SELECT u.id, 'campaign', v_topic.title, v_topic.body, v_topic.link, auth.uid()
  FROM auth.users u
  WHERE u.deleted_at IS NULL
    AND COALESCE((
      SELECT c.granted
      FROM public.user_consents c
      WHERE c.user_id = u.id AND c.consent_type = 'marketing'
      ORDER BY c.granted_at DESC, c.created_at DESC, c.id DESC
      LIMIT 1
    ), false) = true;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.email_campaign_topics
  SET last_sent_at = now(), last_sent_count = v_count
  WHERE id = _topic_id;

  RETURN v_count;
END;
$function$;

-- ---------------------------------------------------------------------------
-- Админ списък: тристойностен статус вместо „няма възражение = съгласие“.
-- Връщаният тип се променя → функцията се пресъздава.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.admin_list_users(text, integer);

CREATE FUNCTION public.admin_list_users(
  _search text DEFAULT NULL::text,
  _limit integer DEFAULT 100
)
RETURNS TABLE(
  user_id uuid, email text, display_name text, plan public.user_plan,
  pro_until timestamp with time zone, contracts_used integer, analyses_used integer,
  bonus_contracts integer, ops_total integer, ops_monthly integer,
  is_moderator boolean, is_admin boolean, created_at timestamp with time zone,
  marketing_status text
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
begin
  if not public.is_staff(auth.uid()) then
    raise exception 'forbidden';
  end if;
  return query
  select u.id, u.email::text, p.display_name,
    coalesce(q.plan, 'free'::public.user_plan), q.pro_until,
    coalesce(q.contracts_used,0), coalesce(q.analyses_used,0), coalesce(q.bonus_contracts,0),
    coalesce(q.total_used,
             coalesce(q.contracts_used,0)
             + coalesce(q.templates_used,0)
             + coalesce(q.analyses_used,0)
             + coalesce(q.ai_messages_used,0))::integer,
    coalesce(q.monthly_total_used, 0)::integer,
    public.has_role(u.id,'moderator'), public.has_role(u.id,'admin'),
    u.created_at,
    (case (
       select c.granted
       from public.user_consents c
       where c.user_id = u.id and c.consent_type = 'marketing'
       order by c.granted_at desc, c.created_at desc, c.id desc
       limit 1
     )
       when true then 'opt_in'
       when false then 'opt_out'
       else 'unknown'
     end)::text as marketing_status
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.download_quota q on q.user_id = u.id
  where _search is null or u.email ilike '%'||_search||'%' or p.display_name ilike '%'||_search||'%'
  order by u.created_at desc
  limit _limit;
end $function$;

REVOKE ALL ON FUNCTION public.admin_list_users(text, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.admin_list_users(text, integer) TO service_role;
