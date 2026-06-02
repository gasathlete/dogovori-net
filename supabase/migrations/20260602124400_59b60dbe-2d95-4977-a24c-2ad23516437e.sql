-- =========================================================
-- 1) DOCUMENT THE EXISTING SCORING LOGIC (Bulgarian)
-- =========================================================
COMMENT ON FUNCTION public.consume_quota(text) IS
'Брояч на операции (1 операция = 1 единица потребление).
Видове (_kind):
  - contract  : генериране и сваляне на договор (PDF/DOCX)
  - template  : сваляне на бланка
  - analysis  : качване на документ за анализ ИЛИ прилагане на партида автоматични корекции

Безплатен план (по този ред):
  1) lifetime пул: total_used < 6  → ОК
  2) месечен пул (rolling 30 дни от monthly_reset_at): monthly_total_used < 2 → ОК
  3) bonus_contracts > 0 → ОК, минус 1 бонус (общ за всички видове)
  4) иначе → quota_exceeded, връща next_reset

Pro / Team план: rolling 30 дни от pro_period_start, кап pro_monthly_used < 100.
Над кап → pro_limit_reached.

Действия, които НЕ харчат операция:
  - преглед на живо / wizard стъпки / двуезична колона
  - повторно сваляне на вече запазен документ
  - чат с асистент
  - сваляне на бланка след вече платена операция за същия документ в същата сесия
    (виж consume_quota_session)
  - повторно прилагане на корекции от вече таксувана партида
    (виж consume_corrections_batch)';

COMMENT ON COLUMN public.download_quota.total_used            IS 'Общ брой консумирани операции (lifetime). Безплатен лимит: 6.';
COMMENT ON COLUMN public.download_quota.monthly_total_used    IS 'Операции в текущия 30-дневен прозорец (безплатен план). Лимит: 2.';
COMMENT ON COLUMN public.download_quota.monthly_reset_at      IS 'Начало на текущия 30-дневен прозорец за безплатния план.';
COMMENT ON COLUMN public.download_quota.pro_monthly_used      IS 'Операции в текущия 30-дневен прозорец на Pro/Team плана. Кап: 100.';
COMMENT ON COLUMN public.download_quota.pro_period_start      IS 'Начало на текущия 30-дневен прозорец на Pro/Team плана.';
COMMENT ON COLUMN public.download_quota.bonus_contracts       IS 'Закупен пакет операции (генерализиран — важи и за contract, и за template, и за analysis). Не изтича.';
COMMENT ON COLUMN public.download_quota.contracts_used        IS 'Per-kind брояч (lifetime) за contract — за статистика.';
COMMENT ON COLUMN public.download_quota.templates_used        IS 'Per-kind брояч (lifetime) за template — за статистика.';
COMMENT ON COLUMN public.download_quota.analyses_used         IS 'Per-kind брояч (lifetime) за analysis — за статистика.';
COMMENT ON COLUMN public.download_quota.monthly_contracts_used IS 'Per-kind брояч в текущия 30-дневен прозорец за contract — за статистика.';
COMMENT ON COLUMN public.download_quota.monthly_templates_used IS 'Per-kind брояч в текущия 30-дневен прозорец за template — за статистика.';

-- =========================================================
-- 2) SESSION-SCOPED FREE REUSE (blank-after-contract etc.)
-- =========================================================
CREATE TABLE IF NOT EXISTS public.quota_session_charges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  session_id  uuid NOT NULL,
  doc_key     text NOT NULL,
  kind        text NOT NULL CHECK (kind IN ('contract','template','analysis')),
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_id, doc_key)
);

COMMENT ON TABLE public.quota_session_charges IS
'Записва коя ОПЕРАЦИЯ е вече таксувана в дадена браузър сесия за конкретен документ.
Позволява безплатно повторно сваляне на бланка/договор за същия документ в същата сесия.';

CREATE INDEX IF NOT EXISTS quota_session_charges_user_idx
  ON public.quota_session_charges (user_id, created_at DESC);

GRANT SELECT, INSERT ON public.quota_session_charges TO authenticated;
GRANT ALL ON public.quota_session_charges TO service_role;

