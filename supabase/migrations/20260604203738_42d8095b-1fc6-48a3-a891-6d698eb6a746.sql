
-- New columns for free-tier feature counters
ALTER TABLE public.download_quota
  ADD COLUMN IF NOT EXISTS ai_messages_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS analysis_previews_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS bilingual_previews_used integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS features_reset_at timestamptz NOT NULL DEFAULT now();

-- ============================================================
-- Replace consume_quota: Free → 3 ops/month, PRO unchanged.
-- ============================================================
CREATE OR REPLACE FUNCTION public.consume_quota(_kind text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.download_quota%ROWTYPE;
  _is_pro boolean;
  _free_monthly_cap integer := 3;
  _pro_monthly_cap integer := 100;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  IF _kind NOT IN ('contract','template','analysis') THEN
    RAISE EXCEPTION 'invalid kind' USING ERRCODE = '22023';
  END IF;

  SELECT * INTO _row FROM public.download_quota
   WHERE user_id = _uid FOR UPDATE;

  IF NOT FOUND THEN
    INSERT INTO public.download_quota (user_id) VALUES (_uid)
      RETURNING * INTO _row;
  END IF;

  -- Roll the monthly free counter if 30+ days elapsed
  IF now() - _row.monthly_reset_at >= interval '30 days' THEN
    UPDATE public.download_quota
       SET monthly_contracts_used = 0,
           monthly_templates_used = 0,
           monthly_total_used = 0,
           monthly_reset_at = now()
     WHERE user_id = _uid;
    _row.monthly_contracts_used := 0;
    _row.monthly_templates_used := 0;
    _row.monthly_total_used := 0;
    _row.monthly_reset_at := now();
  END IF;

  _is_pro := _row.plan = 'pro'::public.user_plan
             OR (_row.pro_until IS NOT NULL AND _row.pro_until > now());

  -- Pro path: 100/month aggregate cap
  IF _is_pro THEN
    IF now() - _row.pro_period_start >= interval '30 days' THEN
      UPDATE public.download_quota
         SET pro_monthly_used = 0,
             pro_period_start = now()
       WHERE user_id = _uid;
      _row.pro_monthly_used := 0;
      _row.pro_period_start := now();
    END IF;

    IF _row.pro_monthly_used >= _pro_monthly_cap THEN
      RETURN jsonb_build_object(
        'ok', false,
        'reason', 'pro_limit_reached',
        'is_pro', true,
        'pro_monthly_used', _row.pro_monthly_used,
        'pro_monthly_cap', _pro_monthly_cap,
        'pro_period_start', _row.pro_period_start
      );
    END IF;

    UPDATE public.download_quota
       SET pro_monthly_used = pro_monthly_used + 1,
           total_used = total_used + 1,
           updated_at = now(),
           contracts_used = CASE WHEN _kind = 'contract' THEN contracts_used + 1 ELSE contracts_used END,
           templates_used = CASE WHEN _kind = 'template' THEN templates_used + 1 ELSE templates_used END,
           analyses_used  = CASE WHEN _kind = 'analysis' THEN analyses_used + 1  ELSE analyses_used  END
     WHERE user_id = _uid;
    RETURN jsonb_build_object('ok', true, 'used_bonus', false, 'is_pro', true);
  END IF;

  -- Free path: clean 3/month, no lifetime bucket
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
    RETURN jsonb_build_object('ok', true, 'used_bonus', false, 'is_pro', false,
                              'free_monthly_used', _row.monthly_total_used + 1,
                              'free_monthly_cap', _free_monthly_cap);
  END IF;

  -- Legacy bonus contracts still honored for backward compatibility
  IF _row.bonus_contracts > 0 THEN
    UPDATE public.download_quota
       SET bonus_contracts = bonus_contracts - 1,
           total_used = total_used + 1,
           updated_at = now(),
           contracts_used = CASE WHEN _kind = 'contract' THEN contracts_used + 1 ELSE contracts_used END,
           templates_used = CASE WHEN _kind = 'template' THEN templates_used + 1 ELSE templates_used END,
           analyses_used  = CASE WHEN _kind = 'analysis' THEN analyses_used + 1  ELSE analyses_used  END
     WHERE user_id = _uid;
    RETURN jsonb_build_object('ok', true, 'used_bonus', true, 'is_pro', false);
  END IF;

  RETURN jsonb_build_object(
    'ok', false,
    'reason', 'quota_exceeded',
    'is_pro', false,
    'free_monthly_cap', _free_monthly_cap,
    'next_reset', _row.monthly_reset_at + interval '30 days'
  );
END;
$function$;

-- ============================================================
-- Helper: roll feature counters (AI msgs, analysis/bilingual previews)
-- on a shared 30d window.
-- ============================================================
CREATE OR REPLACE FUNCTION public._roll_feature_counters(_uid uuid)
RETURNS public.download_quota
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _row public.download_quota%ROWTYPE;
BEGIN
  SELECT * INTO _row FROM public.download_quota WHERE user_id = _uid FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.download_quota (user_id) VALUES (_uid) RETURNING * INTO _row;
  END IF;
  IF now() - _row.features_reset_at >= interval '30 days' THEN
    UPDATE public.download_quota
       SET ai_messages_used = 0,
           analysis_previews_used = 0,
           bilingual_previews_used = 0,
           features_reset_at = now()
     WHERE user_id = _uid;
    _row.ai_messages_used := 0;
    _row.analysis_previews_used := 0;
    _row.bilingual_previews_used := 0;
    _row.features_reset_at := now();
  END IF;
  RETURN _row;
END;
$function$;

-- ============================================================
-- consume_ai_message: Free 5/mo, PRO/Team unlimited (within their op cap).
-- ============================================================
CREATE OR REPLACE FUNCTION public.consume_ai_message()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.download_quota%ROWTYPE;
  _is_pro boolean;
  _free_cap integer := 5;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  _row := public._roll_feature_counters(_uid);
  _is_pro := _row.plan = 'pro'::public.user_plan
             OR (_row.pro_until IS NOT NULL AND _row.pro_until > now());

  IF _is_pro THEN
    RETURN jsonb_build_object('ok', true, 'is_pro', true);
  END IF;

  IF _row.ai_messages_used >= _free_cap THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'ai_limit_reached',
                              'used', _row.ai_messages_used, 'cap', _free_cap);
  END IF;

  UPDATE public.download_quota
     SET ai_messages_used = ai_messages_used + 1, updated_at = now()
   WHERE user_id = _uid;
  RETURN jsonb_build_object('ok', true, 'is_pro', false,
                            'used', _row.ai_messages_used + 1, 'cap', _free_cap);
