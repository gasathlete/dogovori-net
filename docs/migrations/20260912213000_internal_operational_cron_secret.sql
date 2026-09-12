-- 20260912213000_internal_operational_cron_secret
--
-- Dedicated internal operational cron credential. SOURCE-PREPARED, NOT APPLIED.
-- Каноничният timestamped payload за еднократно прилагане през Supabase migration
-- tool. НЕ е приложена миграция; папката supabase/migrations е защитена (огледало
-- на вече приложени миграции) и не се заобикаля.
--
-- Цел: спира зависимостта на планираните задачи от служебния ключ и от липсващия
-- Vault идентификатор email_queue_service_role_key.
--
-- Гаранции:
--   * Стойността се генерира изцяло в PostgreSQL (256 бита) и никога не се появява
--     в източника, в литерал на миграция, в аргумент на инструмент, в журнал или
--     в настройка на Edge функция.
--   * Никъде не се прави SELECT/RETURN/RAISE на очакваната стойност.
--   * Задачите остават паузирани (active = false). Няма друга SQL промяна.
--   * Идемпотентна: повторно изпълнение при вече пренасочени задачи не променя нищо.

-- 1) Верификатор: приема само точно 64 малки hex символа и сравнява два
--    32-байтови sha256 хеша във фиксиран 32-итерационен акумулатор.
CREATE OR REPLACE FUNCTION public.verify_internal_cron_secret(_candidate text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, extensions, vault
AS $fn$
DECLARE
  v_expected text;
  v_cand_hash bytea;
  v_exp_hash bytea;
  v_diff integer := 0;
  i integer;
BEGIN
  IF _candidate IS NULL OR _candidate !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  SELECT s.decrypted_secret
    INTO v_expected
    FROM vault.decrypted_secrets AS s
   WHERE s.name = 'internal_operational_cron_secret_v1'
   LIMIT 1;

  -- Fail-closed при липсваща или повредена стойност.
  IF v_expected IS NULL OR v_expected !~ '^[0-9a-f]{64}$' THEN
    RETURN false;
  END IF;

  v_cand_hash := extensions.digest(_candidate, 'sha256');
  v_exp_hash := extensions.digest(v_expected, 'sha256');
  IF v_cand_hash IS NULL OR v_exp_hash IS NULL
     OR length(v_cand_hash) <> 32 OR length(v_exp_hash) <> 32 THEN
    RETURN false;
  END IF;

  FOR i IN 0..31 LOOP
    v_diff := v_diff | (get_byte(v_cand_hash, i) # get_byte(v_exp_hash, i));
  END LOOP;

  RETURN v_diff = 0;
END;
$fn$;

REVOKE ALL ON FUNCTION public.verify_internal_cron_secret(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.verify_internal_cron_secret(text) FROM anon;
REVOKE ALL ON FUNCTION public.verify_internal_cron_secret(text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.verify_internal_cron_secret(text) TO service_role;

-- 2) Пазен, идемпотентен блок: генерира Vault стойността при липса и пренасочва
--    точно четирите паузирани задачи към новия идентификатор.
DO $rewire$
DECLARE
  r RECORD;
  v_expected_jobs jsonb := jsonb_build_object(
    '7', 'retention-sweeper-hourly',
    '8', 'ai-post-market-rollup-daily',
    '9', 'expire-pro-notify-daily',
    '10', 'notify-due-reminders-daily'
  );
  v_old_id text := 'email_queue_service_role_key';
  v_new_id text := 'internal_operational_cron_secret_v1';
  v_old_count integer := 0;
  v_new_count integer := 0;
  v_total integer := 0;
  v_new_command text;
BEGIN
  FOR r IN
    SELECT j.jobid, j.jobname, j.active, j.command
      FROM cron.job AS j
     WHERE j.jobid::text IN (SELECT jsonb_object_keys(v_expected_jobs))
     ORDER BY j.jobid
  LOOP
    v_total := v_total + 1;

    IF r.jobname IS DISTINCT FROM (v_expected_jobs ->> r.jobid::text) THEN
      RAISE EXCEPTION 'unexpected cron job name for jobid %', r.jobid;
    END IF;
    IF r.active IS DISTINCT FROM false THEN
      RAISE EXCEPTION 'cron job % must stay paused before rewiring', r.jobid;
    END IF;

    IF position(v_old_id in r.command) > 0 THEN
      v_old_count := v_old_count + 1;
    ELSIF position(v_new_id in r.command) > 0 THEN
      v_new_count := v_new_count + 1;
    ELSE
      RAISE EXCEPTION 'cron job % references no known cron credential identifier', r.jobid;
    END IF;
  END LOOP;

  IF v_total <> 4 THEN
    RAISE EXCEPTION 'expected exactly 4 operational cron jobs, found %', v_total;
  END IF;
  IF v_old_count <> 4 AND v_new_count <> 4 THEN
    RAISE EXCEPTION 'mixed cron credential state: % old, % new', v_old_count, v_new_count;
  END IF;

  -- Стойността се създава от сървъра и не се чете обратно.
  IF NOT EXISTS (SELECT 1 FROM vault.secrets AS s WHERE s.name = v_new_id) THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      v_new_id,
      'Dedicated internal operational cron credential (256-bit, server-generated).'
    );
  END IF;

  IF v_old_count = 4 THEN
    FOR r IN
      SELECT j.jobid, j.command
        FROM cron.job AS j
       WHERE j.jobid::text IN (SELECT jsonb_object_keys(v_expected_jobs))
       ORDER BY j.jobid
    LOOP
      -- Единствената промяна е идентификаторът; всеки друг байт се запазва.
      v_new_command := replace(r.command, v_old_id, v_new_id);
      PERFORM cron.alter_job(job_id := r.jobid, command := v_new_command, active := false);
    END LOOP;
  END IF;

  IF (
    SELECT count(*)
      FROM cron.job AS j
     WHERE j.jobid::text IN (SELECT jsonb_object_keys(v_expected_jobs))
       AND j.active = false
       AND position(v_new_id in j.command) > 0
       AND position(v_old_id in j.command) = 0
  ) <> 4 THEN
    RAISE EXCEPTION 'post-rewire assertion failed for the four operational cron jobs';
  END IF;
END;
$rewire$;
