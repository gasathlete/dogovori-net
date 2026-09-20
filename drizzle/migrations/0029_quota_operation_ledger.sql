-- 0029_quota_operation_ledger.sql
--
-- ДЪЛГОТРАЙЕН ЛЕДЖЪР ЗА ОПЕРАЦИИ (резервация → потвърждение / отмяна).
--
-- Цел: „точно веднъж" да е доказуемо, а не предполагаемо. Досега сървърните
-- функции таксуваха квота и при неуспех извикваха refund_quota, без да четат
-- резултата и без да знаят от кой кошер е отнето. Този леджър записва точния
-- източник (план / topup / бонус / сесийно преизползване) и позволява
-- безопасно повторение по ключ на операцията.
--
-- СЪВМЕСТИМОСТ: публичните RPC-та consume_quota / consume_quota_session /
-- refund_quota / charge_corrections_wave остават непокътнати по подпис и
-- поведение. Новите функции ги допълват, не ги заместват.
--
-- ТАЗИ МИГРАЦИЯ НЕ Е ПРИЛОЖЕНА към базата.

-- ---------------------------------------------------------------------------
-- 1) Вътрешно потребление по подаден потребител (същата логика като
--    consume_quota, но без зависимост от auth.uid(), за да е ползваемо от
--    service_role). Връща изричен 'source' за всяко успешно потребление.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consume_quota_for(_uid uuid, _kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.download_quota%ROWTYPE;
  _is_pro boolean;
  _free_monthly_cap integer;
  _pro_monthly_cap integer;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF _kind NOT IN ('contract','template','analysis') THEN
    RAISE EXCEPTION 'invalid kind' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _row FROM public.download_quota WHERE user_id = _uid FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.download_quota (user_id) VALUES (_uid) RETURNING * INTO _row;
  END IF;

  IF now() - _row.monthly_reset_at >= interval '30 days' THEN
    UPDATE public.download_quota
       SET monthly_contracts_used = 0, monthly_templates_used = 0,
           monthly_total_used = 0, monthly_reset_at = now()
     WHERE user_id = _uid;
    _row.monthly_contracts_used := 0;
    _row.monthly_templates_used := 0;
    _row.monthly_total_used := 0;
    _row.monthly_reset_at := now();
  END IF;

  _is_pro := _row.plan = 'pro'::public.user_plan
             OR (_row.pro_until IS NOT NULL AND _row.pro_until > now());

  IF now() - _row.signup_at < interval '30 days' THEN
    _free_monthly_cap := 5;
  ELSE
    _free_monthly_cap := 2;
  END IF;

  _pro_monthly_cap := COALESCE(_row.plan_ops_cap, 100);

  IF _is_pro THEN
    IF now() - _row.pro_period_start >= interval '30 days' THEN
      UPDATE public.download_quota
         SET pro_monthly_used = 0, pro_period_start = now()
       WHERE user_id = _uid;
      _row.pro_monthly_used := 0;
    END IF;

    IF _row.pro_monthly_used < _pro_monthly_cap THEN
      UPDATE public.download_quota
         SET pro_monthly_used = pro_monthly_used + 1,
             total_used = total_used + 1,
             updated_at = now(),
             contracts_used = CASE WHEN _kind = 'contract' THEN contracts_used + 1 ELSE contracts_used END,
             templates_used = CASE WHEN _kind = 'template' THEN templates_used + 1 ELSE templates_used END,
             analyses_used  = CASE WHEN _kind = 'analysis' THEN analyses_used + 1  ELSE analyses_used  END
       WHERE user_id = _uid;
      RETURN jsonb_build_object('ok', true, 'used_bonus', false, 'is_pro', true, 'source', 'pro_plan');
    END IF;

    IF COALESCE(_row.topup_ops_balance, 0) > 0 THEN
      UPDATE public.download_quota
         SET topup_ops_balance = topup_ops_balance - 1,
             total_used = total_used + 1,
             updated_at = now(),
             contracts_used = CASE WHEN _kind = 'contract' THEN contracts_used + 1 ELSE contracts_used END,
             templates_used = CASE WHEN _kind = 'template' THEN templates_used + 1 ELSE templates_used END,
             analyses_used  = CASE WHEN _kind = 'analysis' THEN analyses_used + 1  ELSE analyses_used  END
       WHERE user_id = _uid;
      RETURN jsonb_build_object('ok', true, 'used_bonus', true, 'is_pro', true, 'source', 'topup');
    END IF;

    RETURN jsonb_build_object('ok', false, 'reason', 'pro_limit_reached', 'is_pro', true);
  END IF;

  IF _row.monthly_total_used < _free_monthly_cap THEN
    UPDATE public.download_quota
       SET monthly_total_used = monthly_total_used + 1,
           total_used = total_used + 1,
           updated_at = now(),
           monthly_contracts_used = CASE WHEN _kind = 'contract' THEN monthly_contracts_used + 1 ELSE monthly_contracts_used END,
           monthly_templates_used = CASE WHEN _kind = 'template' THEN monthly_templates_used + 1 ELSE monthly_templates_used END,
           contracts_used = CASE WHEN _kind = 'contract' THEN contracts_used + 1 ELSE contracts_used END,
           templates_used = CASE WHEN _kind = 'template' THEN templates_used + 1 ELSE templates_used END,
           analyses_used  = CASE WHEN _kind = 'analysis' THEN analyses_used + 1  ELSE analyses_used  END
     WHERE user_id = _uid;
    RETURN jsonb_build_object('ok', true, 'used_bonus', false, 'is_pro', false, 'source', 'free_plan');
  END IF;

  IF COALESCE(_row.topup_ops_balance, 0) > 0 THEN
    UPDATE public.download_quota
       SET topup_ops_balance = topup_ops_balance - 1,
           total_used = total_used + 1,
           updated_at = now(),
           contracts_used = CASE WHEN _kind = 'contract' THEN contracts_used + 1 ELSE contracts_used END,
           templates_used = CASE WHEN _kind = 'template' THEN templates_used + 1 ELSE templates_used END,
           analyses_used  = CASE WHEN _kind = 'analysis' THEN analyses_used + 1  ELSE analyses_used  END
     WHERE user_id = _uid;
    RETURN jsonb_build_object('ok', true, 'used_bonus', true, 'is_pro', false, 'source', 'topup');
  END IF;

  -- bonus_contracts финансира САМО договори (не шаблони/анализи).
  IF _kind = 'contract' AND COALESCE(_row.bonus_contracts, 0) > 0 THEN
    UPDATE public.download_quota
       SET bonus_contracts = bonus_contracts - 1,
           total_used = total_used + 1,
           updated_at = now(),
           contracts_used = CASE WHEN _kind = 'contract' THEN contracts_used + 1 ELSE contracts_used END,
           templates_used = CASE WHEN _kind = 'template' THEN templates_used + 1 ELSE templates_used END,
           analyses_used  = CASE WHEN _kind = 'analysis' THEN analyses_used + 1  ELSE analyses_used  END
     WHERE user_id = _uid;
    RETURN jsonb_build_object('ok', true, 'used_bonus', true, 'is_pro', false, 'source', 'bonus');
  END IF;

  RETURN jsonb_build_object('ok', false, 'reason', 'quota_exceeded', 'is_pro', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.consume_quota_for(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.consume_quota_for(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 2) Леджър на операциите. operation_id е ключът за идемпотентност, подаван
--    от извикващата функция.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.quota_operations (
  operation_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('contract','template','analysis')),
  purpose text NOT NULL,
  state text NOT NULL CHECK (state IN ('reserved','committed','cancelled')),
  charged boolean NOT NULL DEFAULT false,
  -- Точният кошер: pro_plan | free_plan | topup | bonus | session_reuse
  source text,
  used_bonus boolean NOT NULL DEFAULT false,
  session_id uuid,
  doc_key text,
  batch_id uuid,
  -- Каноничен отпечатък на заявката: ключът е обвързан със СЪДЪРЖАНИЕТО.
  request_digest text,
  -- Референция към готовия резултат: повторение по същия ключ връща същото.
  result_ref jsonb,
  -- Наем на резервацията: изтекли „reserved" операции се изравняват от метача.
  lease_expires_at timestamptz,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  committed_at timestamptz,
  cancelled_at timestamptz
);

CREATE INDEX IF NOT EXISTS quota_operations_user_state_idx
  ON public.quota_operations (user_id, state, created_at DESC);

-- Метачът търси само изтекли резервации.
CREATE INDEX IF NOT EXISTS quota_operations_stale_idx
  ON public.quota_operations (lease_expires_at)
  WHERE state = 'reserved';

GRANT ALL ON public.quota_operations TO service_role;
ALTER TABLE public.quota_operations ENABLE ROW LEVEL SECURITY;
-- Без политики за anon/authenticated: леджърът е само сървърен.

-- ---------------------------------------------------------------------------
-- 3) Опашка за неуспяла компенсация — клиентът никога не получава лъжливо
--    „не сте таксувани", а операторът вижда какво чака изравняване.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.billing_reconciliation_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operation_id uuid,
  user_id uuid,
  kind text,
  reason text NOT NULL,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.billing_reconciliation_items TO service_role;
ALTER TABLE public.billing_reconciliation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff read reconciliation"
  ON public.billing_reconciliation_items FOR SELECT
  TO authenticated
  USING (public.is_staff(auth.uid()));
GRANT SELECT ON public.billing_reconciliation_items TO authenticated;

-- ---------------------------------------------------------------------------
-- 4) Леджър на временните файлове по заявка (заличаване от retention-sweeper).
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.storage_artifacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  bucket text NOT NULL,
  storage_path text NOT NULL,
  scope text NOT NULL CHECK (scope IN ('request','draft')),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  deleted_at timestamptz,
  delete_error text
);

