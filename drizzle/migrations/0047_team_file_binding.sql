-- stage_team_file_binding (proposed id 0045_team_file_binding)
--
-- Promoted after production aggregate preflight on 2026-10-20; see operations audit.
--
-- Problem (live metadata, 2026-09-25):
--   uploaded_contracts_all_own / saved_documents_all_own are FOR ALL with
--   USING/WITH CHECK  auth.uid() = user_id OR is_team_member(auth.uid(), team_id).
--   A member of team T could INSERT/UPDATE a row with team_id = T and a
--   storage_path (or payload->>'storage_path') pointing to ANOTHER user's file,
--   even with user_id = that other user. user_contracts_team_select then
--   granted storage SELECT on that file to every member of T.
--
-- Fix:
--   1. Row writes: INSERT binds user_id = auth.uid(), requires membership of
--      team_id, requires the file path to be in the owner's own folder.
--      UPDATE keeps team-member edit rights for content, but user_id is
--      immutable for clients, and the file reference / team assignment can
--      only be changed by the row owner.
--   2. Provenance: new column team_shared_by is written ONLY by a trigger
--      (= auth.uid() of the owner who shared). Clients cannot set it.
--   3. Storage team read requires: team_shared_by = row owner, row owner is a
--      member of the team, object name is in the owner's folder, and the
--      object's storage owner_id is the row owner. Legacy rows have
--      team_shared_by NULL and are NOT trusted until the owner re-shares.
--   service_role (Edge functions) is unchanged and trusted.
--
-- Does NOT delete or modify any existing row data (new columns are NULL).
-- Does NOT change bucket limits (see runbook: pending setting).

ALTER TABLE public.uploaded_contracts
  ADD COLUMN IF NOT EXISTS team_shared_by uuid,
  ADD COLUMN IF NOT EXISTS team_shared_at timestamptz;
ALTER TABLE public.saved_documents
  ADD COLUMN IF NOT EXISTS team_shared_by uuid,
  ADD COLUMN IF NOT EXISTS team_shared_at timestamptz;

COMMENT ON COLUMN public.uploaded_contracts.team_shared_by IS
  'Trigger-written provenance: owner who shared the row with team_id. NULL = not trusted for team file access.';
COMMENT ON COLUMN public.saved_documents.team_shared_by IS
  'Trigger-written provenance: owner who shared the row with team_id. NULL = not trusted for team file access.';

-- Client write guard. Runs for every write; enforces only for client roles.
CREATE OR REPLACE FUNCTION public.guard_team_file_binding()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_new_path text;
  v_old_path text;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW; -- service_role / owner: trusted server paths
  END IF;
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'team_file_binding: no authenticated user' USING ERRCODE = '42501';
  END IF;

  IF TG_TABLE_NAME = 'uploaded_contracts' THEN
    v_new_path := NEW.storage_path;
    v_old_path := CASE WHEN TG_OP = 'UPDATE' THEN OLD.storage_path END;
  ELSE
    v_new_path := NEW.payload ->> 'storage_path';
    v_old_path := CASE WHEN TG_OP = 'UPDATE' THEN OLD.payload ->> 'storage_path' END;
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF NEW.user_id IS DISTINCT FROM v_uid THEN
      RAISE EXCEPTION 'team_file_binding: user_id must be the caller' USING ERRCODE = '42501';
    END IF;
  ELSE
    IF NEW.user_id IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'team_file_binding: user_id is immutable' USING ERRCODE = '42501';
    END IF;
    IF v_new_path IS DISTINCT FROM v_old_path AND v_uid IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'team_file_binding: only the owner may change the file reference' USING ERRCODE = '42501';
    END IF;
    IF NEW.team_id IS DISTINCT FROM OLD.team_id AND v_uid IS DISTINCT FROM OLD.user_id THEN
      RAISE EXCEPTION 'team_file_binding: only the owner may change team sharing' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF v_new_path IS NOT NULL
     AND v_new_path IS DISTINCT FROM v_old_path
     AND split_part(v_new_path, '/', 1) <> NEW.user_id::text THEN
    RAISE EXCEPTION 'team_file_binding: file must be in the owner folder' USING ERRCODE = '42501';
  END IF;

  IF NEW.team_id IS NULL THEN
    NEW.team_shared_by := NULL;
    NEW.team_shared_at := NULL;
  ELSIF TG_OP = 'INSERT' OR NEW.team_id IS DISTINCT FROM OLD.team_id THEN
    IF NOT public.is_team_member(v_uid, NEW.team_id) THEN
      RAISE EXCEPTION 'team_file_binding: not a member of team' USING ERRCODE = '42501';
    END IF;
    NEW.team_shared_by := v_uid;       -- owner (checked above)
    NEW.team_shared_at := now();
  ELSE
    NEW.team_shared_by := OLD.team_shared_by; -- never client-writable
    NEW.team_shared_at := OLD.team_shared_at;
  END IF;
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.guard_team_file_binding() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS trg_guard_team_file_binding ON public.uploaded_contracts;
CREATE TRIGGER trg_guard_team_file_binding
  BEFORE INSERT OR UPDATE ON public.uploaded_contracts
  FOR EACH ROW EXECUTE FUNCTION public.guard_team_file_binding();
