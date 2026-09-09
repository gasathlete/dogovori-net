-- N0/N1 — контролен слой за официалните нормативни източници и монитор на промени.
--
-- СТРОГО ДОБАВЯЩА миграция. Тя НЕ пипа съществуващия RAG корпус
-- (legal_sources / legal_documents / legal_chunks / legal_versions):
-- няма UPDATE, няма DELETE, няма TRUNCATE, няма backfill, няма ре-embedding.
-- Повторното изпълнение е no-op (IF NOT EXISTS / DO-guards).
--
-- Модел на достъп:
--   * service_role притежава всички записи (мониторът пише само през него);
--   * authenticated има САМО четене и то през RLS проверка public.is_staff();
--   * anon няма никакъв достъп;
--   * няма INSERT/UPDATE/DELETE политика за authenticated, тоест браузърът
--     не може да пише в контролния слой.

-- ============================================================
-- 1) legal_source_registry — затворен регистър на официални източници
-- ============================================================
CREATE TABLE IF NOT EXISTS public.legal_source_registry (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL UNIQUE,
  title text NOT NULL,
  jurisdiction text NOT NULL,
  authority_tier text NOT NULL,
  origin text NOT NULL,
  entry_path text NOT NULL,
  access_method text NOT NULL,
  enabled boolean NOT NULL DEFAULT false,
  watch_only boolean NOT NULL DEFAULT false,
  review_status text NOT NULL DEFAULT 'needs_access_review',
  owner text,
  review_notes text,
  expected_cadence text NOT NULL DEFAULT 'irregular',
  parser_version text NOT NULL DEFAULT 'v1',
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_change_at timestamptz,
  freshness_state text NOT NULL DEFAULT 'unknown',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lsr_source_key_chk
    CHECK (source_key ~ '^[a-z][a-z0-9_]{2,59}$'),
  CONSTRAINT lsr_jurisdiction_chk
    CHECK (jurisdiction IN ('BG', 'EU')),
  CONSTRAINT lsr_authority_tier_chk
    CHECK (authority_tier IN (
      'official_promulgation',
      'official_legislative_process',
      'official_consultation',
      'official_eu_publication',
      'official_eu_consolidated_helper'
    )),
  CONSTRAINT lsr_origin_chk
    CHECK (origin ~ '^https://[a-z0-9.-]{4,190}$'),
  CONSTRAINT lsr_entry_path_chk
    CHECK (entry_path ~ '^/' AND char_length(entry_path) <= 300),
  CONSTRAINT lsr_access_method_chk
    CHECK (access_method IN ('rss', 'html_index', 'json_api', 'sparql', 'file_export')),
  CONSTRAINT lsr_review_status_chk
    CHECK (review_status IN ('approved', 'needs_access_review', 'rejected')),
  CONSTRAINT lsr_cadence_chk
    CHECK (expected_cadence IN ('hourly', 'daily', 'weekly', 'monthly', 'irregular')),
  CONSTRAINT lsr_freshness_chk
    CHECK (freshness_state IN ('unknown', 'fresh', 'stale', 'failing', 'disabled')),
  CONSTRAINT lsr_title_len_chk CHECK (char_length(title) BETWEEN 3 AND 300),
  CONSTRAINT lsr_owner_len_chk CHECK (owner IS NULL OR char_length(owner) <= 120),
  CONSTRAINT lsr_notes_len_chk CHECK (review_notes IS NULL OR char_length(review_notes) <= 2000),
  CONSTRAINT lsr_parser_version_chk CHECK (parser_version ~ '^v[0-9]{1,4}$'),
  -- Източник може да е enabled само след одобрен достъп и условия за ползване.
  CONSTRAINT lsr_enabled_requires_review_chk
    CHECK (enabled = false OR review_status = 'approved')
);

COMMENT ON TABLE public.legal_source_registry IS
  'N0: затворен регистър на официални нормативни източници. Синхронизира се от code-owned allowlist; Lex.bg НЕ е официален наблюдаван източник.';

CREATE INDEX IF NOT EXISTS lsr_enabled_idx
  ON public.legal_source_registry (enabled, jurisdiction);
CREATE INDEX IF NOT EXISTS lsr_freshness_idx
  ON public.legal_source_registry (freshness_state, last_success_at DESC);

