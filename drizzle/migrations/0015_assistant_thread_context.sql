-- Q2e — обвързване на разговор с DogovaryAI към конкретен документ.
-- Официален запис на вече приложената в производство идемпотентна миграция:
-- само добавяне на nullable колони + атомарни CHECK ограничения върху тройката.
-- Няма backfill, няма update/delete, няма нови политики. Повторното ѝ
-- изпълнение върху вече обновената схема е no-op (IF NOT EXISTS / guards).

ALTER TABLE public.assistant_threads
  ADD COLUMN IF NOT EXISTS context_kind TEXT,
  ADD COLUMN IF NOT EXISTS context_entity_id UUID,
  ADD COLUMN IF NOT EXISTS context_version TEXT,
  ADD COLUMN IF NOT EXISTS context_title TEXT;

COMMENT ON COLUMN public.assistant_threads.context_kind IS
  'Q2e: saved_document | uploaded_contract | analysis. NULL = общ разговор.';
COMMENT ON COLUMN public.assistant_threads.context_entity_id IS
  'Q2e: ID на обвързания ред (сървърно разрешен през RLS).';
COMMENT ON COLUMN public.assistant_threads.context_version IS
  'Q2e: канонична SHA-256 версия на пълния сървърен ред към момента на обвързване.';
COMMENT ON COLUMN public.assistant_threads.context_title IS
  'Q2e: заглавие, извлечено от сървъра (не от клиента).';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assistant_threads_context_tuple_chk'
      AND conrelid = 'public.assistant_threads'::regclass
  ) THEN
    ALTER TABLE public.assistant_threads
      ADD CONSTRAINT assistant_threads_context_tuple_chk CHECK (
        (
          context_kind IS NULL
          AND context_entity_id IS NULL
          AND context_version IS NULL
          AND context_title IS NULL
        )
        OR (
          context_kind IN ('saved_document', 'uploaded_contract', 'analysis')
          AND context_entity_id IS NOT NULL
          AND context_version IS NOT NULL
          AND context_title IS NOT NULL
        )
      ) NOT VALID;
  END IF;
END $$;

-- Ограничения по дължина (консервативни): заглавието е сървърно ограничено на
-- 120 знака, версията е SHA-256 hex (64 знака). Само за непразни стойности.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assistant_threads_context_title_len_chk'
      AND conrelid = 'public.assistant_threads'::regclass
  ) THEN
    ALTER TABLE public.assistant_threads
      ADD CONSTRAINT assistant_threads_context_title_len_chk CHECK (
        context_title IS NULL OR char_length(context_title) <= 120
      ) NOT VALID;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'assistant_threads_context_version_len_chk'
      AND conrelid = 'public.assistant_threads'::regclass
  ) THEN
    ALTER TABLE public.assistant_threads
      ADD CONSTRAINT assistant_threads_context_version_len_chk CHECK (
        context_version IS NULL OR context_version ~ '^[0-9a-f]{64}$'
      ) NOT VALID;
  END IF;
END $$;

-- Съществуващите редове имат само NULL стойности в тези колони, затова и трите
-- проверки са валидни за тях — валидираме ги веднага, без backfill и без
-- каквато и да е промяна на данни.
ALTER TABLE public.assistant_threads
  VALIDATE CONSTRAINT assistant_threads_context_tuple_chk;
ALTER TABLE public.assistant_threads
  VALIDATE CONSTRAINT assistant_threads_context_title_len_chk;
ALTER TABLE public.assistant_threads
  VALIDATE CONSTRAINT assistant_threads_context_version_len_chk;
