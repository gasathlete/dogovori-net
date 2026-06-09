
ALTER TABLE public.download_quota
  ADD COLUMN IF NOT EXISTS plan_ops_cap integer;

DELETE FROM public.teams
WHERE status = 'pending'
  AND name IN ('Da','да','Сашо Лудия');

CREATE OR REPLACE FUNCTION public.enforce_no_team_when_subscribed()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.subscriptions s
    WHERE s.user_id = NEW.user_id
      AND s.status IN ('active','trialing','past_due')
      AND (s.current_period_end IS NULL OR s.current_period_end > now())
  ) THEN
    RAISE EXCEPTION 'Потребителят има активен индивидуален абонамент — не може да бъде член на екип.'
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_no_team_when_subscribed ON public.team_members;
CREATE TRIGGER trg_no_team_when_subscribed
  BEFORE INSERT ON public.team_members
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_no_team_when_subscribed();

CREATE OR REPLACE FUNCTION public.cleanup_team_on_subscription()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status IN ('active','trialing','past_due') THEN
    DELETE FROM public.team_members tm
    USING public.teams t
    WHERE tm.team_id = t.id
      AND tm.user_id = NEW.user_id
      AND t.owner_id <> NEW.user_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cleanup_team_on_subscription ON public.subscriptions;
CREATE TRIGGER trg_cleanup_team_on_subscription
  AFTER INSERT OR UPDATE OF status ON public.subscriptions
  FOR EACH ROW
  EXECUTE FUNCTION public.cleanup_team_on_subscription();

REVOKE EXECUTE ON FUNCTION public.enforce_no_team_when_subscribed() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cleanup_team_on_subscription() FROM PUBLIC, anon;

UPDATE public.download_quota
SET plan = 'professional', plan_ops_cap = 100
WHERE plan = 'pro';
