-- 0030_article_generation_evidence.sql
--
-- APPEND-ONLY ДОКАЗАТЕЛСТВА ЗА AI-ГЕНЕРИРАНИ РЕДАКЦИОННИ ЧЕРНОВИ.
--
-- Записът съдържа хеш на генерираното съдържание, дайджест на промпта и
-- политиката, точните източници (chunk_id, версия, снапшот дайджест), модел,
-- генератор и време. verified остава false, докато човек не потвърди изрично.
-- Записите НЕ могат да се променят или изтриват (append-only чрез триггер).
--
-- ТАЗИ МИГРАЦИЯ НЕ Е ПРИЛОЖЕНА към базата.

CREATE TABLE IF NOT EXISTS public.article_generation_evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  article_id uuid NOT NULL REFERENCES public.user_articles(id) ON DELETE CASCADE,
  content_hash text NOT NULL,
  prompt_version text NOT NULL,
  prompt_digest text NOT NULL,
  policy_version text NOT NULL,
  model text NOT NULL,
  generator text NOT NULL,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  generated_at timestamptz NOT NULL DEFAULT now(),
  verified boolean NOT NULL DEFAULT false,
  verified_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT article_evidence_hash_len CHECK (char_length(content_hash) = 64),
  CONSTRAINT article_evidence_prompt_digest_len CHECK (char_length(prompt_digest) = 64),
  CONSTRAINT article_evidence_sources_array CHECK (jsonb_typeof(sources) = 'array'),
  CONSTRAINT article_evidence_verified_pair CHECK (
    (verified = false AND verified_by IS NULL AND verified_at IS NULL)
    OR (verified = true AND verified_by IS NOT NULL AND verified_at IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS article_generation_evidence_article_idx
  ON public.article_generation_evidence (article_id, generated_at DESC);

-- Append-only: без UPDATE и без DELETE, включително за service_role.
CREATE OR REPLACE FUNCTION public.article_evidence_append_only()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  RAISE EXCEPTION 'article_generation_evidence е append-only';
END;
$$;

DROP TRIGGER IF EXISTS article_evidence_no_update ON public.article_generation_evidence;
CREATE TRIGGER article_evidence_no_update
  BEFORE UPDATE OR DELETE ON public.article_generation_evidence
  FOR EACH ROW EXECUTE FUNCTION public.article_evidence_append_only();

-- Данните се пишат само от сървърни функции; администраторите могат да четат.
GRANT SELECT ON public.article_generation_evidence TO authenticated;
GRANT SELECT, INSERT ON public.article_generation_evidence TO service_role;

ALTER TABLE public.article_generation_evidence ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read article evidence" ON public.article_generation_evidence;
CREATE POLICY "admins read article evidence"
  ON public.article_generation_evidence
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

DROP POLICY IF EXISTS "service role writes article evidence" ON public.article_generation_evidence;
CREATE POLICY "service role writes article evidence"
  ON public.article_generation_evidence
  FOR INSERT
  TO service_role
  WITH CHECK (verified = false);
