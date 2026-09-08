-- СТАТУС: ЧАКА ПРЕГЛЕД И РЪЧНО ПРИЛАГАНЕ (не е изпълнявана от агента).
--
-- Q2f — контролирано редактиране на запазен документ от DogovaryAI.
--
-- Само добавяне: нова таблица с предложения за редакция, помощни функции и
-- атомарна транзакционна функция за приемане/отхвърляне/връщане. Няма backfill,
-- няма промяна на съществуващи редове, няма промени по цени, квоти или политики
-- на други таблици. Повторното изпълнение е no-op (IF NOT EXISTS / guards).

CREATE TABLE IF NOT EXISTS public.assistant_edit_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  thread_id UUID NOT NULL REFERENCES public.assistant_threads(id) ON DELETE CASCADE,
  saved_document_id UUID NOT NULL REFERENCES public.saved_documents(id) ON DELETE CASCADE,
  -- Точното състояние, срещу което е направено предложението.
  base_context_version TEXT NOT NULL,
  base_updated_at TIMESTAMPTZ NOT NULL,
  target_path TEXT NOT NULL,
  before_text TEXT NOT NULL,
  after_text TEXT NOT NULL,
  reason TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  decided_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  -- Състоянието на документа СЛЕД прилагането — нужно за точно връщане (undo).
  applied_updated_at TIMESTAMPTZ,
  applied_context_version TEXT,
  reverted_at TIMESTAMPTZ,
  CONSTRAINT assistant_edit_proposals_status_chk
    CHECK (status IN ('pending', 'accepted', 'rejected', 'reverted')),
  CONSTRAINT assistant_edit_proposals_base_version_chk
    CHECK (base_context_version ~ '^[0-9a-f]{64}$'),
  CONSTRAINT assistant_edit_proposals_applied_version_chk
    CHECK (applied_context_version IS NULL OR applied_context_version ~ '^[0-9a-f]{64}$'),
  CONSTRAINT assistant_edit_proposals_path_chk
    CHECK (
      char_length(target_path) BETWEEN 1 AND 120
      AND target_path ~ '^(title|payload\.(intro|closing|text)|payload\.(sections|clauses)\[[0-9]{1,3}\]\.(heading|body|title))$'
    ),
  CONSTRAINT assistant_edit_proposals_text_len_chk
    CHECK (char_length(before_text) <= 20000 AND char_length(after_text) <= 20000),
  CONSTRAINT assistant_edit_proposals_text_diff_chk
    CHECK (before_text <> after_text),
  CONSTRAINT assistant_edit_proposals_reason_len_chk
    CHECK (reason IS NULL OR char_length(reason) <= 300)
);

COMMENT ON TABLE public.assistant_edit_proposals IS
  'Q2f: предложения за редакция на един низов елемент от запазен документ. Нищо не се прилага без изрично приемане от потребителя.';

CREATE INDEX IF NOT EXISTS assistant_edit_proposals_thread_idx
  ON public.assistant_edit_proposals (thread_id, created_at DESC);
CREATE INDEX IF NOT EXISTS assistant_edit_proposals_document_idx
  ON public.assistant_edit_proposals (saved_document_id);
CREATE INDEX IF NOT EXISTS assistant_edit_proposals_user_status_idx
  ON public.assistant_edit_proposals (user_id, status);

GRANT SELECT ON public.assistant_edit_proposals TO authenticated;
GRANT ALL ON public.assistant_edit_proposals TO service_role;

ALTER TABLE public.assistant_edit_proposals ENABLE ROW LEVEL SECURITY;

-- Клиентът може САМО да чете собствените си предложения. Няма INSERT/UPDATE/
-- DELETE политика: всяка промяна минава през сървърната функция по-долу.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'assistant_edit_proposals'
      AND policyname = 'Users select own edit proposals'
  ) THEN
    CREATE POLICY "Users select own edit proposals"
      ON public.assistant_edit_proposals
      FOR SELECT
      TO authenticated
      USING (user_id = auth.uid());
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- Достъп до запазен документ за конкретен актьор (собственик или член на екипа,
-- на който документът принадлежи) — същият обхват, който дава достъп и през
-- политиките на public.saved_documents.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.can_access_saved_document(_user_id UUID, _document_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.saved_documents d
    WHERE d.id = _document_id
      AND (
        d.user_id = _user_id
        OR (
          d.team_id IS NOT NULL
          AND EXISTS (
            SELECT 1 FROM public.team_members tm
            WHERE tm.team_id = d.team_id AND tm.user_id = _user_id
          )
        )
      )
  );
$$;

