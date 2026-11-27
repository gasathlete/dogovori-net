
-- List subscriptions with user info
CREATE OR REPLACE FUNCTION public.admin_list_subscriptions(
  _search text DEFAULT NULL,
  _env text DEFAULT NULL,
  _status text DEFAULT NULL,
  _limit integer DEFAULT 200
)
RETURNS TABLE(
  id uuid,
  user_id uuid,
  email text,
  display_name text,
  stripe_customer_id text,
  stripe_subscription_id text,
  product_id text,
  price_id text,
  status text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean,
  environment text,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT s.id, s.user_id, u.email::text, p.display_name,
         s.stripe_customer_id, s.stripe_subscription_id, s.product_id, s.price_id,
         s.status, s.current_period_start, s.current_period_end,
         s.cancel_at_period_end, s.environment, s.created_at, s.updated_at
  FROM public.subscriptions s
  JOIN auth.users u ON u.id = s.user_id
  LEFT JOIN public.profiles p ON p.id = s.user_id
  WHERE (_env IS NULL OR s.environment = _env)
    AND (_status IS NULL OR s.status = _status)
    AND (_search IS NULL
         OR u.email ILIKE '%'||_search||'%'
         OR p.display_name ILIKE '%'||_search||'%'
         OR s.stripe_subscription_id ILIKE '%'||_search||'%'
         OR s.stripe_customer_id ILIKE '%'||_search||'%')
  ORDER BY s.updated_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 1000));
END;
$$;

-- Update an existing subscription row
CREATE OR REPLACE FUNCTION public.admin_update_subscription(
  _id uuid,
  _status text DEFAULT NULL,
  _current_period_start timestamptz DEFAULT NULL,
  _current_period_end timestamptz DEFAULT NULL,
  _cancel_at_period_end boolean DEFAULT NULL,
  _environment text DEFAULT NULL,
  _price_id text DEFAULT NULL
)
RETURNS public.subscriptions
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.subscriptions%ROWTYPE;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _environment IS NOT NULL AND _environment NOT IN ('sandbox','live') THEN
    RAISE EXCEPTION 'invalid environment';
  END IF;
  IF _status IS NOT NULL AND _status NOT IN
     ('trialing','active','past_due','canceled','incomplete','incomplete_expired','unpaid','paused') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  UPDATE public.subscriptions
  SET status = COALESCE(_status, status),
      current_period_start = COALESCE(_current_period_start, current_period_start),
      current_period_end = COALESCE(_current_period_end, current_period_end),
      cancel_at_period_end = COALESCE(_cancel_at_period_end, cancel_at_period_end),
      environment = COALESCE(_environment, environment),
      price_id = COALESCE(_price_id, price_id),
      updated_at = now()
  WHERE id = _id
  RETURNING * INTO _row;

  IF NOT FOUND THEN RAISE EXCEPTION 'subscription not found'; END IF;

  -- Mirror pro_until on download_quota if active/canceled
  IF _row.status IN ('active','trialing') THEN
    UPDATE public.download_quota
       SET plan='pro'::public.user_plan,
           pro_until = _row.current_period_end,
           updated_at = now()
     WHERE user_id = _row.user_id;
  ELSIF _row.status = 'canceled' AND (_row.current_period_end IS NULL OR _row.current_period_end < now()) THEN
    UPDATE public.download_quota
       SET plan='free'::public.user_plan, pro_until=NULL, updated_at=now()
     WHERE user_id = _row.user_id;
  END IF;

  RETURN _row;
END;
$$;

-- List teams with admin info
CREATE OR REPLACE FUNCTION public.admin_list_teams(
  _search text DEFAULT NULL,
  _env text DEFAULT NULL,
  _status text DEFAULT NULL,
  _limit integer DEFAULT 200
)
RETURNS TABLE(
  id uuid,
  name text,
  owner_id uuid,
  owner_email text,
  seat_count integer,
  member_count integer,
  status text,
  environment text,
  stripe_subscription_id text,
  stripe_customer_id text,
  current_period_start timestamptz,
  current_period_end timestamptz,
  ops_used integer,
  lifetime_ops bigint,
  created_at timestamptz,
  updated_at timestamptz
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN QUERY
  SELECT t.id, t.name, t.owner_id, u.email::text,
         t.seat_count,
         (SELECT COUNT(*)::int FROM public.team_members tm WHERE tm.team_id = t.id) AS member_count,
         t.status, t.environment, t.stripe_subscription_id, t.stripe_customer_id,
         t.current_period_start, t.current_period_end,
         COALESCE(tu.ops_used, 0),
         COALESCE(tu.lifetime_ops, 0::bigint),
         t.created_at, t.updated_at
  FROM public.teams t
  JOIN auth.users u ON u.id = t.owner_id
  LEFT JOIN public.team_usage tu ON tu.team_id = t.id
  WHERE (_env IS NULL OR t.environment = _env)
    AND (_status IS NULL OR t.status = _status)
    AND (_search IS NULL
         OR t.name ILIKE '%'||_search||'%'
         OR u.email ILIKE '%'||_search||'%'
         OR t.stripe_subscription_id ILIKE '%'||_search||'%')
  ORDER BY t.updated_at DESC
  LIMIT GREATEST(1, LEAST(_limit, 1000));
END;
$$;

-- Update team fields (seats, status, periods, env)
CREATE OR REPLACE FUNCTION public.admin_update_team(
  _id uuid,
  _seat_count integer DEFAULT NULL,
  _status text DEFAULT NULL,
  _current_period_start timestamptz DEFAULT NULL,
  _current_period_end timestamptz DEFAULT NULL,
  _environment text DEFAULT NULL
)
RETURNS public.teams
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE _row public.teams%ROWTYPE; _old public.teams%ROWTYPE;
BEGIN
  IF NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  IF _seat_count IS NOT NULL AND _seat_count < 1 THEN
    RAISE EXCEPTION 'seat_count must be >= 1';
  END IF;
  IF _environment IS NOT NULL AND _environment NOT IN ('sandbox','live') THEN
    RAISE EXCEPTION 'invalid environment';
  END IF;
  IF _status IS NOT NULL AND _status NOT IN ('active','past_due','canceled','paused','trialing') THEN
    RAISE EXCEPTION 'invalid status';
  END IF;

  SELECT * INTO _old FROM public.teams WHERE id = _id;
  IF NOT FOUND THEN RAISE EXCEPTION 'team not found'; END IF;

  UPDATE public.teams
  SET seat_count = COALESCE(_seat_count, seat_count),
      status = COALESCE(_status, status),
      current_period_start = COALESCE(_current_period_start, current_period_start),
      current_period_end = COALESCE(_current_period_end, current_period_end),
      environment = COALESCE(_environment, environment),
      updated_at = now()
  WHERE id = _id
  RETURNING * INTO _row;

  BEGIN
    INSERT INTO public.team_audit_log(team_id, actor_id, action, metadata)
    VALUES (_id, auth.uid(), 'admin_update_team', jsonb_build_object(
      'seat_count_from', _old.seat_count, 'seat_count_to', _row.seat_count,
      'status_from', _old.status, 'status_to', _row.status,
      'environment_from', _old.environment, 'environment_to', _row.environment
    ));
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN _row;
END;
$$;
