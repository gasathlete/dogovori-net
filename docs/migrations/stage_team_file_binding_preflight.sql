-- READ-ONLY preflight for stage_team_file_binding. Aggregates only; returns no
-- row contents, ids, paths or emails. Run BEFORE applying. Any non-zero value in
-- a *_forged / *_mismatch / *_ambiguous column = STOP (fail closed) and follow
-- the owner re-authorization procedure in the runbook.
SELECT 'uploaded_contracts' AS tbl,
  count(*) AS total,
  count(*) FILTER (WHERE uc.storage_path IS NOT NULL) AS with_file,
  count(*) FILTER (WHERE uc.team_id IS NOT NULL) AS team_rows,
  count(*) FILTER (WHERE uc.team_id IS NOT NULL AND uc.storage_path IS NOT NULL) AS team_file_rows_need_reshare,
  count(*) FILTER (WHERE uc.storage_path IS NOT NULL AND split_part(uc.storage_path,'/',1) <> uc.user_id::text) AS path_owner_mismatch,
  count(*) FILTER (WHERE o.id IS NOT NULL AND o.owner_id IS DISTINCT FROM uc.user_id::text) AS object_owner_mismatch,
  count(*) FILTER (WHERE uc.team_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.team_members tm WHERE tm.team_id = uc.team_id AND tm.user_id = uc.user_id)) AS owner_not_in_team_forged,
  count(*) FILTER (WHERE uc.storage_path IS NOT NULL AND (
    SELECT count(*) FROM public.uploaded_contracts x WHERE x.storage_path = uc.storage_path) > 1) AS shared_path_ambiguous
FROM public.uploaded_contracts uc
LEFT JOIN storage.objects o ON o.bucket_id = 'user-contracts' AND o.name = uc.storage_path
UNION ALL
SELECT 'saved_documents',
  count(*),
  count(*) FILTER (WHERE sd.payload ? 'storage_path'),
  count(*) FILTER (WHERE sd.team_id IS NOT NULL),
  count(*) FILTER (WHERE sd.team_id IS NOT NULL AND sd.payload ? 'storage_path'),
  count(*) FILTER (WHERE sd.payload ? 'storage_path' AND split_part(sd.payload->>'storage_path','/',1) <> sd.user_id::text),
  count(*) FILTER (WHERE o.id IS NOT NULL AND o.owner_id IS DISTINCT FROM sd.user_id::text),
  count(*) FILTER (WHERE sd.team_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.team_members tm WHERE tm.team_id = sd.team_id AND tm.user_id = sd.user_id)),
  count(*) FILTER (WHERE sd.payload ? 'storage_path' AND EXISTS (
    SELECT 1 FROM public.uploaded_contracts x WHERE x.storage_path = sd.payload->>'storage_path' AND x.user_id <> sd.user_id))
FROM public.saved_documents sd
LEFT JOIN storage.objects o ON o.bucket_id = 'user-contracts' AND o.name = sd.payload->>'storage_path';