ALTER TABLE public.quota_session_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qsc_select_own" ON public.quota_session_charges
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "qsc_insert_own" ON public.quota_session_charges
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "qsc_service_role" ON public.quota_session_charges
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.consume_quota_session(
  _kind       text,
  _doc_key    text,
  _session_id uuid
) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing public.quota_session_charges%ROWTYPE;
  _result jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF _kind NOT IN ('contract','template','analysis') THEN
    RAISE EXCEPTION 'invalid kind' USING ERRCODE = '22023';
  END IF;
  IF _doc_key IS NULL OR length(_doc_key) = 0 OR _session_id IS NULL THEN
    -- Fallback to regular consume when client did not supply session info.
    RETURN public.consume_quota(_kind);
  END IF;

  SELECT * INTO _existing
    FROM public.quota_session_charges
   WHERE user_id = _uid AND session_id = _session_id AND doc_key = _doc_key
   FOR UPDATE;

  IF FOUND THEN
    -- Already paid in this session for this doc — no new charge.
    RETURN jsonb_build_object(
      'ok', true,
      'charged', false,
      'used_bonus', false,
      'is_pro', (SELECT plan = 'pro'::public.user_plan
                        OR (pro_until IS NOT NULL AND pro_until > now())
                  FROM public.download_quota WHERE user_id = _uid),
      'reused_session_charge', true
    );
  END IF;

  _result := public.consume_quota(_kind);

  IF COALESCE((_result->>'ok')::boolean, false) THEN
    INSERT INTO public.quota_session_charges (user_id, session_id, doc_key, kind)
      VALUES (_uid, _session_id, _doc_key, _kind)
      ON CONFLICT (user_id, session_id, doc_key) DO NOTHING;
    _result := _result || jsonb_build_object('charged', true);
  ELSE
    _result := _result || jsonb_build_object('charged', false);
  END IF;

  RETURN _result;
END;
$$;

-- =========================================================
-- 3) BATCH-SCOPED CORRECTIONS
-- =========================================================
CREATE TABLE IF NOT EXISTS public.corrections_batch_charges (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL,
  session_id  uuid NOT NULL,
  batch_id    uuid NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_id, batch_id)
);

COMMENT ON TABLE public.corrections_batch_charges IS
'Една партида корекции = 1 операция analysis. Записва кои партиди вече са таксувани,
така че повторно прилагане на същата партида да не води до нова такса.';

CREATE INDEX IF NOT EXISTS corrections_batch_charges_user_idx
  ON public.corrections_batch_charges (user_id, created_at DESC);

GRANT SELECT, INSERT ON public.corrections_batch_charges TO authenticated;
GRANT ALL ON public.corrections_batch_charges TO service_role;

ALTER TABLE public.corrections_batch_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "cbc_select_own" ON public.corrections_batch_charges
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "cbc_insert_own" ON public.corrections_batch_charges
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "cbc_service_role" ON public.corrections_batch_charges
  FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.consume_corrections_batch(
  _session_id uuid,
  _batch_id   uuid
) RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  _uid uuid := auth.uid();
  _existing public.corrections_batch_charges%ROWTYPE;
  _result jsonb;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF _session_id IS NULL OR _batch_id IS NULL THEN
    -- No batch info — charge as a normal analysis op.
    RETURN public.consume_quota('analysis') || jsonb_build_object('charged', true);
  END IF;

  SELECT * INTO _existing
    FROM public.corrections_batch_charges
   WHERE user_id = _uid AND session_id = _session_id AND batch_id = _batch_id
   FOR UPDATE;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'ok', true,
      'charged', false,
      'is_pro', (SELECT plan = 'pro'::public.user_plan
                        OR (pro_until IS NOT NULL AND pro_until > now())
                  FROM public.download_quota WHERE user_id = _uid),
      'reused_batch_charge', true
    );
  END IF;

  _result := public.consume_quota('analysis');

  IF COALESCE((_result->>'ok')::boolean, false) THEN
    INSERT INTO public.corrections_batch_charges (user_id, session_id, batch_id)
      VALUES (_uid, _session_id, _batch_id)
      ON CONFLICT (user_id, session_id, batch_id) DO NOTHING;
    _result := _result || jsonb_build_object('charged', true);
  ELSE
    _result := _result || jsonb_build_object('charged', false);
  END IF;

  RETURN _result;
END;
$$;