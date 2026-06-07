
-- 1) Restore signup_at from auth.users.created_at (was clobbered by previous bulk reset)
UPDATE public.download_quota q
   SET signup_at = u.created_at,
       updated_at = now()
  FROM auth.users u
 WHERE q.user_id = u.id
   AND q.signup_at > u.created_at;

-- 2) Recompute monthly counters from quota_session_charges since the user's monthly_reset_at.
--    quota_session_charges is the source of truth for what was actually charged.
WITH agg AS (
  SELECT
    q.user_id,
    COUNT(*) FILTER (WHERE c.kind IN ('contract','template','analysis'))::int AS total,
    COUNT(*) FILTER (WHERE c.kind = 'contract')::int AS contracts,
    COUNT(*) FILTER (WHERE c.kind = 'template')::int AS templates
  FROM public.download_quota q
  LEFT JOIN public.quota_session_charges c
    ON c.user_id = q.user_id
   AND c.created_at >= q.monthly_reset_at
  GROUP BY q.user_id
)
UPDATE public.download_quota q
   SET monthly_total_used     = agg.total,
       monthly_contracts_used = agg.contracts,
       monthly_templates_used = agg.templates,
       updated_at = now()
  FROM agg
 WHERE agg.user_id = q.user_id;
