-- Dogovori.net — security hardening patch, 28.09.2026
-- STATUS: PREPARED, NOT APPLIED. Owner review required before applying.
-- Independent of the pending 0044–0048 / product activation migrations: it
-- neither requires nor applies them. Safe to apply before or after them.
-- No data is deleted or rewritten. Every statement is idempotent.
-- Verification + rollback: docs/operations/security-hardening-2026-09-28.md
BEGIN;

-- ─────────────────────────────────────────────────────────────────────────
-- S1 (critical) Free-quota bypass through self-inserted charge ledgers.
-- consume_quota_session / consume_corrections_batch treat an existing
-- (user, session, doc_key|batch_id) row as "already paid". Clients could
-- INSERT such rows themselves and then download/correct for free. Only the
-- SECURITY DEFINER charge functions (owner role) may write these ledgers.
-- Users keep SELECT on their own rows (account dashboard).
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS qsc_insert_own ON public.quota_session_charges;
DROP POLICY IF EXISTS cbc_insert_own ON public.corrections_batch_charges;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.quota_session_charges FROM PUBLIC, anon, authenticated;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.corrections_batch_charges FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- S2 (high) E-signing evidence forgery by the envelope owner.
-- Owners could UPDATE signer rows (status='signed', signature, hash) and READ
-- otp_code_hash = sha256(6-digit code|id) — trivially brute-forced offline —
-- which, combined with the owner-visible sign link, allowed signing as the
-- counterparty. Signer rows are written only by service-role functions.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS signing_signers_update_via_request ON public.signing_request_signers;
DROP POLICY IF EXISTS signing_signers_insert_via_request ON public.signing_request_signers;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.signing_request_signers FROM PUBLIC, anon, authenticated;
REVOKE SELECT ON public.signing_request_signers FROM PUBLIC, anon, authenticated;
GRANT SELECT (id, request_id, email, name, role, order_idx, status, sign_token,
              notified_at, viewed_at, signed_at, declined_at, decline_reason,
              signature_data_url, signature_name, created_at, updated_at,
              signer_eik, signer_capacity, representative_declaration,
              ses_equivalence_accepted, ses_equivalence_text_version,
              document_hash_at_sign, signature_method, qes_file_path,
              qes_file_name, qes_file_size, qes_file_mime)
  ON public.signing_request_signers TO authenticated;
-- (otp_code_hash, otp_expires_at, otp_attempts, signer_ip_hash stay server-only)

-- Owners may only CANCEL an open envelope from the client. Status
-- transitions such as 'completed' and snapshot edits are server-only.
REVOKE UPDATE ON public.signing_requests FROM PUBLIC, anon, authenticated;
GRANT UPDATE (status, cancelled_at, updated_at) ON public.signing_requests TO authenticated;

CREATE OR REPLACE FUNCTION public.signing_requests_client_update_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW; -- service_role / owner maintenance
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF NEW.status::text <> 'cancelled'
       OR OLD.status::text NOT IN ('draft', 'pending', 'in_progress') THEN
      RAISE EXCEPTION 'signing_status_transition_forbidden' USING ERRCODE = '42501';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.signing_requests_client_update_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_signing_requests_client_update_guard ON public.signing_requests;
CREATE TRIGGER trg_signing_requests_client_update_guard
  BEFORE UPDATE ON public.signing_requests
  FOR EACH ROW EXECUTE FUNCTION public.signing_requests_client_update_guard();

-- ─────────────────────────────────────────────────────────────────────────
-- S3 (high) Team admin could rewrite billing fields of the team
-- (seat_count, status, period, stripe ids, owner_id, environment).
-- Only branding / company / SSO fields used by the UI remain writable.
-- ─────────────────────────────────────────────────────────────────────────
REVOKE UPDATE ON public.teams FROM PUBLIC, anon, authenticated;
GRANT UPDATE (name, logo_url, brand_color, vat_data, letterhead_enabled,
              signature_data_url, signature_name, company_eik, company_vat,
              company_address, company_mol, company_email, company_phone,
              company_website, eu_only_ai, sso_config, updated_at)
  ON public.teams TO authenticated;
