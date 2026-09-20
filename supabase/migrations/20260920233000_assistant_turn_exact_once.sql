-- =============================================================================
-- 0039 — DogovaryAI: ТРАЙЕН ЛЕДЖЕР ЗА ТОЧНО ЕДНО ИЗПЪЛНЕНИЕ НА ХОД (P0-E2)
--
-- Какво добавя:
--   1) public.assistant_turn_operations — трайно състояние на един клиентски ход
--      (обвързване, разговор, ревизия, режим, точна резервация, лизинг, начало
--      на модела, точен резултат с изтичане, изравняване).
--   2) Произход върху assistant_threads / assistant_messages /
--      assistant_edit_proposals: монотонна turn_revision и уникалност по
--      operation_id, така че ЕДНА операция да създаде НАЙ-МНОГО едно
--      потребителско съобщение, едно съобщение на асистента и едно предложение.
--   3) САМО-ЧЕТЯЩО търсене (assistant_turn_lookup) — без запис.
--   4) Атомарна резервация (assistant_turn_reserve) — сериализира една и съща
--      операция И една и съща ревизия на разговора; създава/преизползва точно
--      един разговор; резервира ТОЧНО избрания сървърно път на правото
--      (екип / платен план / безплатен пул), като възпроизвежда семантиката на
--      consume_team_quota и consume_ai_message транзакционно.
--   5) assistant_turn_mark_model_started — след него всяка несигурност е
--      изравняване, никога автоматична отмяна и никога втори модел.
--   6) Атомарен commit — точен запис на SSE събитията, ЕДНО потребителско и
--      ЕДНО асистентско съобщение, нова ревизия, най-много едно предложение.
--   7) Отмяна САМО при доказан провал ПРЕДИ модела, с точно възстановяване.
--   8) Изравняване на застояли ходове, заличаване на изтекъл товар, само-четящо
--      преброяване и път за заличаване по искане на потребител.
--
-- Всичко е SECURITY DEFINER, schema-qualified, само за service_role.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1) Произход върху съществуващите таблици
-- ---------------------------------------------------------------------------
ALTER TABLE public.assistant_threads
  ADD COLUMN IF NOT EXISTS turn_revision integer NOT NULL DEFAULT 0;

ALTER TABLE public.assistant_messages
  ADD COLUMN IF NOT EXISTS operation_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS assistant_messages_operation_role_uniq
  ON public.assistant_messages (operation_id, role)
  WHERE operation_id IS NOT NULL;

ALTER TABLE public.assistant_edit_proposals
  ADD COLUMN IF NOT EXISTS operation_id uuid;

