-- stage_prelaunch_waitlist
--
-- Предварителна заявка с имейл за затворените функции. СЪЗДАДЕНА В КОДА, НЕ Е ПРИЛОЖЕНА.
-- Не изпраща имейли и не се свързва с външни услуги.
--
-- БЛОКЕРИ преди прилагане (правно одобрение):
--   * администратор (контролер) и данни за контакт в текста на съгласието;
--   * срок на съхранение — НЕ е зададен тук; retention_until остава NULL,
--     докато срокът не бъде одобрен;
--   * текст в Политика за поверителност / ROPA.
--
-- Данни: само имейл, функция, версия и момент на съгласието. Без IP, UA, име.

CREATE TABLE IF NOT EXISTS public.prelaunch_waitlist (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL CHECK (char_length(email) BETWEEN 6 AND 254 AND email = lower(email)),
  feature text NOT NULL CHECK (feature IN (
    'blank_download','document_generation','document_review',
    'assistant','one_time_product','subscription')),
  consent_version text NOT NULL CHECK (char_length(consent_version) BETWEEN 1 AND 64),
  consent_at timestamptz NOT NULL DEFAULT now(),
  retention_until timestamptz NULL,
  UNIQUE (email, feature)
);

REVOKE ALL ON TABLE public.prelaunch_waitlist FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.prelaunch_waitlist TO service_role;
ALTER TABLE public.prelaunch_waitlist ENABLE ROW LEVEL SECURITY;
-- Без политики: четене/изтриване само от service_role (персонал чрез сървъра).

CREATE OR REPLACE FUNCTION public.request_prelaunch_waitlist(
  _email text, _feature text, _consent boolean, _consent_version text
) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_email text := lower(btrim(coalesce(_email, '')));
BEGIN
  IF _consent IS DISTINCT FROM true THEN RETURN false; END IF;
  IF v_email !~ '^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,24}$' THEN RETURN false; END IF;
  IF _feature NOT IN ('blank_download','document_generation','document_review',
                      'assistant','one_time_product','subscription') THEN RETURN false; END IF;
  IF _consent_version IS NULL OR char_length(_consent_version) NOT BETWEEN 1 AND 64 THEN RETURN false; END IF;
  INSERT INTO public.prelaunch_waitlist (email, feature, consent_version)
  VALUES (v_email, _feature, _consent_version)
  ON CONFLICT (email, feature) DO UPDATE
    SET consent_version = EXCLUDED.consent_version, consent_at = now();
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.request_prelaunch_waitlist(text, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.request_prelaunch_waitlist(text, text, boolean, text) TO anon, authenticated;

-- Оттегляне / изтриване: само service_role (по заявка чрез „Контакти“).
-- Самообслужване без имейл потвърждение би позволило изтриване на чужд имейл,
-- затова не е отворено за anon.
CREATE OR REPLACE FUNCTION public.withdraw_prelaunch_waitlist(_email text)
RETURNS integer
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  WITH d AS (DELETE FROM public.prelaunch_waitlist WHERE email = lower(btrim(_email)) RETURNING 1)
  SELECT count(*)::integer FROM d;
$$;

REVOKE ALL ON FUNCTION public.withdraw_prelaunch_waitlist(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_prelaunch_waitlist(text) TO service_role;