DROP TRIGGER IF EXISTS trg_guard_team_file_binding ON public.saved_documents;
CREATE TRIGGER trg_guard_team_file_binding
  BEFORE INSERT OR UPDATE ON public.saved_documents
  FOR EACH ROW EXECUTE FUNCTION public.guard_team_file_binding();

-- Row policies: split FOR ALL into per-command policies.
DROP POLICY IF EXISTS uploaded_contracts_all_own ON public.uploaded_contracts;
CREATE POLICY uploaded_contracts_select ON public.uploaded_contracts
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)));
CREATE POLICY uploaded_contracts_insert_own ON public.uploaded_contracts
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (team_id IS NULL OR public.is_team_member(auth.uid(), team_id))
    AND (storage_path IS NULL OR split_part(storage_path, '/', 1) = auth.uid()::text)
  );
CREATE POLICY uploaded_contracts_update ON public.uploaded_contracts
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)))
  WITH CHECK (
    (auth.uid() = user_id OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)))
    AND (storage_path IS NULL OR split_part(storage_path, '/', 1) = user_id::text)
  );
CREATE POLICY uploaded_contracts_delete ON public.uploaded_contracts
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)));

DROP POLICY IF EXISTS saved_documents_all_own ON public.saved_documents;
CREATE POLICY saved_documents_select ON public.saved_documents
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)));
CREATE POLICY saved_documents_insert_own ON public.saved_documents
  FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid() = user_id
    AND (team_id IS NULL OR public.is_team_member(auth.uid(), team_id))
    AND (payload ->> 'storage_path' IS NULL
         OR split_part(payload ->> 'storage_path', '/', 1) = auth.uid()::text)
  );
CREATE POLICY saved_documents_update ON public.saved_documents
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)))
  WITH CHECK (
    (auth.uid() = user_id OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)))
    AND (payload ->> 'storage_path' IS NULL
         OR split_part(payload ->> 'storage_path', '/', 1) = user_id::text)
  );
CREATE POLICY saved_documents_delete ON public.saved_documents
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id OR (team_id IS NOT NULL AND public.is_team_member(auth.uid(), team_id)));

-- Storage team read: bound to proven owner provenance and the real object owner.
DROP POLICY IF EXISTS "user_contracts_team_select" ON storage.objects;
CREATE POLICY "user_contracts_team_select"
ON storage.objects
FOR SELECT
TO authenticated
USING (
  bucket_id = 'user-contracts'
  AND (
    EXISTS (
      SELECT 1 FROM public.uploaded_contracts uc
      WHERE uc.storage_path = storage.objects.name
        AND uc.team_id IS NOT NULL
        AND uc.team_shared_by = uc.user_id
        AND split_part(storage.objects.name, '/', 1) = uc.user_id::text
        AND storage.objects.owner_id = uc.user_id::text
        AND public.is_team_member(uc.user_id, uc.team_id)
        AND public.is_team_member(auth.uid(), uc.team_id)
    )
    OR EXISTS (
      SELECT 1 FROM public.saved_documents sd
      WHERE sd.payload ->> 'storage_path' = storage.objects.name
        AND sd.team_id IS NOT NULL
        AND sd.team_shared_by = sd.user_id
        AND split_part(storage.objects.name, '/', 1) = sd.user_id::text
        AND storage.objects.owner_id = sd.user_id::text
        AND public.is_team_member(sd.user_id, sd.team_id)
        AND public.is_team_member(auth.uid(), sd.team_id)
    )
  )
);