CREATE UNIQUE INDEX IF NOT EXISTS assistant_edit_proposals_operation_uniq
  ON public.assistant_edit_proposals (operation_id)
  WHERE operation_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- 2) Леджърът
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.assistant_turn_operations (
  operation_id uuid PRIMARY KEY,
  user_id uuid NOT NULL,
  -- Каноничен SHA-256 (малки букви) върху потребител, заявен/реален разговор,
  -- точното ново съобщение, контекста и режима.
  binding_digest text NOT NULL CHECK (binding_digest ~ '^[0-9a-f]{64}$'),
  requested_thread_id uuid,
  thread_id uuid,
  prior_turn_revision integer,
  mode text NOT NULL CHECK (mode IN ('platform_help', 'legal_strict', 'clarification')),
  state text NOT NULL CHECK (state IN ('reserved', 'committed', 'cancelled', 'reconciliation')),
  charged boolean NOT NULL DEFAULT false,
  allocation jsonb,
  lease_expires_at timestamptz,
  model_started_at timestamptz,
  result jsonb,
  result_expires_at timestamptz,
  reconciliation_required boolean NOT NULL DEFAULT false,
  cancelled_at timestamptz,
  detail text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Една активна/потвърдена операция на ТОЧНО една ревизия на разговора.
CREATE UNIQUE INDEX IF NOT EXISTS assistant_turn_thread_revision_uniq
  ON public.assistant_turn_operations (thread_id, prior_turn_revision)
  WHERE thread_id IS NOT NULL AND state IN ('reserved', 'committed');

CREATE INDEX IF NOT EXISTS assistant_turn_operations_user_idx
  ON public.assistant_turn_operations (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS assistant_turn_operations_stale_idx
  ON public.assistant_turn_operations (state, lease_expires_at)
  WHERE state = 'reserved';

CREATE INDEX IF NOT EXISTS assistant_turn_operations_payload_idx
  ON public.assistant_turn_operations (result_expires_at)
  WHERE result IS NOT NULL;

GRANT ALL ON public.assistant_turn_operations TO service_role;
ALTER TABLE public.assistant_turn_operations ENABLE ROW LEVEL SECURITY;
-- Никакви политики: таблицата е достъпна САМО през service_role функциите.

-- ---------------------------------------------------------------------------
-- 3) САМО-ЧЕТЯЩО търсене. НЕ пише, НЕ маркира, НЕ отменя.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assistant_turn_lookup(
  p_operation_id uuid,
  p_user_id uuid,
  p_binding text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.assistant_turn_operations%ROWTYPE;
BEGIN
  IF p_operation_id IS NULL OR p_user_id IS NULL OR p_binding IS NULL THEN
    RETURN jsonb_build_object('status', 'invalid');
  END IF;

  SELECT * INTO _row FROM public.assistant_turn_operations
   WHERE operation_id = p_operation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('status', 'absent');
  END IF;

  IF _row.user_id <> p_user_id OR _row.binding_digest <> p_binding THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  IF _row.reconciliation_required THEN
    RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'flagged');
  END IF;

  IF _row.state = 'committed' THEN
    IF _row.result IS NULL OR _row.result_expires_at IS NULL
       OR _row.result_expires_at <= now() THEN
      RETURN jsonb_build_object('status', 'response_expired');
    END IF;
    RETURN jsonb_build_object('status', 'committed', 'result', _row.result,
      'thread_id', _row.thread_id, 'charged', _row.charged);
  END IF;

  IF _row.state = 'reserved' THEN
    IF _row.lease_expires_at IS NULL OR _row.lease_expires_at <= now() THEN
      RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'lease_expired');
    END IF;
    RETURN jsonb_build_object('status', 'in_progress',
      'model_started', _row.model_started_at IS NOT NULL);
  END IF;

  IF _row.state = 'cancelled' THEN
    RETURN jsonb_build_object('status', 'absent', 'cancelled', true);
  END IF;

  RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'unknown_state');
END;
$function$;

