-- 1) generation_jobs: идемпотентност на стартовете + бърз преглед по статус.
ALTER TABLE public.generation_jobs ADD COLUMN IF NOT EXISTS idempotency_key text;

-- Един активен (running/done) job на ключ. Провалените (error/rejected) излизат
-- от индекса, така че „Опитай отново" след грешка създава нов job.
CREATE UNIQUE INDEX IF NOT EXISTS generation_jobs_idempotency_active_uidx
  ON public.generation_jobs (idempotency_key)
  WHERE idempotency_key IS NOT NULL AND status IN ('running', 'done');

CREATE INDEX IF NOT EXISTS generation_jobs_status_created_idx
  ON public.generation_jobs (status, created_at DESC);

-- 2) funnel_events: user_id се извлича от JWT-а на сървъра, за да не зависи
-- от това дали клиентът го е пратил и за да не може анонимен клиент да го
-- подправи. service_role (вътрешни задачи) запазва подадената стойност.
CREATE OR REPLACE FUNCTION public.funnel_events_attribute_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  jwt_role text := coalesce(nullif(current_setting('request.jwt.claim.role', true), ''), auth.role());
BEGIN
  IF jwt_role = 'authenticated' THEN
    NEW.user_id := auth.uid();
  ELSIF jwt_role = 'anon' OR jwt_role IS NULL THEN
    NEW.user_id := NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS funnel_events_attribute_user_trg ON public.funnel_events;
CREATE TRIGGER funnel_events_attribute_user_trg
  BEFORE INSERT ON public.funnel_events
  FOR EACH ROW EXECUTE FUNCTION public.funnel_events_attribute_user();

-- 3) Сървърна защита срещу дубликати на идемпотентни събития (втори таб, race).
-- Клиентът праща props.dedup_key за събитията „веднъж на сесия+документ".
CREATE UNIQUE INDEX IF NOT EXISTS funnel_events_dedup_uidx
  ON public.funnel_events (session_id, name, (props->>'dedup_key'))
  WHERE props ? 'dedup_key';

CREATE INDEX IF NOT EXISTS funnel_events_user_created_idx
  ON public.funnel_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

-- Грантове (идемпотентни) — таблиците вече се ползват от клиента/функциите.
GRANT INSERT ON public.funnel_events TO anon, authenticated;
GRANT SELECT ON public.funnel_events TO authenticated;
GRANT ALL ON public.funnel_events TO service_role;
GRANT ALL ON public.generation_jobs TO service_role;