-- ============================================================
-- 2) legal_ingestion_runs — одит на всеки опит за проверка
-- ============================================================
CREATE TABLE IF NOT EXISTS public.legal_ingestion_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL
    REFERENCES public.legal_source_registry (source_key) ON DELETE CASCADE,
  trigger text NOT NULL,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  outcome text NOT NULL,
  http_status integer,
  content_type text,
  byte_count bigint,
  discovered_count integer NOT NULL DEFAULT 0,
  changed_count integer NOT NULL DEFAULT 0,
  -- САМО затворен код за грешка. Никога тяло на страница, стектрейс или secret.
  error_code text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lir_trigger_chk CHECK (trigger IN ('manual', 'scheduled', 'dry_run')),
  CONSTRAINT lir_outcome_chk
    CHECK (outcome IN ('success', 'no_change', 'changed', 'skipped', 'failed', 'needs_review')),
  CONSTRAINT lir_http_status_chk
    CHECK (http_status IS NULL OR (http_status BETWEEN 100 AND 599)),
  CONSTRAINT lir_content_type_chk
    CHECK (content_type IS NULL OR char_length(content_type) <= 120),
  CONSTRAINT lir_byte_count_chk CHECK (byte_count IS NULL OR byte_count >= 0),
  CONSTRAINT lir_counts_chk
    CHECK (discovered_count >= 0 AND discovered_count <= 100000
       AND changed_count >= 0 AND changed_count <= 100000),
  CONSTRAINT lir_error_code_chk
    CHECK (error_code IS NULL OR error_code ~ '^[a-z][a-z0-9_]{2,59}$'),
  CONSTRAINT lir_error_requires_failure_chk
    CHECK (error_code IS NULL OR outcome IN ('failed', 'needs_review', 'skipped'))
);

COMMENT ON COLUMN public.legal_ingestion_runs.error_code IS
  'Затворен машинен код. Съзнателно НЕ съдържа външно съдържание или съобщения от източника.';

CREATE INDEX IF NOT EXISTS lir_source_started_idx
  ON public.legal_ingestion_runs (source_key, started_at DESC);
CREATE INDEX IF NOT EXISTS lir_outcome_idx
  ON public.legal_ingestion_runs (outcome, started_at DESC);

-- ============================================================
-- 3) legal_source_snapshots — неизменяем отпечатък на отговора
-- ============================================================
CREATE TABLE IF NOT EXISTS public.legal_source_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL
    REFERENCES public.legal_source_registry (source_key) ON DELETE CASCADE,
  retrieved_at timestamptz NOT NULL DEFAULT now(),
  canonical_url text NOT NULL,
  content_type text NOT NULL,
  byte_count bigint NOT NULL,
  checksum text NOT NULL,
  parser_version text NOT NULL,
  -- Или ограничен суров payload, или референция към сигурно хранилище.
  raw_payload text,
  storage_ref text,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lss_canonical_url_chk
    CHECK (canonical_url ~ '^https://' AND char_length(canonical_url) <= 2000),
  CONSTRAINT lss_content_type_chk CHECK (char_length(content_type) BETWEEN 3 AND 120),
  CONSTRAINT lss_byte_count_chk CHECK (byte_count >= 0 AND byte_count <= 8388608),
  CONSTRAINT lss_checksum_chk CHECK (checksum ~ '^[0-9a-f]{64}$'),
  CONSTRAINT lss_parser_version_chk CHECK (parser_version ~ '^v[0-9]{1,4}$'),
  CONSTRAINT lss_raw_payload_len_chk
    CHECK (raw_payload IS NULL OR char_length(raw_payload) <= 200000),
  CONSTRAINT lss_storage_ref_len_chk
    CHECK (storage_ref IS NULL OR char_length(storage_ref) <= 500),
  -- Идемпотентност: един и същ отговор от един и същ източник се пази еднократно.
  CONSTRAINT lss_source_checksum_uniq UNIQUE (source_key, checksum)
);

COMMENT ON TABLE public.legal_source_snapshots IS
  'N0: неизменяем отпечатък (checksum и ограничен payload) на официален отговор. Външното съдържание е ДАННИ, никога инструкция.';

CREATE INDEX IF NOT EXISTS lss_source_retrieved_idx
  ON public.legal_source_snapshots (source_key, retrieved_at DESC);