CREATE UNIQUE INDEX IF NOT EXISTS storage_artifacts_bucket_path_key
  ON public.storage_artifacts (bucket, storage_path);
CREATE INDEX IF NOT EXISTS storage_artifacts_sweep_idx
  ON public.storage_artifacts (expires_at) WHERE deleted_at IS NULL;

-- Метачът филтрира scope='request' в БАЗАТА, преди LIMIT, за да не могат
-- изтекли draft редове да „изгладнят" заличаването на заявките.
CREATE INDEX IF NOT EXISTS storage_artifacts_request_sweep_idx
  ON public.storage_artifacts (expires_at)
  WHERE deleted_at IS NULL AND scope = 'request';

GRANT ALL ON public.storage_artifacts TO service_role;
ALTER TABLE public.storage_artifacts ENABLE ROW LEVEL SECURITY;
-- Само сървърът пише и чете; няма клиентски политики.

-- ---------------------------------------------------------------------------
-- 5) reserve / commit / cancel
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quota_reserve(
  p_operation_id uuid,
  p_user_id uuid,
  p_kind text,
  p_purpose text,
  p_session_id uuid DEFAULT NULL,
  p_doc_key text DEFAULT NULL,
  p_request_digest text DEFAULT NULL,
  p_lease_seconds integer DEFAULT 900
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _existing public.quota_operations%ROWTYPE;
  _reuse public.quota_session_charges%ROWTYPE;
  _result jsonb;
  _charged boolean := false;
  _source text := 'session_reuse';
  _used_bonus boolean := false;
  _purpose text;
  _doc_key text;
  _lease integer;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_operation_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'operation_id and user_id are required' USING ERRCODE = '22023';
  END IF;
  IF p_kind NOT IN ('contract','template','analysis') THEN
    RAISE EXCEPTION 'invalid kind' USING ERRCODE = '22023';
  END IF;

  -- Нормализация: празен текст НИКОГА не е ключ. "" → NULL.
  _purpose := COALESCE(NULLIF(btrim(p_purpose), ''), 'unspecified');
  _doc_key := NULLIF(btrim(p_doc_key), '');
  _lease := GREATEST(60, LEAST(COALESCE(p_lease_seconds, 900), 3600));

  -- СЕРИАЛИЗАЦИЯ на едновременни заявки по СЪЩИЯ ключ. Ключалката се държи до
  -- края на транзакцията, затова втори паралелен опит вижда вече записания ред
  -- и връща повторение, вместо да таксува втори път.
  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  SELECT * INTO _existing FROM public.quota_operations
   WHERE operation_id = p_operation_id FOR UPDATE;
  IF FOUND THEN
    -- ПЪЛНО ОБВЪРЗВАНЕ на ключа. Всяко несъответствие е конфликт — без
    -- таксуване и без повторно подаване на чужд резултат.
    IF _existing.user_id <> p_user_id
       OR _existing.kind <> p_kind
       OR _existing.purpose <> _purpose
       OR _existing.session_id IS DISTINCT FROM p_session_id
       OR _existing.doc_key IS DISTINCT FROM _doc_key
       OR _existing.request_digest IS DISTINCT FROM p_request_digest THEN
      RAISE EXCEPTION 'idempotency_key_conflict' USING ERRCODE = '23505';
    END IF;
    RETURN jsonb_build_object(
      'ok', _existing.state <> 'cancelled',
      'replay', true,
      'state', _existing.state,
      'charged', _existing.charged,
      'source', _existing.source,
      'used_bonus', _existing.used_bonus,
      'result_ref', _existing.result_ref,
      'operation_id', _existing.operation_id
    );
  END IF;

  -- Сесийно преизползване: ТОЧНО същият таб (session_id), същият документ и
  -- същият вид операция. Същият документ в ДРУГ таб не е безплатен.
  IF _doc_key IS NOT NULL AND p_session_id IS NOT NULL THEN
    SELECT * INTO _reuse FROM public.quota_session_charges
     WHERE user_id = p_user_id
       AND session_id = p_session_id
       AND doc_key = _doc_key
       AND kind = p_kind
       AND created_at > now() - interval '24 hours'
     ORDER BY created_at DESC LIMIT 1;
  END IF;

  IF _reuse.user_id IS NOT NULL THEN
    _charged := false;
    _source := 'session_reuse';
  ELSE
    _result := public.consume_quota_for(p_user_id, p_kind);
    IF NOT COALESCE((_result->>'ok')::boolean, false) THEN
      RETURN _result || jsonb_build_object('charged', false, 'replay', false);
    END IF;
    _charged := true;
    _source := COALESCE(_result->>'source', 'unknown');
    _used_bonus := COALESCE((_result->>'used_bonus')::boolean, false);
    IF _doc_key IS NOT NULL AND p_session_id IS NOT NULL THEN
      INSERT INTO public.quota_session_charges (user_id, session_id, doc_key, kind)
        VALUES (p_user_id, p_session_id, _doc_key, p_kind)
        ON CONFLICT (user_id, session_id, doc_key) DO NOTHING;
    END IF;
  END IF;

  INSERT INTO public.quota_operations (
    operation_id, user_id, kind, purpose, state, charged, source,
    used_bonus, session_id, doc_key, request_digest, lease_expires_at
  ) VALUES (
    p_operation_id, p_user_id, p_kind, _purpose,
    'reserved', _charged, _source, _used_bonus, p_session_id, _doc_key,
    p_request_digest, now() + make_interval(secs => _lease)
  );

  RETURN jsonb_build_object(
    'ok', true, 'replay', false, 'state', 'reserved',
    'charged', _charged, 'source', _source, 'used_bonus', _used_bonus,
    'result_ref', NULL,
    'operation_id', p_operation_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.quota_reserve(uuid, uuid, text, text, uuid, text, text, integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quota_reserve(uuid, uuid, text, text, uuid, text, text, integer) TO service_role;

-- Четене на записан резултат по ключ (за повторение след загубен отговор).
CREATE OR REPLACE FUNCTION public.quota_lookup(p_operation_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _op public.quota_operations%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO _op FROM public.quota_operations WHERE operation_id = p_operation_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;
  RETURN jsonb_build_object(
    'found', true, 'state', _op.state, 'charged', _op.charged,
    'user_id', _op.user_id, 'kind', _op.kind, 'purpose', _op.purpose,
    'request_digest', _op.request_digest, 'result_ref', _op.result_ref
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.quota_lookup(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quota_lookup(uuid) TO service_role;

-- Потвърждение. Готовият резултат се обвързва с операцията В САМОТО
-- потвърждение, за да може повторение по същия ключ да върне същия резултат.
CREATE OR REPLACE FUNCTION public.quota_commit(p_operation_id uuid, p_result_ref jsonb DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _op public.quota_operations%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  SELECT * INTO _op FROM public.quota_operations
   WHERE operation_id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_operation');
  END IF;
  IF _op.state = 'committed' THEN
    RETURN jsonb_build_object('ok', true, 'replay', true, 'state', 'committed',
                              'charged', _op.charged, 'result_ref', _op.result_ref);
  END IF;
  IF _op.state = 'cancelled' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'commit_after_cancel', 'state', 'cancelled');
  END IF;

  UPDATE public.quota_operations
     SET state = 'committed', committed_at = now(), updated_at = now(),
         lease_expires_at = NULL,
         result_ref = COALESCE(p_result_ref, result_ref)
   WHERE operation_id = p_operation_id;

  RETURN jsonb_build_object('ok', true, 'replay', false, 'state', 'committed',
                            'charged', _op.charged,
                            'result_ref', COALESCE(p_result_ref, _op.result_ref));
END;
$function$;

REVOKE ALL ON FUNCTION public.quota_commit(uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quota_commit(uuid, jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.quota_cancel(p_operation_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _op public.quota_operations%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_operation_id::text, 0));

  SELECT * INTO _op FROM public.quota_operations
   WHERE operation_id = p_operation_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'unknown_operation');
  END IF;
  IF _op.state = 'cancelled' THEN
    RETURN jsonb_build_object('ok', true, 'replay', true, 'state', 'cancelled', 'charged', false);
  END IF;
  IF _op.state = 'committed' THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'cancel_after_commit', 'state', 'committed');
  END IF;

  -- ТОЧНО обратно записване спрямо ЗАПИСАНИЯ източник: връщаме само това,
  -- което реално е било увеличено/намалено при потреблението.
  IF _op.charged THEN
    IF _op.source = 'topup' THEN
      UPDATE public.download_quota
         SET topup_ops_balance = COALESCE(topup_ops_balance, 0) + 1,
             total_used = GREATEST(0, total_used - 1),
             updated_at = now()
       WHERE user_id = _op.user_id;
    ELSIF _op.source = 'bonus' THEN
      UPDATE public.download_quota
         SET bonus_contracts = COALESCE(bonus_contracts, 0) + 1,
             total_used = GREATEST(0, total_used - 1),
             updated_at = now()
       WHERE user_id = _op.user_id;
    ELSIF _op.source = 'pro_plan' THEN
      UPDATE public.download_quota
         SET pro_monthly_used = GREATEST(0, COALESCE(pro_monthly_used, 0) - 1),
             total_used = GREATEST(0, total_used - 1),
             updated_at = now()
       WHERE user_id = _op.user_id;
    ELSIF _op.source = 'free_plan' THEN
      -- monthly_contracts_used / monthly_templates_used се увеличават САМО по
      -- безплатния план, затова САМО тук се намаляват.
      UPDATE public.download_quota
         SET monthly_total_used = GREATEST(0, COALESCE(monthly_total_used, 0) - 1),
             monthly_contracts_used = CASE WHEN _op.kind = 'contract'
               THEN GREATEST(0, COALESCE(monthly_contracts_used, 0) - 1)
               ELSE monthly_contracts_used END,
             monthly_templates_used = CASE WHEN _op.kind = 'template'
               THEN GREATEST(0, COALESCE(monthly_templates_used, 0) - 1)
               ELSE monthly_templates_used END,
             total_used = GREATEST(0, total_used - 1),
             updated_at = now()
       WHERE user_id = _op.user_id;
    ELSE
      -- Неизвестен източник: не гадаем. Операцията се маркира за изравняване.
      INSERT INTO public.billing_reconciliation_items (operation_id, user_id, kind, reason, detail)
        VALUES (_op.operation_id, _op.user_id, _op.kind, 'unknown_source_on_cancel',
                jsonb_build_object('source', _op.source, 'cancel_reason', p_reason));
      UPDATE public.quota_operations
         SET state = 'cancelled', cancelled_at = now(), updated_at = now(),
             lease_expires_at = NULL,
             detail = detail || jsonb_build_object('reconciliation_required', true)
       WHERE operation_id = p_operation_id;
      RETURN jsonb_build_object('ok', false, 'reason', 'reconciliation_required', 'state', 'cancelled');
    END IF;

    -- Пожизнените броячи по вид се увеличават при ВСЕКИ реално таксуван
    -- източник, затова се връщат веднъж за всяко таксуване.
    IF _op.kind = 'contract' THEN
      UPDATE public.download_quota
         SET contracts_used = GREATEST(0, contracts_used - 1)
       WHERE user_id = _op.user_id;
    ELSIF _op.kind = 'template' THEN
      UPDATE public.download_quota
         SET templates_used = GREATEST(0, templates_used - 1)
       WHERE user_id = _op.user_id;
    ELSIF _op.kind = 'analysis' THEN
      UPDATE public.download_quota
         SET analyses_used = GREATEST(0, analyses_used - 1)
       WHERE user_id = _op.user_id;
    END IF;

    -- Сесийният запис също пада, за да не блокира бъдещо легитимно таксуване.
    IF _op.session_id IS NOT NULL AND _op.doc_key IS NOT NULL THEN
      DELETE FROM public.quota_session_charges
       WHERE user_id = _op.user_id AND session_id = _op.session_id AND doc_key = _op.doc_key;
    END IF;
  END IF;

  UPDATE public.quota_operations
     SET state = 'cancelled', cancelled_at = now(), updated_at = now(),
         lease_expires_at = NULL,
         detail = detail || jsonb_build_object('cancel_reason', COALESCE(p_reason, 'unspecified'))
   WHERE operation_id = p_operation_id;

  RETURN jsonb_build_object('ok', true, 'replay', false, 'state', 'cancelled', 'charged', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.quota_cancel(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quota_cancel(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- 5б) ИЗРАВНЯВАНЕ на изтекли резервации. Изпълнява се от retention-sweeper.
--     Заключва редовете, отменя точно веднъж и записва неясните случаи.
--     Потвърдените операции НЕ се пипат.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.quota_reconcile_stale(p_limit integer DEFAULT 50)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row record;
  _res jsonb;
  _examined integer := 0;
  _cancelled integer := 0;
  _unresolved integer := 0;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  FOR _row IN
    SELECT operation_id FROM public.quota_operations
     WHERE state = 'reserved'
       AND lease_expires_at IS NOT NULL
       AND lease_expires_at < now()
     ORDER BY lease_expires_at
     LIMIT GREATEST(1, LEAST(COALESCE(p_limit, 50), 500))
     FOR UPDATE SKIP LOCKED
  LOOP
    _examined := _examined + 1;
    _res := public.quota_cancel(_row.operation_id, 'lease_expired');
    IF COALESCE((_res->>'ok')::boolean, false) THEN
      _cancelled := _cancelled + 1;
    ELSE
      _unresolved := _unresolved + 1;
      INSERT INTO public.billing_reconciliation_items (operation_id, reason, detail)
        VALUES (_row.operation_id, 'stale_cancel_unresolved', _res);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('examined', _examined, 'cancelled', _cancelled, 'unresolved', _unresolved);
END;
$function$;

REVOKE ALL ON FUNCTION public.quota_reconcile_stale(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.quota_reconcile_stale(integer) TO service_role;

-- ---------------------------------------------------------------------------
-- 6) Вълни поправки: точна, идемпотентна отмяна.
--
-- corrections_batch_charges пази само общия брой операции, затова досега
-- отмяната гадаеше кошера. Добавяме точния разрез (план/topup) и функция за
-- отмяна, идемпотентна по batch_id. Подписът и връщаните ключове на
-- charge_corrections_wave се запазват (добавят се само нови ключове).
-- ---------------------------------------------------------------------------
ALTER TABLE public.corrections_batch_charges
  ADD COLUMN IF NOT EXISTS from_plan integer,
  ADD COLUMN IF NOT EXISTS from_topup integer,
  ADD COLUMN IF NOT EXISTS was_pro boolean,
  ADD COLUMN IF NOT EXISTS cancelled_at timestamptz;

CREATE OR REPLACE FUNCTION public.cancel_corrections_wave(p_user_id uuid, p_batch_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.corrections_batch_charges%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO _row FROM public.corrections_batch_charges
   WHERE user_id = p_user_id AND batch_id = p_batch_id
   FOR UPDATE;

  IF NOT FOUND THEN
    -- Нямаше таксуване по този ключ — отмяната е безпредметна и безопасна.
    RETURN jsonb_build_object('ok', true, 'replay', true, 'charged', false);
  END IF;

  IF _row.cancelled_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', true, 'replay', true, 'charged', false);
  END IF;

  IF _row.from_plan IS NULL OR _row.from_topup IS NULL THEN
    -- Стар запис без точен разрез: не гадаем, а искаме изравняване.
    INSERT INTO public.billing_reconciliation_items (user_id, kind, reason, detail)
      VALUES (p_user_id, 'analysis', 'corrections_wave_split_unknown',
              jsonb_build_object('batch_id', p_batch_id, 'ops_charged', _row.ops_charged, 'cancel_reason', p_reason));
    RETURN jsonb_build_object('ok', false, 'reason', 'reconciliation_required');
  END IF;

  IF COALESCE(_row.was_pro, false) THEN
    UPDATE public.download_quota
       SET pro_monthly_used = GREATEST(0, COALESCE(pro_monthly_used, 0) - _row.from_plan),
           topup_ops_balance = COALESCE(topup_ops_balance, 0) + _row.from_topup,
           updated_at = now()
     WHERE user_id = p_user_id;
  ELSE
    UPDATE public.download_quota
       SET monthly_total_used = GREATEST(0, COALESCE(monthly_total_used, 0) - _row.from_plan),
           topup_ops_balance = COALESCE(topup_ops_balance, 0) + _row.from_topup,
           updated_at = now()
     WHERE user_id = p_user_id;
  END IF;

  UPDATE public.corrections_batch_charges
     SET cancelled_at = now()
   WHERE id = _row.id;

  RETURN jsonb_build_object('ok', true, 'replay', false, 'charged', false);
END;
$function$;

REVOKE ALL ON FUNCTION public.cancel_corrections_wave(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cancel_corrections_wave(uuid, uuid, text) TO service_role;

-- Отменените вълни вече не блокират ново легитимно таксуване по същия ключ:
-- charge_corrections_wave се допълва да игнорира отменените записи и да
-- записва точния разрез. Подписът остава същият.
CREATE OR REPLACE FUNCTION public.charge_corrections_wave(p_user_id uuid, p_batch_id uuid, p_count integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_ops integer;
  v_quota record;
  v_is_pro boolean;
  v_cap integer;
  v_used integer;
  v_from_plan integer;
  v_from_topup integer;
  v_remaining_plan integer;
  v_existing record;
BEGIN
  IF p_count IS NULL OR p_count < 1 THEN
    p_count := 1;
  END IF;

  IF p_batch_id IS NOT NULL THEN
    SELECT * INTO v_existing
      FROM public.corrections_batch_charges
      WHERE user_id = p_user_id AND batch_id = p_batch_id AND cancelled_at IS NULL
      LIMIT 1;
    IF FOUND THEN
      RETURN jsonb_build_object('ok', true, 'ops_charged', v_existing.ops_charged, 'cached', true);
    END IF;
  END IF;

  v_ops := GREATEST(1, CEIL(p_count::numeric / 5))::integer;

  SELECT * INTO v_quota FROM public.download_quota
    WHERE user_id = p_user_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'download_quota row missing for user %', p_user_id;
  END IF;

  v_is_pro := (v_quota.plan = 'pro') OR (v_quota.pro_until IS NOT NULL AND v_quota.pro_until > now());
  v_cap := COALESCE(v_quota.plan_ops_cap, CASE WHEN v_is_pro THEN 100 ELSE 10 END);
  v_used := CASE WHEN v_is_pro THEN COALESCE(v_quota.pro_monthly_used, 0)
                 ELSE COALESCE(v_quota.monthly_total_used, 0) END;

  v_remaining_plan := GREATEST(0, v_cap - v_used);
  v_from_plan := LEAST(v_ops, v_remaining_plan);
  v_from_topup := v_ops - v_from_plan;

  IF v_from_topup > COALESCE(v_quota.topup_ops_balance, 0) THEN
    RETURN jsonb_build_object(
      'ok', false,
      'reason', 'insufficient_quota',
      'ops_needed', v_ops,
      'remaining_plan', v_remaining_plan,
      'topup_balance', COALESCE(v_quota.topup_ops_balance, 0)
    );
  END IF;

  IF v_is_pro THEN
    UPDATE public.download_quota
      SET pro_monthly_used = COALESCE(pro_monthly_used, 0) + v_from_plan,
          topup_ops_balance = COALESCE(topup_ops_balance, 0) - v_from_topup
      WHERE user_id = p_user_id;
  ELSE
    UPDATE public.download_quota
      SET monthly_total_used = COALESCE(monthly_total_used, 0) + v_from_plan,
          topup_ops_balance = COALESCE(topup_ops_balance, 0) - v_from_topup
      WHERE user_id = p_user_id;
  END IF;

  IF p_batch_id IS NOT NULL THEN
    INSERT INTO public.corrections_batch_charges(user_id, batch_id, ops_charged, from_plan, from_topup, was_pro)
      VALUES (p_user_id, p_batch_id, v_ops, v_from_plan, v_from_topup, v_is_pro);
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'ops_charged', v_ops,
    'from_plan', v_from_plan,
    'from_topup', v_from_topup,
    'cached', false
  );
END;
$function$;

-- ---------------------------------------------------------------------------
-- 7) ТРАЕН РЕЗУЛТАТ за вълните поправки (refine-contract).
--
-- p_batch_id вече е ЗАДЪЛЖИТЕЛЕН в извикващия код: без него нямаше траен ред и
-- „отмяната" не отменяше нищо. Тук добавяме и обвързване със съдържанието на
-- заявката + записан резултат, за да е повторението по същия ключ същият
-- резултат, без второ таксуване.
-- ---------------------------------------------------------------------------
ALTER TABLE public.corrections_batch_charges
  ADD COLUMN IF NOT EXISTS request_digest text,
  ADD COLUMN IF NOT EXISTS result_ref jsonb;

CREATE OR REPLACE FUNCTION public.corrections_wave_bind(
  p_user_id uuid,
  p_batch_id uuid,
  p_request_digest text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.corrections_batch_charges%ROWTYPE;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  IF p_batch_id IS NULL OR p_user_id IS NULL THEN
    RAISE EXCEPTION 'batch_id and user_id are required' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(p_batch_id::text, 0));

  SELECT * INTO _row FROM public.corrections_batch_charges
   WHERE user_id = p_user_id AND batch_id = p_batch_id AND cancelled_at IS NULL
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('found', false);
  END IF;

  -- Ключът е обвързан със съдържанието: чужд/променен товар е конфликт.
  IF _row.request_digest IS NOT NULL
     AND p_request_digest IS NOT NULL
     AND _row.request_digest <> p_request_digest THEN
    RAISE EXCEPTION 'idempotency_key_conflict' USING ERRCODE = '23505';
  END IF;
  IF _row.request_digest IS NULL AND p_request_digest IS NOT NULL THEN
    UPDATE public.corrections_batch_charges
       SET request_digest = p_request_digest
     WHERE id = _row.id;
  END IF;

  RETURN jsonb_build_object(
    'found', true,
    'ops_charged', _row.ops_charged,
    'result_ref', _row.result_ref
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.corrections_wave_bind(uuid, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.corrections_wave_bind(uuid, uuid, text) TO service_role;

CREATE OR REPLACE FUNCTION public.corrections_wave_set_result(
  p_user_id uuid,
  p_batch_id uuid,
  p_result_ref jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _updated integer;
BEGIN
  IF auth.role() <> 'service_role' AND NOT public.is_staff(auth.uid()) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;
  UPDATE public.corrections_batch_charges
     SET result_ref = COALESCE(p_result_ref, result_ref)
   WHERE user_id = p_user_id AND batch_id = p_batch_id AND cancelled_at IS NULL;
  GET DIAGNOSTICS _updated = ROW_COUNT;
  RETURN jsonb_build_object('ok', _updated > 0);
END;
$function$;

REVOKE ALL ON FUNCTION public.corrections_wave_set_result(uuid, uuid, jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.corrections_wave_set_result(uuid, uuid, jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- 8) Доказателствата за AI генерирано съдържание са изнесени в миграция 0030
--    (public.article_generation_evidence). Тук съзнателно НЕ се дефинира втора
--    таблица за същото, за да няма дублиран и неползван дизайн.
-- ---------------------------------------------------------------------------