REVOKE INSERT ON public.teams FROM PUBLIC, anon, authenticated;

-- Team membership is created/changed only by the invite/accept functions
-- (service role). Admins keep DELETE (remove a member) via RLS.
REVOKE INSERT, UPDATE ON public.team_members FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- S4 (medium) Users could reset their own assistant quota counters.
-- ─────────────────────────────────────────────────────────────────────────
REVOKE INSERT, UPDATE ON public.profiles FROM PUBLIC, anon, authenticated;
GRANT UPDATE (display_name, company, vat_number, avatar_url, signature_data_url,
              signature_name, allow_third_country_ai, tutorial_seen_at,
              plan_welcome_seen_at, plan_welcome_plan, updated_at)
  ON public.profiles TO authenticated;
GRANT INSERT (id, display_name, company, vat_number, avatar_url)
  ON public.profiles TO authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- S5 (medium) Consent records are evidence: append-only for clients.
-- Withdrawal is a new row with granted = false (src/lib/consents.ts).
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS user_consents_update_own ON public.user_consents;
REVOKE UPDATE, DELETE, TRUNCATE ON public.user_consents FROM PUBLIC, anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- S6 (medium) is_staff(uuid) let anyone enumerate staff accounts.
-- Callers may only ask about themselves; service role may ask about anyone.
-- Every RLS policy and DB function calls it with auth.uid() (verified).
-- ─────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_staff(_user_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT COALESCE(
       _user_id IS NOT NULL
       AND (_user_id = auth.uid() OR auth.role() = 'service_role')
       AND EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = _user_id AND role IN ('admin', 'moderator')),
       false)
$$;

-- ─────────────────────────────────────────────────────────────────────────
-- S7 (medium) SECURITY DEFINER functions executable without sign-in.
-- Maintenance / oracle functions: service role only.
-- Staff / self functions: signed-in only (they check auth.uid() inside).
-- Trigger functions: no direct EXECUTE needed by API roles.
-- Intentionally public (unchanged): get_post_rating, get_registered_users_count,
-- is_staff (used by public-role RLS), record_web_vital_aggregate,
-- request_prelaunch_waitlist, search_templates, subscribe_lead_magnet,
-- top_blog_articles.
-- ─────────────────────────────────────────────────────────────────────────
DO $$
DECLARE
  f text;
  service_only text[] := ARRAY[
    'public.cleanup_anonymous_drafts()',
    'public.purge_old_funnel_events()',
    'public.verify_cron_secret(text)',
    'public.free_ops_cap(uuid)',
    'public.can_access_saved_document(uuid, uuid)',
    'public.get_first100_remaining()',
    'public.get_first90_remaining()',
    'public.bump_template_download_count()',
    'public.funnel_events_attribute_user()',
    'public.snapshot_saved_document_version()'];
  signed_in_only text[] := ARRAY[
    'public.admin_financial_audit(integer)',
    'public.admin_list_ai_disclaimer_consents(text, integer)',
    'public.admin_list_marketing_recipients(text, integer)',
    'public.admin_list_users(text, integer)',
    'public.admin_send_campaign_topic(uuid)',
    'public.assistant_edit_proposal_action(uuid, text)',
    'public.get_my_activation_funnel(integer)',
    'public.growth_snapshot(timestamptz, timestamptz)',
    'public.metrics_event_timeseries(timestamptz, timestamptz, text)',
    'public.metrics_overview(timestamptz, timestamptz)'];
BEGIN
  FOREACH f IN ARRAY service_only LOOP
    IF to_regprocedure(f) IS NULL THEN RAISE NOTICE 'skip missing %', f; CONTINUE; END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
  FOREACH f IN ARRAY signed_in_only LOOP
    IF to_regprocedure(f) IS NULL THEN RAISE NOTICE 'skip missing %', f; CONTINUE; END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role', f);
  END LOOP;
  IF to_regprocedure('public.assistant_edit_payload_path(text)') IS NOT NULL THEN
    ALTER FUNCTION public.assistant_edit_payload_path(text) SET search_path = public;
  END IF;
END $$;

