-- 0044_privacy_client_write_gate
--
-- ПРЕГРАДА НА НИВО БАЗА за суров текст на документ, записван директно от клиент.
--
-- Защо: браузърната преграда (src/lib/privacyGate.ts) и серверната текстова
-- преграда (supabase/functions/_shared/text-identifier-gate.ts) намаляват риска,
-- но всеки с валиден потребителски токен може да пише директно в базата през
-- Data API и така да заобиколи и двете. Тази миграция прави записа на суров
-- текст на документ от роли `anon` и `authenticated` НЕВЪЗМОЖЕН, докато няма
-- отделен контролиран бекенд. Записът остава възможен САМО за `service_role`
-- (Edge функции), където серверната преграда вече се прилага.
--
-- Какво НЕ прави:
--   * не изтрива и не променя нито един съществуващ ред;
--   * не ограничава четене (SELECT остава както е, по собственик);
--   * не пипа други колони (заглавие, контакт, папка и т.н. остават записваеми);
--   * не пипа схемите `auth`, `storage`, `realtime`, `vault`.
--
-- ИЗВЕСТНО ПОСЛЕДСТВИЕ ПРЕДИ ПРИЛАГАНЕ (не прилагайте, без да е решено):
--   Прилагането ще спре и ЗАКОННИТЕ клиентски записи на текст:
--     - поставяне на текст в „Анализ на документ" (UploadContractDialog),
--     - редакция на текста на качен документ (UploadedPane / useUploadedContractDoc),
--     - подготовката на документ за платен продукт (src/lib/productUpload.ts).
--   Тези пътища първо трябва да минат през Edge функция със `service_role`.
--   Затова миграцията е СЪЗДАДЕНА В КОДА И НЕ Е ПРИЛОЖЕНА.
--
-- БЛОКЕР, който НЕ е решен тук (нарочно):
--   Отказът на нови клиентски качвания на СУРОВИ ФАЙЛОВЕ в кофата
--   `user-contracts` изисква политика върху `storage.objects` — схема `storage`
--   е платформена и не се променя от този проект. Качването на файл в момента е
--   спряно само в интерфейса (RAW_FILE_INGRESS_ALLOWED = false). Това е
--   ограничаване, не гаранция.

CREATE OR REPLACE FUNCTION public.enforce_no_client_document_text_write()
RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_role text := current_user;
  v_new jsonb;
  v_old jsonb;
BEGIN
  -- Серверните роли (Edge функции, поддръжка) минават без промяна в поведението.
  IF v_role NOT IN ('anon', 'authenticated') THEN
    RETURN NEW;
  END IF;

  v_new := to_jsonb(NEW);

  IF TG_OP = 'INSERT' THEN
    IF coalesce(btrim(coalesce(v_new ->> 'extracted_text', '')), '') <> ''
       OR coalesce(btrim(coalesce(v_new ->> 'text_content', '')), '') <> '' THEN
      RAISE EXCEPTION 'client_document_text_write_denied'
        USING ERRCODE = '42501',
              HINT = 'Raw document text must be written by a server role only.';
    END IF;
    RETURN NEW;
  END IF;

  v_old := to_jsonb(OLD);

  IF (v_new ->> 'extracted_text') IS DISTINCT FROM (v_old ->> 'extracted_text')
     OR (v_new ->> 'text_content') IS DISTINCT FROM (v_old ->> 'text_content') THEN
    RAISE EXCEPTION 'client_document_text_write_denied'
      USING ERRCODE = '42501',
            HINT = 'Raw document text must be written by a server role only.';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.enforce_no_client_document_text_write() IS
  'Отказва запис на суров текст на документ от клиентските роли anon/authenticated. Само service_role записва текст. Не променя съществуващи редове и не ограничава четене.';

DROP TRIGGER IF EXISTS uploaded_contracts_no_client_text_write ON public.uploaded_contracts;

CREATE TRIGGER uploaded_contracts_no_client_text_write
BEFORE INSERT OR UPDATE ON public.uploaded_contracts
FOR EACH ROW
EXECUTE FUNCTION public.enforce_no_client_document_text_write();