REVOKE ALL ON FUNCTION public.can_access_saved_document(UUID, UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.can_access_saved_document(UUID, UUID) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Разбор на разрешения път до низов елемент в payload. NULL = полето `title`.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assistant_edit_payload_path(_path TEXT)
RETURNS TEXT[]
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE
  m TEXT[];
BEGIN
  IF _path = 'title' THEN
    RETURN NULL;
  END IF;
  m := regexp_match(_path, '^payload\.(intro|closing|text)$');
  IF m IS NOT NULL THEN
    RETURN ARRAY[m[1]];
  END IF;
  m := regexp_match(_path, '^payload\.(sections|clauses)\[([0-9]{1,3})\]\.(heading|body|title)$');
  IF m IS NOT NULL THEN
    RETURN ARRAY[m[1], m[2], m[3]];
  END IF;
  RAISE EXCEPTION 'invalid_target_path';
END;
$$;

REVOKE ALL ON FUNCTION public.assistant_edit_payload_path(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assistant_edit_payload_path(TEXT) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Атомарен преход: accept / reject / undo.
--
-- Всичко в една транзакция с редови ключалки. Проверява се актьорът (auth.uid),
-- връзката предложение → разговор → документ, текущият достъп до документа и
-- ТОЧНОТО базово състояние (updated_at + текущата стойност на целевия низ).
-- Прилага се само конкретният елемент; никога цял payload от браузъра.
-- Съществуващият trg_snapshot_saved_document прави версия на предходното
-- състояние — тук нищо не се заобикаля.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assistant_edit_proposal_action(
  _proposal_id UUID,
  _action TEXT
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor UUID := auth.uid();
  p public.assistant_edit_proposals;
  d public.saved_documents;
  jpath TEXT[];
  current_val TEXT;
  new_val TEXT;
  changed BOOLEAN := false;
  idem BOOLEAN := false;
BEGIN
  IF actor IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'code', 'not_authenticated');
  END IF;
  IF _action IS NULL OR _action NOT IN ('accept', 'reject', 'undo') THEN
    RETURN jsonb_build_object('ok', false, 'code', 'invalid_action');
  END IF;

  SELECT * INTO p
  FROM public.assistant_edit_proposals
  WHERE id = _proposal_id AND user_id = actor
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'proposal_not_found');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.assistant_threads t
    WHERE t.id = p.thread_id
      AND t.user_id = actor
      AND t.context_kind = 'saved_document'
      AND t.context_entity_id = p.saved_document_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'thread_mismatch');
  END IF;

  SELECT * INTO d
  FROM public.saved_documents
  WHERE id = p.saved_document_id
  FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'code', 'document_not_found');
  END IF;

  IF NOT public.can_access_saved_document(actor, d.id) THEN
    RETURN jsonb_build_object('ok', false, 'code', 'forbidden');
  END IF;

  jpath := public.assistant_edit_payload_path(p.target_path);
  IF jpath IS NULL THEN
    current_val := d.title;
  ELSE
    IF jsonb_typeof(d.payload #> jpath) IS DISTINCT FROM 'string' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'target_not_found');
    END IF;
    current_val := d.payload #>> jpath;
  END IF;

  -- ------------------------------------------------------------------ reject
  IF _action = 'reject' THEN
    IF p.status = 'rejected' THEN
      idem := true;
    ELSIF p.status <> 'pending' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid_transition', 'status', p.status);
    ELSE
      UPDATE public.assistant_edit_proposals
      SET status = 'rejected', decided_at = now()
      WHERE id = p.id
      RETURNING * INTO p;
    END IF;

  -- ------------------------------------------------------------------ accept
  ELSIF _action = 'accept' THEN
    IF p.status = 'accepted' THEN
      idem := true;
    ELSIF p.status <> 'pending' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid_transition', 'status', p.status);
    ELSE
      IF d.updated_at <> p.base_updated_at THEN
        RETURN jsonb_build_object('ok', false, 'code', 'stale_base');
      END IF;
      IF current_val IS DISTINCT FROM p.before_text THEN
        RETURN jsonb_build_object('ok', false, 'code', 'stale_value');
      END IF;
      new_val := p.after_text;
      IF jpath IS NULL THEN
        UPDATE public.saved_documents
        SET title = new_val, updated_at = now()
        WHERE id = d.id
        RETURNING * INTO d;
      ELSE
        UPDATE public.saved_documents
        SET payload = jsonb_set(payload, jpath, to_jsonb(new_val), false), updated_at = now()
        WHERE id = d.id
        RETURNING * INTO d;
      END IF;
      changed := true;
      UPDATE public.assistant_edit_proposals
      SET status = 'accepted', decided_at = now(), applied_at = now(), applied_updated_at = d.updated_at
      WHERE id = p.id
      RETURNING * INTO p;
    END IF;

  -- -------------------------------------------------------------------- undo
  ELSE
    IF p.status = 'reverted' THEN
      idem := true;
    ELSIF p.status <> 'accepted' THEN
      RETURN jsonb_build_object('ok', false, 'code', 'invalid_transition', 'status', p.status);
    ELSE
      IF p.applied_updated_at IS NULL OR d.updated_at <> p.applied_updated_at THEN
        RETURN jsonb_build_object('ok', false, 'code', 'stale_state');
      END IF;
      IF current_val IS DISTINCT FROM p.after_text THEN
        RETURN jsonb_build_object('ok', false, 'code', 'stale_state');
      END IF;
      new_val := p.before_text;
      IF jpath IS NULL THEN
        UPDATE public.saved_documents
        SET title = new_val, updated_at = now()
        WHERE id = d.id
        RETURNING * INTO d;
      ELSE
        UPDATE public.saved_documents
        SET payload = jsonb_set(payload, jpath, to_jsonb(new_val), false), updated_at = now()
        WHERE id = d.id
        RETURNING * INTO d;
      END IF;
      changed := true;
      UPDATE public.assistant_edit_proposals
      SET status = 'reverted', reverted_at = now(), applied_updated_at = d.updated_at
      WHERE id = p.id
      RETURNING * INTO p;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'idempotent', idem,
    'changed', changed,
    'proposal', jsonb_build_object(
      'id', p.id,
      'status', p.status,
      'target_path', p.target_path,
      'applied_updated_at', p.applied_updated_at
    ),
    'document', jsonb_build_object(
      'id', d.id,
      'kind', d.kind,
      'title', d.title,
      'payload', d.payload,
      'created_at', d.created_at,
      'updated_at', d.updated_at
    )
  );
END;
$$;

REVOKE ALL ON FUNCTION public.assistant_edit_proposal_action(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.assistant_edit_proposal_action(UUID, TEXT) TO authenticated, service_role;