-- ─────────────────────────────────────────────────────────────────────────
-- S8 (low; scanner RLS_EXPOSURE) Public legal texts: keep public browsing,
-- but scope it. legal_documents = official BG/EU legislation texts (public by
-- nature); expose only documents of ACTIVE sources. legal_versions = our
-- published Terms/Privacy/Cookies history; expose only published versions.
-- Staff keep full read for administration.
-- ─────────────────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "legal_documents public read" ON public.legal_documents;
DROP POLICY IF EXISTS legal_documents_public_read_active ON public.legal_documents;
CREATE POLICY legal_documents_public_read_active ON public.legal_documents
  FOR SELECT TO anon, authenticated
  USING (EXISTS (SELECT 1 FROM public.legal_sources s
                 WHERE s.id = legal_documents.source_id AND s.active));
DROP POLICY IF EXISTS legal_documents_staff_read ON public.legal_documents;
CREATE POLICY legal_documents_staff_read ON public.legal_documents
  FOR SELECT TO authenticated USING (public.is_staff(auth.uid()));

DROP POLICY IF EXISTS legal_versions_public_read ON public.legal_versions;
CREATE POLICY legal_versions_public_read ON public.legal_versions
  FOR SELECT TO anon, authenticated
  USING (published_at IS NOT NULL AND published_at <= now());

-- =========================================================================
-- ADDENDUM S9–S14 (owner-verified findings + root live hotfixes, 28.09.2026)
-- See docs/operations/security-live-hotfixes-2026-09-28.md. Idempotent: the
-- parts root already applied live re-apply to the identical state.
-- =========================================================================