REVOKE ALL ON FUNCTION public.assistant_turn_lookup(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assistant_turn_lookup(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.assistant_turn_lookup(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_turn_lookup(uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 4) Атомарна резервация
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assistant_turn_reserve(
  p_operation_id uuid,
  p_user_id uuid,
  p_binding text,
  p_requested_thread_id uuid,
  p_mode text,
  p_charge boolean,
  p_alloc_source text,
  p_team_id uuid,
  p_lease_seconds integer,
  p_new_thread jsonb,
  p_free_ai_cap integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.assistant_turn_operations%ROWTYPE;
  _thread public.assistant_threads%ROWTYPE;
  _thread_id uuid;
  _revision integer;
  _alloc jsonb := NULL;
  _q public.download_quota%ROWTYPE;
  _team public.teams%ROWTYPE;
  _usage public.team_usage%ROWTYPE;
  _cap integer;
  _is_pro boolean;
  _rollover boolean := false;
BEGIN
  IF p_operation_id IS NULL OR p_user_id IS NULL OR p_binding IS NULL THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_input');
  END IF;
  IF p_mode NOT IN ('platform_help', 'legal_strict', 'clarification') THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_mode');
  END IF;
  IF p_charge AND p_alloc_source NOT IN ('team', 'pro', 'free') THEN
    RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_allocation_source');
  END IF;

  -- Детерминистична подредба: една и съща операция никога не тече паралелно.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  SELECT * INTO _row FROM public.assistant_turn_operations
   WHERE operation_id = p_operation_id FOR UPDATE;

  IF FOUND THEN
    IF _row.user_id <> p_user_id OR _row.binding_digest <> p_binding THEN
      RETURN jsonb_build_object('status', 'conflict', 'reason', 'binding_conflict');
    END IF;
    IF _row.reconciliation_required THEN
      RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'flagged');
    END IF;
    IF _row.state = 'committed' THEN
      IF _row.result IS NULL OR _row.result_expires_at IS NULL
         OR _row.result_expires_at <= now() THEN
        RETURN jsonb_build_object('status', 'response_expired');
      END IF;
      RETURN jsonb_build_object('status', 'replay', 'result', _row.result,
        'thread_id', _row.thread_id);
    END IF;
    IF _row.state = 'reserved' THEN
      IF _row.lease_expires_at IS NOT NULL AND _row.lease_expires_at > now() THEN
        RETURN jsonb_build_object('status', 'in_progress',
          'model_started', _row.model_started_at IS NOT NULL);
      END IF;
      -- ИЗТЕКЪЛ ЛИЗИНГ НИКОГА не е нова резервация и НЕ променя реда.
      RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'lease_expired');
    END IF;
    IF _row.state = 'cancelled' THEN
      IF _row.cancelled_at IS NULL THEN
        RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'cancellation_unproven');
      END IF;
      DELETE FROM public.assistant_turn_operations WHERE operation_id = p_operation_id;
    ELSE
      RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'unknown_state');
    END IF;
  END IF;

  -- ----- Разговорът: точно един, създаден или доказано собствен -------------
  IF p_requested_thread_id IS NOT NULL THEN
    SELECT * INTO _thread FROM public.assistant_threads
     WHERE id = p_requested_thread_id FOR UPDATE;
    IF NOT FOUND OR _thread.user_id <> p_user_id THEN
      RETURN jsonb_build_object('status', 'error', 'reason', 'thread_not_found');
    END IF;
    _thread_id := _thread.id;
    _revision := COALESCE(_thread.turn_revision, 0);
  ELSE
    INSERT INTO public.assistant_threads (
      user_id, title, context_kind, context_entity_id, context_version, context_title)
    VALUES (
      p_user_id,
      COALESCE(NULLIF(p_new_thread->>'title', ''), 'Нов разговор'),
      NULLIF(p_new_thread->>'context_kind', ''),
      NULLIF(p_new_thread->>'context_entity_id', '')::uuid,
      NULLIF(p_new_thread->>'context_version', ''),
      NULLIF(p_new_thread->>'context_title', ''))
    RETURNING * INTO _thread;
    _thread_id := _thread.id;
    _revision := 0;
  END IF;

  -- ----- Право: ТОЧНО избраният сървърно път, транзакционно ----------------
  IF p_charge THEN
    IF p_alloc_source = 'team' THEN
      IF p_team_id IS NULL THEN
        RETURN jsonb_build_object('status', 'error', 'reason', 'invalid_allocation_source');
      END IF;
      IF NOT public.is_team_member(p_user_id, p_team_id) THEN
        RETURN jsonb_build_object('status', 'denied', 'reason', 'not_team_member');
      END IF;
      SELECT * INTO _team FROM public.teams WHERE id = p_team_id FOR UPDATE;
      IF NOT FOUND OR _team.status <> 'active' THEN
        RETURN jsonb_build_object('status', 'denied', 'reason', 'team_inactive');
      END IF;
      _cap := _team.seat_count * 100;
      SELECT * INTO _usage FROM public.team_usage WHERE team_id = p_team_id FOR UPDATE;
      IF NOT FOUND THEN
        INSERT INTO public.team_usage (team_id) VALUES (p_team_id) RETURNING * INTO _usage;
      END IF;
      IF now() - _usage.period_start >= interval '30 days' THEN
        UPDATE public.team_usage SET ops_used = 0, period_start = now(), updated_at = now()
         WHERE team_id = p_team_id;
        _usage.ops_used := 0;
      END IF;
      IF _usage.ops_used >= _cap THEN
        RETURN jsonb_build_object('status', 'denied', 'reason', 'team_limit_reached');
      END IF;
      UPDATE public.team_usage
         SET ops_used = ops_used + 1, lifetime_ops = lifetime_ops + 1, updated_at = now()
       WHERE team_id = p_team_id;
      _alloc := jsonb_build_object('source', 'team', 'team_id', p_team_id,
        'ops_used', 1, 'lifetime_ops', 1);

    ELSE
      SELECT * INTO _q FROM public.download_quota WHERE user_id = p_user_id FOR UPDATE;
      IF NOT FOUND THEN
        INSERT INTO public.download_quota (user_id) VALUES (p_user_id) RETURNING * INTO _q;
      END IF;

      IF p_alloc_source = 'pro' THEN
        _is_pro := _q.plan = 'pro'::public.user_plan
                   OR (_q.pro_until IS NOT NULL AND _q.pro_until > now());
        IF NOT _is_pro THEN
          RETURN jsonb_build_object('status', 'denied', 'reason', 'plan_not_active');
        END IF;
        IF now() - _q.monthly_reset_at >= interval '30 days' THEN
          UPDATE public.download_quota
             SET monthly_contracts_used = 0, monthly_templates_used = 0,
                 monthly_total_used = 0, monthly_reset_at = now()
           WHERE user_id = p_user_id;
          _q.monthly_total_used := 0;
        END IF;
        IF now() - _q.pro_period_start >= interval '30 days' THEN
          UPDATE public.download_quota
             SET pro_monthly_used = 0, pro_period_start = now()
           WHERE user_id = p_user_id;
          _q.pro_monthly_used := 0;
        END IF;
        _cap := COALESCE(_q.plan_ops_cap, 100);
        IF _q.pro_monthly_used >= _cap THEN
          RETURN jsonb_build_object('status', 'denied', 'reason', 'ai_plan_limit_reached');
        END IF;
        UPDATE public.download_quota
           SET pro_monthly_used = pro_monthly_used + 1,
               ai_messages_used = ai_messages_used + 1,
               total_used = total_used + 1,
               updated_at = now()
         WHERE user_id = p_user_id;
        _alloc := jsonb_build_object('source', 'pro', 'pro_monthly_used', 1,
          'ai_messages_used', 1, 'total_used', 1);

      ELSE
        -- Безплатният път: същият таван на AI съобщенията и същият 30-дневен
        -- прозорец, както го прилага сървърът днес.
        _cap := COALESCE(p_free_ai_cap, 3);
        IF _q.ai_messages_used >= _cap THEN
          RETURN jsonb_build_object('status', 'denied', 'reason', 'ai_free_limit_reached');
        END IF;
        _rollover := now() - _q.monthly_reset_at >= interval '30 days';
        IF _rollover THEN
          UPDATE public.download_quota
             SET ai_messages_used = ai_messages_used + 1,
                 total_used = total_used + 1,
                 monthly_contracts_used = 0,
                 monthly_templates_used = 0,
                 monthly_total_used = 1,
                 monthly_reset_at = now(),
                 updated_at = now()
           WHERE user_id = p_user_id;
          _alloc := jsonb_build_object('source', 'free', 'ai_messages_used', 1,
            'monthly_total_used', 1, 'total_used', 1, 'rollover', true);
        ELSE
          UPDATE public.download_quota
             SET ai_messages_used = ai_messages_used + 1,
                 monthly_total_used = monthly_total_used + 1,
                 total_used = total_used + 1,
                 updated_at = now()
           WHERE user_id = p_user_id;
          _alloc := jsonb_build_object('source', 'free', 'ai_messages_used', 1,
            'monthly_total_used', 1, 'total_used', 1, 'rollover', false);
        END IF;
      END IF;
    END IF;
  END IF;

  -- ----- Самата резервация: сериализира и ревизията на разговора ------------
  BEGIN
    INSERT INTO public.assistant_turn_operations (
      operation_id, user_id, binding_digest, requested_thread_id, thread_id,
      prior_turn_revision, mode, state, charged, allocation, lease_expires_at)
    VALUES (
      p_operation_id, p_user_id, p_binding, p_requested_thread_id, _thread_id,
      _revision, p_mode, 'reserved', COALESCE(p_charge, false), _alloc,
      now() + make_interval(secs => GREATEST(COALESCE(p_lease_seconds, 180), 30)));
  EXCEPTION WHEN unique_violation THEN
    -- Друг ход вече държи същата ревизия на разговора: НЕ таксуваме нищо.
    RAISE EXCEPTION 'thread_busy' USING ERRCODE = '40001';
  END;

  RETURN jsonb_build_object('status', 'reserved', 'thread_id', _thread_id,
    'prior_turn_revision', _revision, 'charged', COALESCE(p_charge, false),
    'allocation', _alloc);
