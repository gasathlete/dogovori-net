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
  SELECT _user_id IS NOT NULL
     AND (_user_id = auth.uid() OR auth.role() = 'service_role')
     AND EXISTS (SELECT 1 FROM public.user_roles
                 WHERE user_id = _user_id AND role IN ('admin', 'moderator'))
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

COMMIT;