-- S9 (LIVE via root, recorded here for durability) growth_snapshot:
-- byte-identical body of docs/migrations/0048_growth_snapshot_authz.sql.
CREATE OR REPLACE FUNCTION public.growth_snapshot(_from timestamptz, _to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  res jsonb;
  v_visitors bigint;
  v_pageviews bigint;
  v_sessions bigint;
  v_signups bigint;
  v_signups_total bigint;
  v_paid_new bigint;
  v_paid_active bigint;
  v_docs bigint;
  v_uploads bigint;
  v_ops bigint;
  v_topup_ops bigint;
  v_topup_eur numeric;
  v_top_templates jsonb;
  v_top_dropoff jsonb;
  v_top_paths jsonb;
  v_sources jsonb;
BEGIN
  -- Авторизация по ИСТИНСКАТА JWT роля на заявката, не по current_user:
  -- в SECURITY DEFINER current_user е собственикът (postgres), затова старият
  -- клон беше винаги истина. NULL/липсваща роля или uid = ОТКАЗ (COALESCE).
  IF NOT (
    COALESCE(auth.role(), '') = 'service_role'
    OR (
      COALESCE(auth.role(), '') = 'authenticated'
      AND auth.uid() IS NOT NULL
      AND COALESCE(public.is_staff(auth.uid()), false)
    )
  ) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = '42501';
  END IF;

  SELECT COUNT(DISTINCT visitor_day_hash), COUNT(*), COUNT(DISTINCT session_id)
    INTO v_visitors, v_pageviews, v_sessions
    FROM public.page_views
   WHERE created_at >= _from AND created_at < _to AND event = 'pageview';

  SELECT COUNT(*) INTO v_signups FROM public.profiles
   WHERE created_at >= _from AND created_at < _to;
  SELECT COUNT(*) INTO v_signups_total FROM public.profiles;

  SELECT COUNT(*) INTO v_paid_new FROM public.subscriptions
   WHERE created_at >= _from AND created_at < _to
     AND status IN ('active','trialing','past_due');

  SELECT COUNT(*) INTO v_paid_active FROM public.subscriptions
   WHERE status IN ('active','trialing');

  SELECT COUNT(*) INTO v_docs FROM public.saved_documents
   WHERE created_at >= _from AND created_at < _to;

  SELECT COUNT(*) INTO v_uploads FROM public.uploaded_contracts
   WHERE created_at >= _from AND created_at < _to;

  SELECT COUNT(*) INTO v_ops FROM public.quota_session_charges
   WHERE created_at >= _from AND created_at < _to;

  SELECT COALESCE(SUM(ops_added),0), COALESCE(SUM(amount_eur),0)
    INTO v_topup_ops, v_topup_eur
    FROM public.topup_purchases
   WHERE created_at >= _from AND created_at < _to;

  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v_top_templates
    FROM (
      SELECT props->>'doc_key' AS doc_key, COUNT(*) AS starts
        FROM public.funnel_events
       WHERE created_at >= _from AND created_at < _to
         AND name = 'doc_start' AND COALESCE(props->>'doc_key','') <> ''
       GROUP BY 1 ORDER BY 2 DESC LIMIT 10
    ) t;

  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v_top_dropoff
    FROM (
      SELECT name, COALESCE(props->>'reason','') AS reason, COUNT(*) AS hits
        FROM public.funnel_events
       WHERE created_at >= _from AND created_at < _to
         AND name IN ('doc_generate_fail','doc_generate_blocked','placeholder_block','doc_abandon')
       GROUP BY 1,2 ORDER BY 3 DESC LIMIT 12
    ) t;

  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v_top_paths
    FROM (
      SELECT path, COUNT(*) AS views
        FROM public.page_views
       WHERE created_at >= _from AND created_at < _to AND event = 'pageview'
       GROUP BY 1 ORDER BY 2 DESC LIMIT 12
    ) t;

  SELECT COALESCE(jsonb_agg(t), '[]'::jsonb) INTO v_sources
    FROM (
      SELECT COALESCE(NULLIF(utm_source,''), NULLIF(referrer_host,''), 'direct') AS source,
             COUNT(DISTINCT visitor_day_hash) AS visitors
        FROM public.page_views
       WHERE created_at >= _from AND created_at < _to AND event = 'pageview'
       GROUP BY 1 ORDER BY 2 DESC LIMIT 10
    ) t;

  WITH ev AS (
    SELECT name, props, session_id, COALESCE(props->>'reason','') AS reason
      FROM public.funnel_events
     WHERE created_at >= _from AND created_at < _to
  ),
  evc AS (
    SELECT ev.*,
           ((name = 'doc_generate_blocked')
             OR (name = 'doc_generate_fail' AND reason ~* '(needs_confirmation|confirmation_required|quota_exceeded|requires_login|sensitive_blocked|blocked_content|illegal_content|placeholder)')) AS is_gate
      FROM ev
  ),
  stage AS (
    SELECT
      COUNT(DISTINCT CASE WHEN name = 'doc_start' THEN session_id END) AS s_start,
      COUNT(DISTINCT CASE WHEN name LIKE 'doc_fill%' THEN session_id END) AS s_fill,
      COUNT(DISTINCT CASE WHEN name = 'doc_generate_success' THEN session_id END) AS s_generate,
      COUNT(DISTINCT CASE WHEN name = 'doc_download_success' THEN session_id END) AS s_download,
      COUNT(DISTINCT CASE WHEN name IN ('doc_sign_requested','doc_sign_signed') THEN session_id END) AS s_sign,
      COUNT(*) FILTER (WHERE name IN ('doc_generate_fail','doc_generate_blocked') AND NOT is_gate) AS generate_fail,
      COUNT(*) FILTER (WHERE is_gate) AS generate_blocked,
      COUNT(*) FILTER (WHERE name = 'doc_generate_started') AS generate_started,
      COUNT(*) FILTER (WHERE name = 'placeholder_block') AS placeholder_blocks,
      COUNT(*) FILTER (WHERE name = 'quality_review_result') AS reviews,
      AVG(NULLIF((props->>'score'), '')::numeric) FILTER (WHERE name = 'quality_review_result') AS avg_review_score,
      COUNT(*) FILTER (WHERE name = 'quality_review_result'
                        AND COALESCE(NULLIF(props->>'issues','')::numeric, 0) = 0) AS clean_reviews,
      COUNT(*) FILTER (WHERE name = 'corrections_applied') AS corrections_applied,
      COUNT(*) FILTER (WHERE name = 'plans_view') AS plans_views,
      COUNT(*) FILTER (WHERE name = 'checkout_started') AS checkout_started,
      COUNT(*) FILTER (WHERE name = 'upgrade_completed') AS upgrade_completed,
      COUNT(DISTINCT CASE WHEN COALESCE(props->>'segment','') = 'business' THEN session_id END) AS seg_business,
      COUNT(DISTINCT CASE WHEN COALESCE(props->>'segment','') = 'freelancer' THEN session_id END) AS seg_freelancer
    FROM evc
  ),
  sign AS (
    SELECT COUNT(*) AS requests,
           COUNT(*) FILTER (WHERE status = 'completed') AS completed,
           COUNT(*) FILTER (WHERE status IN ('cancelled','expired','declined')) AS failed
      FROM public.signing_requests
     WHERE created_at >= _from AND created_at < _to
  ),
  fb AS (
    SELECT COUNT(*) AS total,
           COUNT(*) FILTER (WHERE category = 'bug') AS bugs,
           AVG(NULLIF(rating, 0)::numeric) AS avg_rating
      FROM public.feedback_submissions
     WHERE created_at >= _from AND created_at < _to
  )
  SELECT jsonb_build_object(
    'range', jsonb_build_object('from', _from, 'to', _to),
    'acquisition', jsonb_build_object(
      'visitors', v_visitors,
      'pageviews', v_pageviews,
      'sessions', v_sessions,
      'signups', v_signups,
      'signups_total', v_signups_total,
      'signup_rate', CASE WHEN v_visitors > 0 THEN ROUND(100.0 * v_signups / v_visitors, 2) ELSE 0 END,
      'top_sources', v_sources,
      'top_paths', v_top_paths
    ),
    'activation', jsonb_build_object(
      'start', stage.s_start,
      'fill', stage.s_fill,
      'generate', stage.s_generate,
      'download', stage.s_download,
      'sign', stage.s_sign,
      'documents_saved', v_docs,
      'uploads_analyzed', v_uploads,
      'start_to_download', CASE WHEN stage.s_start > 0 THEN ROUND(100.0 * stage.s_download / stage.s_start, 2) ELSE 0 END,
      'top_templates', v_top_templates
    ),
    'conversion', jsonb_build_object(
      'plans_views', stage.plans_views,
      'checkout_started', stage.checkout_started,
      'upgrade_completed', stage.upgrade_completed,
      'new_paid_subscriptions', v_paid_new,
      'active_paid_subscriptions', v_paid_active,
      'visitor_to_paid', CASE WHEN v_visitors > 0 THEN ROUND(100.0 * v_paid_new / v_visitors, 2) ELSE 0 END,
      'signup_to_paid', CASE WHEN v_signups > 0 THEN ROUND(100.0 * v_paid_new / v_signups, 2) ELSE 0 END,
      'checkout_completion', CASE WHEN stage.checkout_started > 0 THEN ROUND(100.0 * stage.upgrade_completed / stage.checkout_started, 2) ELSE 0 END
    ),
    'segments', jsonb_build_object(
      'business', stage.seg_business,
      'freelancer', stage.seg_freelancer
    ),
    'operations', jsonb_build_object(
      'charged_sessions', v_ops,
      'topup_ops_sold', v_topup_ops,
      'topup_revenue_eur', v_topup_eur
    ),
    'quality', jsonb_build_object(
      'reviews', stage.reviews,
      'avg_review_score', COALESCE(ROUND(stage.avg_review_score, 1), 0),
      'clean_review_rate', CASE WHEN stage.reviews > 0 THEN ROUND(100.0 * stage.clean_reviews / stage.reviews, 2) ELSE 0 END,
      'placeholder_blocks', stage.placeholder_blocks,
      'corrections_applied', stage.corrections_applied,
      'generate_started', stage.generate_started,
      'generate_fail', stage.generate_fail,
      'generate_blocked', stage.generate_blocked,
      'generate_fail_rate', CASE WHEN stage.generate_started > 0 THEN ROUND(100.0 * stage.generate_fail / stage.generate_started, 2) ELSE 0 END,
      'generate_blocked_rate', CASE WHEN stage.generate_started > 0 THEN ROUND(100.0 * stage.generate_blocked / stage.generate_started, 2) ELSE 0 END,
      'signing_requests', sign.requests,
      'signing_completed', sign.completed,
      'signing_failed', sign.failed,
      'signing_completion_rate', CASE WHEN sign.requests > 0 THEN ROUND(100.0 * sign.completed / sign.requests, 2) ELSE 0 END,
      'feedback_total', fb.total,
      'feedback_bugs', fb.bugs,
      'feedback_avg_rating', COALESCE(ROUND(fb.avg_rating, 2), 0)
    ),
    'drop_off', v_top_dropoff
  ) INTO res
  FROM stage, sign, fb;

  RETURN res;
END;
$function$;

REVOKE ALL ON FUNCTION public.growth_snapshot(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.growth_snapshot(timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.growth_snapshot(timestamptz, timestamptz) TO authenticated, service_role;

-- S10 (LIVE via root, recorded here) exactly the eight internal RPCs that
-- root made service-only after call-site review. postgres keeps EXECUTE as
-- owner. Client grants are NOT restored.
DO $$
DECLARE f text;
BEGIN
  FOREACH f IN ARRAY ARRAY[
    'public._roll_feature_counters(uuid)',
    'public.charge_corrections_wave(uuid, uuid, integer)',
    'public.consume_assistant_message(uuid, integer)',
    'public.rate_limit_check(text, integer, integer)',
    'public.cleanup_anonymous_drafts()',
    'public.purge_old_funnel_events()',
    'public.assemble_prompt_content(uuid)',
    'public.check_compliance_reminders()'] LOOP
    IF to_regprocedure(f) IS NULL THEN RAISE NOTICE 'skip missing %', f; CONTINUE; END IF;
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon, authenticated', f);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', f);
  END LOOP;
END $$;

-- S11 (NEW) Loyalty tiers from canonical server counters; browser count
-- ignored; membership still required. Signatures unchanged.
CREATE OR REPLACE FUNCTION public.award_user_loyalty(_total_ops integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  _uid uuid := auth.uid();
  _ops bigint;
  _tier record;
  _new_tiers jsonb := '[]'::jsonb;
  _inserted boolean;
  _tiers constant jsonb := '[
    {"id":"gold_entrepreneur","threshold":1000,"name":"Златен предприемач","discount":5},
    {"id":"platinum_entrepreneur","threshold":5000,"name":"Платинен предприемач","discount":10},
    {"id":"diamond_entrepreneur","threshold":15000,"name":"Диамантен предприемач","discount":15}
  ]'::jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  -- _total_ops от браузъра се ИГНОРИРА (параметърът остава за съвместимост).
  SELECT COALESCE(total_used, 0) INTO _ops FROM public.download_quota WHERE user_id = _uid;
  _ops := COALESCE(_ops, 0);
  FOR _tier IN SELECT * FROM jsonb_to_recordset(_tiers) AS x(id text, threshold int, name text, discount int) LOOP
    IF _ops >= _tier.threshold THEN
      WITH ins AS (
        INSERT INTO public.loyalty_unlocks(subject_type, subject_id, tier_id)
        VALUES ('user', _uid, _tier.id) ON CONFLICT DO NOTHING RETURNING 1)
      SELECT EXISTS(SELECT 1 FROM ins) INTO _inserted;
      IF _inserted THEN
        INSERT INTO public.notifications(user_id, kind, title, body, link)
        VALUES (_uid, 'loyalty_unlock',
          'Поздравления! Отключихте „' || _tier.name || '"',
          'Достигнахте ' || _tier.threshold || ' операции и получавате ' || _tier.discount || '% отстъпка от абонамента доживот. Отстъпката се прилага автоматично при следващото плащане.',
          '/account');
        _new_tiers := _new_tiers || to_jsonb(_tier.id);
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('new_tiers', _new_tiers);
END;
$function$;
CREATE OR REPLACE FUNCTION public.award_team_loyalty(_team_id uuid, _total_ops integer)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $function$
DECLARE
  _uid uuid := auth.uid();
  _ops bigint;
  _tier record;
  _new_tiers jsonb := '[]'::jsonb;
  _inserted boolean;
  _admin_id uuid;
  _tiers constant jsonb := '[
    {"id":"gold_team","threshold":5000,"name":"Златен екип"},
    {"id":"platinum_team","threshold":15000,"name":"Платинен екип"},
    {"id":"diamond_team","threshold":25000,"name":"Диамантен екип"}
  ]'::jsonb;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'unauthenticated' USING ERRCODE = '28000'; END IF;
  IF _team_id IS NULL OR NOT public.is_team_member(_uid, _team_id) THEN
    RAISE EXCEPTION 'not_team_member' USING ERRCODE = '42501';
  END IF;
  -- _total_ops от браузъра се ИГНОРИРА; източник е сървърният брояч.
  SELECT COALESCE(lifetime_ops, 0) INTO _ops FROM public.team_usage WHERE team_id = _team_id;
  _ops := COALESCE(_ops, 0);
  FOR _tier IN SELECT * FROM jsonb_to_recordset(_tiers) AS x(id text, threshold int, name text) LOOP
    IF _ops >= _tier.threshold THEN
      WITH ins AS (
        INSERT INTO public.loyalty_unlocks(subject_type, subject_id, tier_id)
        VALUES ('team', _team_id, _tier.id) ON CONFLICT DO NOTHING RETURNING 1)
      SELECT EXISTS(SELECT 1 FROM ins) INTO _inserted;
      IF _inserted THEN
        FOR _admin_id IN SELECT user_id FROM public.team_members
                          WHERE team_id = _team_id AND role IN ('owner','admin') LOOP
          INSERT INTO public.notifications(user_id, kind, title, body, link)
          VALUES (_admin_id, 'loyalty_unlock_team',
            'Екипът отключи „' || _tier.name || '"',
            'Екипът достигна ' || _tier.threshold || ' извършени операции и отключи ниво „' || _tier.name || '".',
            '/team');
        END LOOP;
        _new_tiers := _new_tiers || to_jsonb(_tier.id);
      END IF;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('new_tiers', _new_tiers);
END;
$function$;
REVOKE EXECUTE ON FUNCTION public.award_user_loyalty(integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.award_team_loyalty(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.award_user_loyalty(integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.award_team_loyalty(uuid, integer) TO authenticated, service_role;

-- S12 (NEW, targeted) shared_links server-only columns. NO table ACL change:
-- existing authenticated INSERT/UPDATE grants and root's ownership policies
-- stay exactly as they are (the blanket revocation was rejected and is NOT
-- reintroduced here). A BEFORE trigger restricts only what a client role may
-- write:
--   INSERT: counterparty-signature, signed PDF, QES, viewed and IP columns
--           must be empty; owner-sign fields may be set.
--   UPDATE: identity/target/token/password/counterparty/QES/signed-PDF
--           columns immutable; owner signature set once; revocation one-way;
--           expires_at may change.
-- service_role / postgres (create-share-link, sign-/get-shared-document)
-- bypass the guard: current_user is not a client role there.
CREATE OR REPLACE FUNCTION public.shared_links_client_write_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    IF NEW.signed_at IS NOT NULL OR NEW.signed_signature IS NOT NULL OR NEW.signer_name IS NOT NULL
       OR NEW.signer_ip_hash IS NOT NULL OR NEW.signed_pdf_path IS NOT NULL OR NEW.viewed_at IS NOT NULL
       OR NEW.signature_method IS NOT NULL OR NEW.qes_file_path IS NOT NULL OR NEW.qes_file_name IS NOT NULL
       OR NEW.qes_file_mime IS NOT NULL OR NEW.qes_file_size IS NOT NULL OR NEW.revoked_at IS NOT NULL THEN
      RAISE EXCEPTION 'shared_link_server_only_column' USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.id IS DISTINCT FROM OLD.id OR NEW.owner_id IS DISTINCT FROM OLD.owner_id
     OR NEW.document_id IS DISTINCT FROM OLD.document_id
     OR NEW.uploaded_contract_id IS DISTINCT FROM OLD.uploaded_contract_id
     OR NEW.token IS DISTINCT FROM OLD.token OR NEW.created_at IS DISTINCT FROM OLD.created_at
     OR NEW.password_hash IS DISTINCT FROM OLD.password_hash OR NEW.password_salt IS DISTINCT FROM OLD.password_salt
     OR NEW.viewed_at IS DISTINCT FROM OLD.viewed_at
     OR NEW.signed_at IS DISTINCT FROM OLD.signed_at OR NEW.signed_signature IS DISTINCT FROM OLD.signed_signature
     OR NEW.signer_name IS DISTINCT FROM OLD.signer_name OR NEW.signer_ip_hash IS DISTINCT FROM OLD.signer_ip_hash
     OR NEW.signed_pdf_path IS DISTINCT FROM OLD.signed_pdf_path
     OR NEW.signature_method IS DISTINCT FROM OLD.signature_method
     OR NEW.qes_file_path IS DISTINCT FROM OLD.qes_file_path OR NEW.qes_file_name IS DISTINCT FROM OLD.qes_file_name
     OR NEW.qes_file_mime IS DISTINCT FROM OLD.qes_file_mime OR NEW.qes_file_size IS DISTINCT FROM OLD.qes_file_size THEN
    RAISE EXCEPTION 'shared_link_server_only_column' USING ERRCODE = '42501';
  END IF;
  IF OLD.owner_signed_at IS NOT NULL AND (
       NEW.owner_signed_at IS DISTINCT FROM OLD.owner_signed_at
    OR NEW.owner_signature IS DISTINCT FROM OLD.owner_signature
    OR NEW.owner_signer_name IS DISTINCT FROM OLD.owner_signer_name) THEN
    RAISE EXCEPTION 'owner_signature_immutable' USING ERRCODE = '42501';
  END IF;
  IF OLD.revoked_at IS NOT NULL AND NEW.revoked_at IS DISTINCT FROM OLD.revoked_at THEN
    RAISE EXCEPTION 'revocation_immutable' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
REVOKE EXECUTE ON FUNCTION public.shared_links_client_write_guard() FROM PUBLIC, anon, authenticated;
DROP TRIGGER IF EXISTS trg_shared_links_client_write_guard ON public.shared_links;
CREATE TRIGGER trg_shared_links_client_write_guard
  BEFORE INSERT OR UPDATE ON public.shared_links
  FOR EACH ROW EXECUTE FUNCTION public.shared_links_client_write_guard();

-- S13 (NEW) uploaded_contracts.storage_path must be inside the owner's own
-- folder. Live preflight returned 0 violating rows; NOT VALID keeps the
-- apply cheap — run the VALIDATE below after re-checking the preflight.
--   SELECT count(*) FROM public.uploaded_contracts
--    WHERE storage_path IS NOT NULL AND split_part(storage_path,'/',1) <> user_id::text;
--   ALTER TABLE public.uploaded_contracts VALIDATE CONSTRAINT uploaded_contracts_storage_path_owner;
ALTER TABLE public.uploaded_contracts DROP CONSTRAINT IF EXISTS uploaded_contracts_storage_path_owner;
ALTER TABLE public.uploaded_contracts ADD CONSTRAINT uploaded_contracts_storage_path_owner
  CHECK (storage_path IS NULL OR (split_part(storage_path, '/', 1) = user_id::text
         AND position('..' in storage_path) = 0)) NOT VALID;

-- S14 (NEW) storage team read trusted browser-written paths: a team member
-- could point a team record at another user's file. Bind the object folder to
-- the record owner (who must be the one who uploaded it).
DROP POLICY IF EXISTS user_contracts_team_select ON storage.objects;
CREATE POLICY user_contracts_team_select ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'user-contracts' AND (
    EXISTS (SELECT 1 FROM public.uploaded_contracts uc
             WHERE uc.storage_path = objects.name
               AND split_part(objects.name, '/', 1) = uc.user_id::text
               AND uc.team_id IS NOT NULL
               AND public.is_team_member(auth.uid(), uc.team_id))
    OR EXISTS (SELECT 1 FROM public.saved_documents sd
             WHERE sd.team_id IS NOT NULL
               AND (sd.payload ->> 'storage_path') = objects.name
               AND split_part(objects.name, '/', 1) = sd.user_id::text
               AND public.is_team_member(auth.uid(), sd.team_id))));

COMMIT;