EXCEPTION WHEN SQLSTATE '40001' THEN
  RETURN jsonb_build_object('status', 'conflict', 'reason', 'thread_busy');
END;
$function$;

REVOKE ALL ON FUNCTION public.assistant_turn_reserve(uuid, uuid, text, uuid, text, boolean, text, uuid, integer, jsonb, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assistant_turn_reserve(uuid, uuid, text, uuid, text, boolean, text, uuid, integer, jsonb, integer) FROM anon;
REVOKE ALL ON FUNCTION public.assistant_turn_reserve(uuid, uuid, text, uuid, text, boolean, text, uuid, integer, jsonb, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_turn_reserve(uuid, uuid, text, uuid, text, boolean, text, uuid, integer, jsonb, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 5) Начало на модела: след него няма автоматична отмяна и няма втори модел.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assistant_turn_mark_model_started(
  p_operation_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.assistant_turn_operations%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM public.assistant_turn_operations
   WHERE operation_id = p_operation_id FOR UPDATE;
  IF NOT FOUND OR _row.user_id <> p_user_id THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;
  IF _row.state <> 'reserved' THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'not_reserved');
  END IF;
  IF _row.model_started_at IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'already_started');
  END IF;
  UPDATE public.assistant_turn_operations
     SET model_started_at = now(), updated_at = now()
   WHERE operation_id = p_operation_id;
  RETURN jsonb_build_object('status', 'ok');
END;
$function$;

REVOKE ALL ON FUNCTION public.assistant_turn_mark_model_started(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assistant_turn_mark_model_started(uuid, uuid) FROM anon;
REVOKE ALL ON FUNCTION public.assistant_turn_mark_model_started(uuid, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_turn_mark_model_started(uuid, uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 6) Атомарен commit: съобщения, ревизия, най-много едно предложение, товар.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assistant_turn_commit(
  p_operation_id uuid,
  p_user_id uuid,
  p_user_message text,
  p_assistant_message text,
  p_events jsonb,
  p_proposal jsonb,
  p_result_ttl_seconds integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.assistant_turn_operations%ROWTYPE;
  _user_msg_id uuid;
  _assistant_msg_id uuid;
  _proposal_id uuid;
  _proposal_row public.assistant_edit_proposals%ROWTYPE;
  _result jsonb;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  SELECT * INTO _row FROM public.assistant_turn_operations
   WHERE operation_id = p_operation_id FOR UPDATE;
  IF NOT FOUND OR _row.user_id <> p_user_id THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  IF _row.state = 'committed' THEN
    IF _row.result IS NULL OR _row.result_expires_at IS NULL
       OR _row.result_expires_at <= now() THEN
      RETURN jsonb_build_object('status', 'response_expired');
    END IF;
    RETURN jsonb_build_object('status', 'replay', 'result', _row.result);
  END IF;
  IF _row.state <> 'reserved' THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'not_reserved');
  END IF;

  -- ТОЧНО едно потребителско и едно асистентско съобщение за тази операция.
  INSERT INTO public.assistant_messages (thread_id, role, content, operation_id)
  VALUES (_row.thread_id, 'user', p_user_message, p_operation_id)
  ON CONFLICT (operation_id, role) DO NOTHING
  RETURNING id INTO _user_msg_id;
  IF _user_msg_id IS NULL THEN
    SELECT id INTO _user_msg_id FROM public.assistant_messages
     WHERE operation_id = p_operation_id AND role = 'user';
  END IF;

  IF p_assistant_message IS NOT NULL AND length(btrim(p_assistant_message)) > 0 THEN
    INSERT INTO public.assistant_messages (thread_id, role, content, operation_id)
    VALUES (_row.thread_id, 'assistant', p_assistant_message, p_operation_id)
    ON CONFLICT (operation_id, role) DO NOTHING
    RETURNING id INTO _assistant_msg_id;
    IF _assistant_msg_id IS NULL THEN
      SELECT id INTO _assistant_msg_id FROM public.assistant_messages
       WHERE operation_id = p_operation_id AND role = 'assistant';
    END IF;
  END IF;

  -- Най-много ЕДНО предложение за редакция, обвързано с операцията.
  IF p_proposal IS NOT NULL AND p_proposal <> 'null'::jsonb THEN
    INSERT INTO public.assistant_edit_proposals (
      user_id, thread_id, saved_document_id, base_context_version, base_updated_at,
      target_path, before_text, after_text, reason, status, operation_id)
    VALUES (
      p_user_id, _row.thread_id,
      (p_proposal->>'saved_document_id')::uuid,
      p_proposal->>'base_context_version',
      (p_proposal->>'base_updated_at')::timestamptz,
      p_proposal->>'target_path',
      p_proposal->>'before_text',
      p_proposal->>'after_text',
      NULLIF(p_proposal->>'reason', ''),
      'pending',
      p_operation_id)
    ON CONFLICT (operation_id) DO NOTHING
    RETURNING * INTO _proposal_row;
    IF _proposal_row.id IS NULL THEN
      SELECT * INTO _proposal_row FROM public.assistant_edit_proposals
       WHERE operation_id = p_operation_id;
    END IF;
    _proposal_id := _proposal_row.id;
  END IF;

  UPDATE public.assistant_threads
     SET turn_revision = COALESCE(turn_revision, 0) + 1, updated_at = now()
   WHERE id = _row.thread_id;

  _result := jsonb_build_object(
    'events', COALESCE(p_events, '[]'::jsonb),
    'thread_id', _row.thread_id,
    'user_message_id', _user_msg_id,
    'assistant_message_id', _assistant_msg_id,
    'proposal_id', _proposal_id,
    'proposal', CASE WHEN _proposal_row.id IS NULL THEN NULL ELSE jsonb_build_object(
      'id', _proposal_row.id,
      'status', _proposal_row.status,
      'targetPath', _proposal_row.target_path,
      'before', _proposal_row.before_text,
      'after', _proposal_row.after_text,
      'reason', _proposal_row.reason,
      'savedDocumentId', _proposal_row.saved_document_id,
      'threadId', _proposal_row.thread_id,
      'createdAt', _proposal_row.created_at) END);

  UPDATE public.assistant_turn_operations
     SET state = 'committed',
         result = _result,
         result_expires_at = now()
           + make_interval(secs => GREATEST(COALESCE(p_result_ttl_seconds, 86400), 60)),
         lease_expires_at = NULL,
         updated_at = now()
   WHERE operation_id = p_operation_id;

  RETURN jsonb_build_object('status', 'committed', 'result', _result);
END;
$function$;

REVOKE ALL ON FUNCTION public.assistant_turn_commit(uuid, uuid, text, text, jsonb, jsonb, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assistant_turn_commit(uuid, uuid, text, text, jsonb, jsonb, integer) FROM anon;
REVOKE ALL ON FUNCTION public.assistant_turn_commit(uuid, uuid, text, text, jsonb, jsonb, integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_turn_commit(uuid, uuid, text, text, jsonb, jsonb, integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 7) Отмяна САМО при доказан провал ПРЕДИ модела; всичко или нищо.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assistant_turn_cancel(
  p_operation_id uuid,
  p_user_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.assistant_turn_operations%ROWTYPE;
  _alloc jsonb;
  _src text;
  _q public.download_quota%ROWTYPE;
  _usage public.team_usage%ROWTYPE;
  _restored boolean := false;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  SELECT * INTO _row FROM public.assistant_turn_operations
   WHERE operation_id = p_operation_id FOR UPDATE;
  IF NOT FOUND OR _row.user_id <> p_user_id THEN
    RETURN jsonb_build_object('status', 'conflict');
  END IF;

  IF _row.state = 'cancelled' THEN
    RETURN jsonb_build_object('status', 'cancelled', 'restored', _row.charged,
      'idempotent', true);
  END IF;
  IF _row.state = 'committed' THEN
    RETURN jsonb_build_object('status', 'conflict', 'reason', 'already_committed');
  END IF;
  IF _row.state <> 'reserved' THEN
    RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'unknown_state');
  END IF;

  -- Стартиран модел НИКОГА не се отменя автоматично.
  IF _row.model_started_at IS NOT NULL THEN
    UPDATE public.assistant_turn_operations
       SET state = 'reconciliation', reconciliation_required = true,
           detail = left(COALESCE(p_reason, 'model_started'), 120), updated_at = now()
     WHERE operation_id = p_operation_id;
    RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'model_started');
  END IF;

  IF NOT _row.charged THEN
    UPDATE public.assistant_turn_operations
       SET state = 'cancelled', cancelled_at = now(), lease_expires_at = NULL,
           detail = left(COALESCE(p_reason, 'cancelled'), 120), updated_at = now()
     WHERE operation_id = p_operation_id;
    RETURN jsonb_build_object('status', 'cancelled', 'restored', false);
  END IF;

  _alloc := _row.allocation;
  _src := _alloc->>'source';
  IF _alloc IS NULL OR _src IS NULL THEN
    UPDATE public.assistant_turn_operations
       SET state = 'reconciliation', reconciliation_required = true,
           detail = 'allocation_missing', updated_at = now()
     WHERE operation_id = p_operation_id;
    RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'allocation_missing');
  END IF;

  IF _src = 'team' THEN
    SELECT * INTO _usage FROM public.team_usage
     WHERE team_id = (_alloc->>'team_id')::uuid FOR UPDATE;
    IF NOT FOUND
       OR _usage.ops_used < COALESCE((_alloc->>'ops_used')::integer, 0)
       OR _usage.lifetime_ops < COALESCE((_alloc->>'lifetime_ops')::integer, 0) THEN
      UPDATE public.assistant_turn_operations
         SET state = 'reconciliation', reconciliation_required = true,
             detail = 'team_underflow', updated_at = now()
       WHERE operation_id = p_operation_id;
      RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'underflow');
    END IF;
    UPDATE public.team_usage
       SET ops_used = ops_used - COALESCE((_alloc->>'ops_used')::integer, 0),
           lifetime_ops = lifetime_ops - COALESCE((_alloc->>'lifetime_ops')::integer, 0),
           updated_at = now()
     WHERE team_id = (_alloc->>'team_id')::uuid;
    _restored := true;

  ELSE
    SELECT * INTO _q FROM public.download_quota WHERE user_id = _row.user_id FOR UPDATE;
    IF NOT FOUND THEN
      UPDATE public.assistant_turn_operations
         SET state = 'reconciliation', reconciliation_required = true,
             detail = 'quota_row_missing', updated_at = now()
       WHERE operation_id = p_operation_id;
      RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'quota_row_missing');
    END IF;
    IF COALESCE((_alloc->>'rollover')::boolean, false) THEN
      -- Върнатият прозорец не може да бъде реконструиран точно.
      UPDATE public.assistant_turn_operations
         SET state = 'reconciliation', reconciliation_required = true,
             detail = 'window_rolled', updated_at = now()
       WHERE operation_id = p_operation_id;
      RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'window_rolled');
    END IF;
    IF _q.ai_messages_used < COALESCE((_alloc->>'ai_messages_used')::integer, 0)
       OR _q.total_used < COALESCE((_alloc->>'total_used')::integer, 0)
       OR _q.monthly_total_used < COALESCE((_alloc->>'monthly_total_used')::integer, 0)
       OR (_src = 'pro' AND _q.pro_monthly_used < COALESCE((_alloc->>'pro_monthly_used')::integer, 0)) THEN
      UPDATE public.assistant_turn_operations
         SET state = 'reconciliation', reconciliation_required = true,
             detail = 'quota_underflow', updated_at = now()
       WHERE operation_id = p_operation_id;
      RETURN jsonb_build_object('status', 'reconciliation', 'reason', 'underflow');
    END IF;
    UPDATE public.download_quota
       SET ai_messages_used = ai_messages_used - COALESCE((_alloc->>'ai_messages_used')::integer, 0),
           total_used = total_used - COALESCE((_alloc->>'total_used')::integer, 0),
           monthly_total_used = monthly_total_used - COALESCE((_alloc->>'monthly_total_used')::integer, 0),
           pro_monthly_used = pro_monthly_used - COALESCE((_alloc->>'pro_monthly_used')::integer, 0),
           updated_at = now()
     WHERE user_id = _row.user_id;
    _restored := true;
  END IF;

  UPDATE public.assistant_turn_operations
     SET state = 'cancelled', cancelled_at = now(), lease_expires_at = NULL,
         detail = left(COALESCE(p_reason, 'cancelled'), 120), updated_at = now()
   WHERE operation_id = p_operation_id;

  RETURN jsonb_build_object('status', 'cancelled', 'restored', _restored);
