
-- 1) Team lifetime ops counter (separate from rolling ops_used)
ALTER TABLE public.team_usage
  ADD COLUMN IF NOT EXISTS lifetime_ops integer NOT NULL DEFAULT 0;

UPDATE public.team_usage
   SET lifetime_ops = GREATEST(lifetime_ops, ops_used)
 WHERE lifetime_ops < ops_used;

-- 2) Update consume_team_quota to also bump lifetime_ops
CREATE OR REPLACE FUNCTION public.consume_team_quota(_team_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _team public.teams%ROWTYPE;
  _usage public.team_usage%ROWTYPE;
  _cap integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_team_member(auth.uid(), _team_id) THEN
    RAISE EXCEPTION 'not_team_member' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _team FROM public.teams WHERE id = _team_id FOR UPDATE;
  IF NOT FOUND OR _team.status <> 'active' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'team_inactive');
  END IF;

  _cap := _team.seat_count * 100;

  SELECT * INTO _usage FROM public.team_usage WHERE team_id = _team_id FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.team_usage (team_id) VALUES (_team_id) RETURNING * INTO _usage;
  END IF;

  IF now() - _usage.period_start >= interval '30 days' THEN
    UPDATE public.team_usage SET ops_used = 0, period_start = now(), updated_at = now()
      WHERE team_id = _team_id;
    _usage.ops_used := 0;
  END IF;

  IF _usage.ops_used >= _cap THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'team_limit_reached',
                              'ops_used', _usage.ops_used, 'cap', _cap);
  END IF;

  UPDATE public.team_usage
     SET ops_used = ops_used + 1,
         lifetime_ops = lifetime_ops + 1,
         updated_at = now()
   WHERE team_id = _team_id;

  RETURN jsonb_build_object(
    'ok', true,
    'ops_used', _usage.ops_used + 1,
    'cap', _cap,
    'lifetime_ops', _usage.lifetime_ops + 1
  );
END;
$function$;

-- 3) Loyalty unlocks ledger
CREATE TABLE IF NOT EXISTS public.loyalty_unlocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subject_type text NOT NULL CHECK (subject_type IN ('user','team')),
  subject_id uuid NOT NULL,
  tier_id text NOT NULL,
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (subject_type, subject_id, tier_id)
);

GRANT SELECT ON public.loyalty_unlocks TO authenticated;
GRANT ALL ON public.loyalty_unlocks TO service_role;

ALTER TABLE public.loyalty_unlocks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS loyalty_unlocks_select ON public.loyalty_unlocks;
CREATE POLICY loyalty_unlocks_select ON public.loyalty_unlocks
  FOR SELECT TO authenticated
  USING (
    (subject_type = 'user' AND subject_id = auth.uid())
    OR (subject_type = 'team' AND public.is_team_member(auth.uid(), subject_id))
  );

DROP POLICY IF EXISTS loyalty_unlocks_service_role ON public.loyalty_unlocks;
CREATE POLICY loyalty_unlocks_service_role ON public.loyalty_unlocks
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- 4) Award functions
CREATE OR REPLACE FUNCTION public.award_user_loyalty(_total_ops integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _tier record;
  _new_tiers jsonb := '[]'::jsonb;
  _inserted boolean;
  _tiers constant jsonb := '[
    {"id":"gold_entrepreneur","threshold":1000,"name":"Златен предприемач","discount":5},
    {"id":"platinum_entrepreneur","threshold":5000,"name":"Платинен предприемач","discount":10},
    {"id":"diamond_entrepreneur","threshold":15000,"name":"Диамантен предприемач","discount":15}
  ]'::jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF _total_ops IS NULL OR _total_ops < 0 THEN
    RETURN jsonb_build_object('new_tiers', _new_tiers);
  END IF;

  FOR _tier IN SELECT * FROM jsonb_to_recordset(_tiers)
                   AS x(id text, threshold int, name text, discount int)
  LOOP
    IF _total_ops >= _tier.threshold THEN
      WITH ins AS (
        INSERT INTO public.loyalty_unlocks(subject_type, subject_id, tier_id)
        VALUES ('user', _uid, _tier.id)
        ON CONFLICT DO NOTHING
        RETURNING 1
      )
      SELECT EXISTS(SELECT 1 FROM ins) INTO _inserted;

      IF _inserted THEN
        INSERT INTO public.notifications(user_id, kind, title, body, link)
        VALUES (
          _uid,
          'loyalty_unlock',
          'Поздравления! Отключихте „' || _tier.name || '"',
          'Достигнахте ' || _tier.threshold || ' операции и получавате ' || _tier.discount || '% отстъпка от абонамента доживот. Отстъпката се прилага автоматично при следващото плащане.',
          '/account'
        );
        _new_tiers := _new_tiers || to_jsonb(_tier.id);
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('new_tiers', _new_tiers);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.award_user_loyalty(integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.award_team_loyalty(_team_id uuid, _total_ops integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _tier record;
  _new_tiers jsonb := '[]'::jsonb;
  _inserted boolean;
  _admin_id uuid;
  _tiers constant jsonb := '[
    {"id":"gold_team","threshold":5000,"name":"Златен екип"},
    {"id":"platinum_team","threshold":15000,"name":"Платинен екип"},
    {"id":"diamond_team","threshold":25000,"name":"Диамантен екип"}
  ]'::jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF NOT public.is_team_member(_uid, _team_id) THEN
    RAISE EXCEPTION 'not_team_member' USING ERRCODE = '42501';
  END IF;
  IF _total_ops IS NULL OR _total_ops < 0 THEN
    RETURN jsonb_build_object('new_tiers', _new_tiers);
  END IF;

  FOR _tier IN SELECT * FROM jsonb_to_recordset(_tiers)
                   AS x(id text, threshold int, name text)
  LOOP
    IF _total_ops >= _tier.threshold THEN
      WITH ins AS (
        INSERT INTO public.loyalty_unlocks(subject_type, subject_id, tier_id)
        VALUES ('team', _team_id, _tier.id)
        ON CONFLICT DO NOTHING
        RETURNING 1
      )
      SELECT EXISTS(SELECT 1 FROM ins) INTO _inserted;

      IF _inserted THEN
        FOR _admin_id IN
          SELECT user_id FROM public.team_members
           WHERE team_id = _team_id AND role IN ('owner','admin')
        LOOP
          INSERT INTO public.notifications(user_id, kind, title, body, link)
          VALUES (
            _admin_id,
            'loyalty_unlock_team',
            'Екипът отключи „' || _tier.name || '"',
            'Екипът достигна ' || _tier.threshold || ' извършени операции и отключи ниво „' || _tier.name || '".',
            '/team'
          );
        END LOOP;
        _new_tiers := _new_tiers || to_jsonb(_tier.id);
      END IF;
    END IF;
  END LOOP;

  RETURN jsonb_build_object('new_tiers', _new_tiers);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.award_team_loyalty(uuid, integer) TO authenticated;