END;
$function$;

-- ============================================================
-- consume_analysis_preview: Free 1/mo preview, PRO unlimited.
-- ============================================================
CREATE OR REPLACE FUNCTION public.consume_analysis_preview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.download_quota%ROWTYPE;
  _is_pro boolean;
  _free_cap integer := 1;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  _row := public._roll_feature_counters(_uid);
  _is_pro := _row.plan = 'pro'::public.user_plan
             OR (_row.pro_until IS NOT NULL AND _row.pro_until > now());

  IF _is_pro THEN
    RETURN jsonb_build_object('ok', true, 'tier', 'full', 'is_pro', true);
  END IF;

  IF _row.analysis_previews_used >= _free_cap THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'analysis_preview_exhausted',
                              'cap', _free_cap);
  END IF;

  UPDATE public.download_quota
     SET analysis_previews_used = analysis_previews_used + 1, updated_at = now()
   WHERE user_id = _uid;
  RETURN jsonb_build_object('ok', true, 'tier', 'free_preview', 'is_pro', false,
                            'used', _row.analysis_previews_used + 1, 'cap', _free_cap);
END;
$function$;

-- ============================================================
-- consume_bilingual_preview: Free 1/mo preview of bilingual contracts.
-- ============================================================
CREATE OR REPLACE FUNCTION public.consume_bilingual_preview()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.download_quota%ROWTYPE;
  _is_pro boolean;
  _free_cap integer := 1;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  _row := public._roll_feature_counters(_uid);
  _is_pro := _row.plan = 'pro'::public.user_plan
             OR (_row.pro_until IS NOT NULL AND _row.pro_until > now());

  IF _is_pro THEN
    RETURN jsonb_build_object('ok', true, 'tier', 'full', 'is_pro', true);
  END IF;

  IF _row.bilingual_previews_used >= _free_cap THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'bilingual_preview_exhausted',
                              'cap', _free_cap);
  END IF;

  UPDATE public.download_quota
     SET bilingual_previews_used = bilingual_previews_used + 1, updated_at = now()
   WHERE user_id = _uid;
  RETURN jsonb_build_object('ok', true, 'tier', 'free_preview', 'is_pro', false,
                            'used', _row.bilingual_previews_used + 1, 'cap', _free_cap);
END;
$function$;

-- ============================================================
-- can_use_kit_slot: Free → max 1 active kit. PRO unlimited.
-- ============================================================
CREATE OR REPLACE FUNCTION public.can_use_kit_slot()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid := auth.uid();
  _row public.download_quota%ROWTYPE;
  _is_pro boolean;
  _active_count integer;
  _free_cap integer := 1;
BEGIN
  IF _uid IS NULL THEN
    RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000';
  END IF;
  SELECT * INTO _row FROM public.download_quota WHERE user_id = _uid;
  _is_pro := FOUND AND (_row.plan = 'pro'::public.user_plan
             OR (_row.pro_until IS NOT NULL AND _row.pro_until > now()));

  SELECT COUNT(*) INTO _active_count
    FROM public.document_kits
   WHERE user_id = _uid AND status = 'in_progress' AND team_id IS NULL;

  IF _is_pro THEN
    RETURN jsonb_build_object('ok', true, 'is_pro', true, 'active', _active_count);
  END IF;

  IF _active_count >= _free_cap THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'kit_slot_limit',
                              'active', _active_count, 'cap', _free_cap);
  END IF;
  RETURN jsonb_build_object('ok', true, 'is_pro', false,
                            'active', _active_count, 'cap', _free_cap);
END;
$function$;

-- ============================================================
-- Updated welcome notification body.
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)));

  INSERT INTO public.folders (user_id, name, is_favorites, color)
  VALUES (NEW.id, 'Любими', true, 'gold');

  INSERT INTO public.download_quota (user_id) VALUES (NEW.id);

  INSERT INTO public.notifications (user_id, kind, title, body, link)
  SELECT
    NEW.id,
    'welcome',
    'Добре дошли в Dogovori.net 👋',
    E'Радваме се, че сте тук! Какво включва безплатният план всеки месец:\n\n'
    || E'• 3 операции (сваляне на договор/шаблон или анализ)\n'
    || E'• 5 съобщения към AI Асистента\n'
    || E'• 1 преглед на качен договор с risk score\n'
    || E'• 1 преглед на двуезичен договор (BG колоната)\n'
    || E'• 1 активен комплект документи\n\n'
    || E'Когато имате нужда от повече — PRO дава 100 операции/месец, пълен достъп до двуезичните договори, комплектите и AI Асистента, без воден знак.\n\n'
    || E'Успех! 🚀',
    '/catalog'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.notifications n
    WHERE n.user_id = NEW.id AND n.kind = 'welcome'
  );

  RETURN NEW;
END;
$function$;