-- ============================================================
-- 4) legal_change_candidates — кандидати за нормативна промяна
-- ============================================================
CREATE TABLE IF NOT EXISTS public.legal_change_candidates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_key text NOT NULL
    REFERENCES public.legal_source_registry (source_key) ON DELETE CASCADE,
  snapshot_id uuid NOT NULL
    REFERENCES public.legal_source_snapshots (id) ON DELETE CASCADE,
  item_key text NOT NULL,
  lifecycle text NOT NULL,
  official_identifier text,
  celex text,
  gazette_issue text,
  title text NOT NULL,
  publication_date date,
  effective_date date,
  summary text,
  diff_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  severity text NOT NULL DEFAULT 'info',
  review_status text NOT NULL DEFAULT 'new',
  reviewed_by uuid,
  reviewed_at timestamptz,
  superseded_by uuid REFERENCES public.legal_change_candidates (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT lcc_lifecycle_chk
    CHECK (lifecycle IN ('proposed', 'promulgated', 'effective', 'repealed', 'corrected', 'unknown')),
  CONSTRAINT lcc_severity_chk
    CHECK (severity IN ('info', 'watch', 'material', 'critical')),
  CONSTRAINT lcc_review_status_chk
    CHECK (review_status IN ('new', 'in_review', 'accepted', 'dismissed')),
  CONSTRAINT lcc_item_key_chk CHECK (char_length(item_key) BETWEEN 3 AND 200),
  CONSTRAINT lcc_title_len_chk CHECK (char_length(title) BETWEEN 3 AND 500),
  CONSTRAINT lcc_official_identifier_len_chk
    CHECK (official_identifier IS NULL OR char_length(official_identifier) <= 200),
  CONSTRAINT lcc_celex_chk
    CHECK (celex IS NULL OR celex ~ '^[0-9A-Z()]{4,60}$'),
  CONSTRAINT lcc_gazette_issue_chk
    CHECK (gazette_issue IS NULL OR char_length(gazette_issue) <= 60),
  CONSTRAINT lcc_summary_len_chk CHECK (summary IS NULL OR char_length(summary) <= 4000),
  -- Предложение НИКОГА не носи дата на влизане в сила.
  CONSTRAINT lcc_proposed_has_no_effect_chk
    CHECK (lifecycle <> 'proposed' OR effective_date IS NULL),
  -- CELEX (ЕС) и брой на ДВ (БГ) са взаимно изключващи се идентификатори.
  CONSTRAINT lcc_celex_xor_gazette_chk
    CHECK (celex IS NULL OR gazette_issue IS NULL),
  CONSTRAINT lcc_reviewed_pair_chk
    CHECK ((reviewed_by IS NULL) = (reviewed_at IS NULL)),
  CONSTRAINT lcc_not_self_superseded_chk
    CHECK (superseded_by IS NULL OR superseded_by <> id),
  -- Идемпотентност: един елемент от един snapshot дава точно един кандидат.
  CONSTRAINT lcc_snapshot_item_uniq UNIQUE (snapshot_id, item_key)
);

COMMENT ON TABLE public.legal_change_candidates IS
  'N1: кандидат за нормативна промяна за човешки преглед. Никога не мутира шаблони автоматично; proposed никога не е действащо право.';

CREATE INDEX IF NOT EXISTS lcc_review_idx
  ON public.legal_change_candidates (review_status, created_at DESC);
CREATE INDEX IF NOT EXISTS lcc_source_lifecycle_idx
  ON public.legal_change_candidates (source_key, lifecycle, created_at DESC);
CREATE INDEX IF NOT EXISTS lcc_effective_idx
  ON public.legal_change_candidates (effective_date)
  WHERE effective_date IS NOT NULL;

-- ============================================================
-- 5) Грантове (Data API няма подразбиращи се права)
-- ============================================================
GRANT SELECT ON public.legal_source_registry TO authenticated;
GRANT ALL ON public.legal_source_registry TO service_role;

GRANT SELECT ON public.legal_ingestion_runs TO authenticated;
GRANT ALL ON public.legal_ingestion_runs TO service_role;

-- Колонен грант: администраторът НЕ получава достъп до raw_payload / storage_ref.
GRANT SELECT (
  id, source_key, retrieved_at, canonical_url, content_type,
  byte_count, checksum, parser_version, created_at
) ON public.legal_source_snapshots TO authenticated;
GRANT ALL ON public.legal_source_snapshots TO service_role;

GRANT SELECT ON public.legal_change_candidates TO authenticated;
GRANT ALL ON public.legal_change_candidates TO service_role;

-- ============================================================
-- 6) RLS — само staff четене, всички записи през service_role
-- ============================================================
ALTER TABLE public.legal_source_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_ingestion_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_source_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.legal_change_candidates ENABLE ROW LEVEL SECURITY;

DO $do$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'legal_source_registry',
    'legal_ingestion_runs',
    'legal_source_snapshots',
    'legal_change_candidates'
  ]
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND policyname = t || '_staff_read'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.is_staff(auth.uid()))',
        t || '_staff_read', t
      );
    END IF;

    IF NOT EXISTS (
      SELECT 1 FROM pg_policies
      WHERE schemaname = 'public' AND tablename = t
        AND policyname = t || '_service_all'
    ) THEN
      EXECUTE format(
        'CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)',
        t || '_service_all', t
      );
    END IF;
  END LOOP;
END
$do$;

-- ============================================================
-- 7) updated_at тригери (ползват съществуващата public.touch_updated_at)
-- ============================================================
DO $do$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_legal_source_registry_updated_at'
  ) THEN
    CREATE TRIGGER trg_legal_source_registry_updated_at
      BEFORE UPDATE ON public.legal_source_registry
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger WHERE tgname = 'trg_legal_change_candidates_updated_at'
  ) THEN
    CREATE TRIGGER trg_legal_change_candidates_updated_at
      BEFORE UPDATE ON public.legal_change_candidates
      FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();
  END IF;
END
$do$;
