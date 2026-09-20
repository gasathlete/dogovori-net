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

-- ---------------------------------------------------------------------------
-- ЧОВЕШКИ ПРЕГЛЕД: отделни append-only събития, свързани с доказателството за
-- генериране. AI никога не се самоодобрява и не публикува. Одобрение е валидно
-- само когато текущият хеш на статията съвпада с генерирания хеш.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.article_review_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_id uuid NOT NULL REFERENCES public.article_generation_evidence(id) ON DELETE CASCADE,
  article_id uuid NOT NULL REFERENCES public.user_articles(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  decision text NOT NULL CHECK (decision IN ('approved', 'rejected', 'changes_requested')),
  current_content_hash text NOT NULL CHECK (char_length(current_content_hash) = 64),
  hash_matches_generation boolean NOT NULL,
  sources_still_approved boolean NOT NULL,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  -- Одобрение е допустимо САМО при непроменено съдържание и валидни източници.
  CONSTRAINT article_review_approval_requires_match CHECK (
    decision <> 'approved' OR (hash_matches_generation AND sources_still_approved)
  )
);

CREATE INDEX IF NOT EXISTS article_review_events_article_idx
  ON public.article_review_events (article_id, created_at DESC);

DROP TRIGGER IF EXISTS article_review_events_no_update ON public.article_review_events;
CREATE TRIGGER article_review_events_no_update
  BEFORE UPDATE OR DELETE ON public.article_review_events
  FOR EACH ROW EXECUTE FUNCTION public.article_evidence_append_only();

GRANT SELECT ON public.article_review_events TO authenticated;
GRANT SELECT, INSERT ON public.article_review_events TO service_role;

ALTER TABLE public.article_review_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read article review events" ON public.article_review_events;
CREATE POLICY "admins read article review events"
  ON public.article_review_events
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));

-- Записване само от сървърна функция след проверка на хеша и източниците.
CREATE OR REPLACE FUNCTION public.record_article_review(
  _evidence_id uuid,
  _reviewer uuid,
  _decision text,
  _current_hash text,
  _sources_ok boolean,
  _note text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _ev public.article_generation_evidence;
  _matches boolean;
BEGIN
  SELECT * INTO _ev FROM public.article_generation_evidence WHERE id = _evidence_id;
  IF _ev.id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'evidence_not_found');
  END IF;
  IF NOT public.has_role(_reviewer, 'admin') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'not_staff');
  END IF;
  _matches := (_ev.content_hash = _current_hash);
  IF _decision = 'approved' AND (NOT _matches OR NOT _sources_ok) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'content_or_sources_changed',
      'hash_matches_generation', _matches, 'sources_still_approved', _sources_ok);
  END IF;

  INSERT INTO public.article_review_events (
    evidence_id, article_id, reviewer_id, decision, current_content_hash,
    hash_matches_generation, sources_still_approved, note
  ) VALUES (
    _evidence_id, _ev.article_id, _reviewer, _decision, _current_hash,
    _matches, _sources_ok, _note
  );

  IF _decision = 'approved' THEN
    UPDATE public.user_articles
       SET status = 'approved', reviewed_by = _reviewer, reviewed_at = now()
     WHERE id = _ev.article_id;
  ELSIF _decision = 'rejected' THEN
    UPDATE public.user_articles
       SET status = 'rejected', reviewed_by = _reviewer, reviewed_at = now()
     WHERE id = _ev.article_id;
  END IF;

  RETURN jsonb_build_object('ok', true, 'decision', _decision,
    'hash_matches_generation', _matches, 'sources_still_approved', _sources_ok);
END;
$$;

REVOKE ALL ON FUNCTION public.record_article_review(uuid, uuid, text, text, boolean, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_article_review(uuid, uuid, text, text, boolean, text) TO service_role;
