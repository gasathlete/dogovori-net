-- Lead magnet: отделно, изрично съгласие за бюлетина + минимизиране на данните.
--
-- Контекст: свалянето на PDF-а вече е директно и НЕ изисква имейл. Абонаментът
-- за бюлетина е незадължителна втора стъпка с незадължен по подразбиране
-- чекбокс (EDPB: ясно разграничено, свободно дадено съгласие). Затова:
--   1) marketing_consent вече НЕ е true по подразбиране; добавяме consent_at и
--      consent_version, за да е доказуемо кога и при коя формулировка е дадено;
--   2) директният INSERT от anon/authenticated се затваря — единственият път за
--      запис е SECURITY DEFINER RPC-то по-долу със строги гардове;
--   3) четенето е само за администратори (RLS през has_role).
--
-- Съществуващите редове НЕ се променят, изтриват или „запълват“ — миграцията е
-- изцяло адитивна по данни. Не се пазят име, суров път или user agent за нови
-- записи; в базата влиза само груба група на източника (home/catalog/template/blog).

-- 1) Схема (адитивно, без промяна на съществуващи стойности).
ALTER TABLE public.lead_magnet_subscribers
  ALTER COLUMN marketing_consent SET DEFAULT false;

ALTER TABLE public.lead_magnet_subscribers
  ADD COLUMN IF NOT EXISTS consent_at timestamptz NULL;

ALTER TABLE public.lead_magnet_subscribers
  ADD COLUMN IF NOT EXISTS consent_version text NULL;

COMMENT ON COLUMN public.lead_magnet_subscribers.marketing_consent IS
  'Изрично съгласие за имейл бюлетин. По подразбиране false; true само чрез subscribe_lead_magnet().';
COMMENT ON COLUMN public.lead_magnet_subscribers.consent_at IS
  'Момент на последното изрично съгласие (UTC). NULL за записи без доказано съгласие.';
COMMENT ON COLUMN public.lead_magnet_subscribers.consent_version IS
  'Версия на текста на съгласието (напр. lead-magnet-v2). NULL за исторически записи.';

-- 2) Затваряне на директния запис: без политика за INSERT, без права за
--    anon/authenticated. Четене само за администратори.
DROP POLICY IF EXISTS "Anyone can subscribe to a lead magnet" ON public.lead_magnet_subscribers;

REVOKE ALL ON TABLE public.lead_magnet_subscribers FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.lead_magnet_subscribers TO authenticated;
GRANT ALL ON TABLE public.lead_magnet_subscribers TO service_role;

ALTER TABLE public.lead_magnet_subscribers ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins can read lead magnet subscribers" ON public.lead_magnet_subscribers;
CREATE POLICY "Admins can read lead magnet subscribers"
  ON public.lead_magnet_subscribers
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Съзнателно НЯМА INSERT/UPDATE/DELETE политика за anon/authenticated.

-- 3) Единственият път за запис: SECURITY DEFINER RPC със строги гардове.
--    Връща true само когато съгласието е записано; при всякакъв невалиден вход
--    връща false БЕЗ да пише и БЕЗ да вдига грешка (нищо не изтича към клиента).
CREATE OR REPLACE FUNCTION public.subscribe_lead_magnet(
  _email text,
  _magnet_slug text,
  _source_group text,
  _marketing_consent boolean
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_email text;
BEGIN
  -- 3.1) Изрично отхвърляне на NULL за всеки аргумент, преди каквото и да е сравнение.
  IF _email IS NULL
     OR _magnet_slug IS NULL
     OR _source_group IS NULL
     OR _marketing_consent IS NULL THEN
    RETURN false;
  END IF;

  -- 3.2) Съгласието трябва да е изрично true (незадължен чекбокс → false → без запис).
  IF _marketing_consent IS NOT TRUE THEN
    RETURN false;
  END IF;

  -- 3.3) Имейл: сървърно trim + lowercase, дължина 6..254, строг формат
  --      (локална част без две последователни точки, домейн от етикети, TLD 2..63 букви).
  v_email := lower(btrim(_email));
  IF length(v_email) < 6 OR length(v_email) > 254 THEN
    RETURN false;
  END IF;
  IF v_email !~ '^[a-z0-9_%+-]+(\.[a-z0-9_%+-]+)*@([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$' THEN
    RETURN false;
  END IF;

  -- 3.4) Строг allow-list за материала и за грубата група на източника.
  IF _magnet_slug NOT IN ('rent-red-flags', 'labor-checklist-2026') THEN
    RETURN false;
  END IF;
  IF _source_group NOT IN ('home', 'catalog', 'template', 'blog') THEN
    RETURN false;
  END IF;

  -- 3.5) Атомарен UPSERT само по (email, magnet_slug). Растежът е ограничен:
  --      най-много един ред на имейл за всеки от двата материала. Никакво име,
  --      суров път или user agent; source = само грубата група.
  INSERT INTO public.lead_magnet_subscribers AS s (
    email, name, magnet_slug, source, user_agent,
    marketing_consent, consent_at, consent_version
  ) VALUES (
    v_email, NULL, _magnet_slug, _source_group, NULL,
    true, now(), 'lead-magnet-v2'
  )
  ON CONFLICT (email, magnet_slug)
  DO UPDATE SET
    name              = NULL,
    source            = EXCLUDED.source,
    user_agent        = NULL,
    marketing_consent = true,
    consent_at        = now(),
    consent_version   = 'lead-magnet-v2';

  RETURN true;
END;
$$;

COMMENT ON FUNCTION public.subscribe_lead_magnet(text, text, text, boolean) IS
  'Opt-in newsletter subscription after a lead magnet download. Requires explicit _marketing_consent = true; validates, normalises and allow-lists every argument; never reads auth.uid or stores identifiers beyond the e-mail; returns false without writing (and without raising) for any invalid input.';

REVOKE ALL ON FUNCTION public.subscribe_lead_magnet(text, text, text, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.subscribe_lead_magnet(text, text, text, boolean) TO anon, authenticated;
