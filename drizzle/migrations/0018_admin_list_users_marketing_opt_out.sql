-- Admin email-marketing readiness: expose explicit marketing opt-out per user.
-- Users WITHOUT a marketing granted=false record are treated as "+" (no objection
-- so far); an explicit refusal shows as "-" in the admin panel.
-- Return type changes, so the function is dropped and recreated (EXECUTE stays
-- default to authenticated; the function itself enforces is_staff).

DROP FUNCTION IF EXISTS public.admin_list_users(text, integer);

CREATE FUNCTION public.admin_list_users(_search text DEFAULT NULL::text, _limit integer DEFAULT 100)
RETURNS TABLE(
  user_id uuid,
  email text,
  display_name text,
  plan public.user_plan,
  pro_until timestamp with time zone,
  contracts_used integer,
  analyses_used integer,
  bonus_contracts integer,
  ops_total integer,
  ops_monthly integer,
  is_moderator boolean,
  is_admin boolean,
  created_at timestamp with time zone,
  marketing_opt_out boolean
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
    exists (
      select 1 from public.user_consents uc
      where uc.user_id = u.id
        and uc.consent_type = 'marketing'
        and uc.granted = false
    ) as marketing_opt_out
  from auth.users u
  left join public.profiles p on p.id = u.id
  left join public.download_quota q on q.user_id = u.id
  where _search is null or u.email ilike '%'||_search||'%' or p.display_name ilike '%'||_search||'%'
  order by u.created_at desc
  limit _limit;
end $function$;