-- PENDING (НЕ е изпълнявана) — Q2e: обвързване на разговор с DogovaryAI към
-- конкретен документ. Само добавяне на nullable колони + атомарна проверка на
-- тройката. Няма backfill, няма update/delete, няма нови политики.
--
-- Официалната Drizzle миграция 0015 не може да бъде добавена от този етап:
-- директорията drizzle/migrations е само за четене и се управлява от
-- миграционния инструмент на платформата.

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
