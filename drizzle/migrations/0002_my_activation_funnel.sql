create or replace function public.get_my_activation_funnel(_days integer default 30)
returns table (stage text, sessions bigint, events bigint)
language sql
stable
security definer
set search_path = public
as $$
  with mine as (
    select distinct session_id
    from public.funnel_events
    where user_id = auth.uid()
  ),
  ev as (
    select fe.session_id,
           fe.props->>'dstage' as stage,
           fe.props->>'outcome' as outcome
    from public.funnel_events fe
    where fe.created_at >= now() - (greatest(coalesce(_days, 30), 1) || ' days')::interval
      and (fe.user_id = auth.uid() or fe.session_id in (select session_id from mine))
      and fe.props->>'dstage' is not null
  )
  select s.stage,
         count(distinct e.session_id) filter (where e.outcome is distinct from 'fail' and e.outcome is distinct from 'declined') as sessions,
         count(e.session_id) as events
  from (values ('start'),('fill'),('generate'),('download'),('sign')) as s(stage)
  left join ev e on e.stage = s.stage
  group by s.stage
$$;

revoke all on function public.get_my_activation_funnel(integer) from public;
grant execute on function public.get_my_activation_funnel(integer) to authenticated;