END;
$function$;

REVOKE ALL ON FUNCTION public.assistant_turn_cancel(uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assistant_turn_cancel(uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.assistant_turn_cancel(uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_turn_cancel(uuid, uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 8) Изравняване на застояли ходове: САМО маркиране, без авто-връщане.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.assistant_turn_reconcile_stale(p_limit integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _examined integer := 0;
  _flagged integer := 0;
  _r record;
BEGIN
  FOR _r IN
    SELECT operation_id FROM public.assistant_turn_operations
     WHERE state = 'reserved'
       AND lease_expires_at IS NOT NULL
       AND lease_expires_at <= now()
     ORDER BY lease_expires_at
     LIMIT GREATEST(COALESCE(p_limit, 50), 1)
     FOR UPDATE SKIP LOCKED
  LOOP
    _examined := _examined + 1;
    UPDATE public.assistant_turn_operations
       SET state = 'reconciliation', reconciliation_required = true,
           detail = 'stale_lease', updated_at = now()
     WHERE operation_id = _r.operation_id;
    _flagged := _flagged + 1;
  END LOOP;
  RETURN jsonb_build_object('examined', _examined, 'flagged', _flagged);
END;
$function$;

REVOKE ALL ON FUNCTION public.assistant_turn_reconcile_stale(integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.assistant_turn_reconcile_stale(integer) FROM anon;
REVOKE ALL ON FUNCTION public.assistant_turn_reconcile_stale(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.assistant_turn_reconcile_stale(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 9) Заличаване САМО на изтекъл товар — счетоводството и съобщенията остават.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sweep_expired_assistant_turn_results(
  p_limit integer,
  p_dry_run boolean
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _due integer := 0;
  _cleared integer := 0;
BEGIN
  SELECT count(*) INTO _due FROM public.assistant_turn_operations
   WHERE result IS NOT NULL AND result_expires_at IS NOT NULL
     AND result_expires_at <= now();

  IF COALESCE(p_dry_run, false) THEN
    RETURN jsonb_build_object('due', _due, 'cleared', 0, 'dry_run', true);
  END IF;

  WITH victims AS (
    SELECT operation_id FROM public.assistant_turn_operations
     WHERE result IS NOT NULL AND result_expires_at IS NOT NULL
       AND result_expires_at <= now()
     ORDER BY result_expires_at
     LIMIT GREATEST(COALESCE(p_limit, 500), 1)
     FOR UPDATE SKIP LOCKED
  ), cleared AS (
    UPDATE public.assistant_turn_operations o
       SET result = NULL, updated_at = now()
      FROM victims v
     WHERE o.operation_id = v.operation_id
     RETURNING o.operation_id
  )
  SELECT count(*) INTO _cleared FROM cleared;

  RETURN jsonb_build_object('due', _due, 'cleared', _cleared, 'dry_run', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.sweep_expired_assistant_turn_results(integer, boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sweep_expired_assistant_turn_results(integer, boolean) FROM anon;
REVOKE ALL ON FUNCTION public.sweep_expired_assistant_turn_results(integer, boolean) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.sweep_expired_assistant_turn_results(integer, boolean) TO service_role;

-- ---------------------------------------------------------------------------
-- 10) Заличаване по искане на потребител: пада товарът, остава минималното
--     счетоводство (състояние, резервация, време) без съдържание.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.purge_assistant_turn_payloads(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _cleared integer := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RETURN jsonb_build_object('cleared', 0);
  END IF;
  WITH cleared AS (
    UPDATE public.assistant_turn_operations
       SET result = NULL, result_expires_at = NULL, detail = NULL, updated_at = now()
     WHERE user_id = p_user_id AND (result IS NOT NULL OR detail IS NOT NULL)
     RETURNING operation_id
  )
  SELECT count(*) INTO _cleared FROM cleared;
  RETURN jsonb_build_object('cleared', _cleared);
END;
$function$;

REVOKE ALL ON FUNCTION public.purge_assistant_turn_payloads(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_assistant_turn_payloads(uuid) FROM anon;
REVOKE ALL ON FUNCTION public.purge_assistant_turn_payloads(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.purge_assistant_turn_payloads(uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 11) Само-четящото преброяване за retention обхваща и ходовете на асистента.
--     Същият подпис и същите права — САМО четене, никакво маркиране.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.retention_due_counts()
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT jsonb_build_object(
    'anon_due', (
      SELECT count(*) FROM public.anon_delivery_operations
       WHERE response IS NOT NULL
         AND response_expires_at IS NOT NULL
         AND response_expires_at <= now()
    ),
    'review_due', (
      SELECT count(*) FROM public.review_operations
       WHERE response IS NOT NULL
         AND response_expires_at IS NOT NULL
         AND response_expires_at <= now()
    ),
    'quota_results_due', (
      SELECT count(*) FROM public.quota_operations
       WHERE result_ref IS NOT NULL
         AND result_ref_expires_at IS NOT NULL
         AND result_ref_expires_at <= now()
    ),
    'wave_results_due', (
      SELECT count(*) FROM public.quota_wave_operations
       WHERE result IS NOT NULL
         AND result_expires_at IS NOT NULL
         AND result_expires_at <= now()
    ),
    'assistant_results_due', (
      SELECT count(*) FROM public.assistant_turn_operations
       WHERE result IS NOT NULL
         AND result_expires_at IS NOT NULL
         AND result_expires_at <= now()
    ),
    'assistant_stale_due', (
      SELECT count(*) FROM public.assistant_turn_operations
       WHERE state = 'reserved'
         AND lease_expires_at IS NOT NULL
         AND lease_expires_at <= now()
    ),
    'wave_stale_due', (
      SELECT count(*) FROM public.quota_wave_operations
       WHERE state = 'reserved'
         AND lease_expires_at IS NOT NULL
         AND lease_expires_at <= now()
         AND COALESCE(detail->>'reconciliation_flagged', '') <> 'true'
    ),
    'operations_stale_due', (
      SELECT count(*) FROM public.quota_operations
       WHERE state = 'reserved'
         AND lease_expires_at IS NOT NULL
         AND lease_expires_at <= now()
    )
  );
$function$;

REVOKE ALL ON FUNCTION public.retention_due_counts() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.retention_due_counts() FROM anon;
REVOKE ALL ON FUNCTION public.retention_due_counts() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.retention_due_counts() TO service_role;
