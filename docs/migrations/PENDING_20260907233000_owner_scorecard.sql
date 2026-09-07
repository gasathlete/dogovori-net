-- Stage 2d1a — owner operating scorecard (PENDING REVIEW — NOT APPLIED)
--
-- Aggregate-only RPC for the owner scorecard. Admin-only. Never returns
-- session_id, user_id, journey/run/browser/tab ids, Stripe ids, emails,
-- IP/user-agent, raw props, or raw rows. No revenue/amount sums.
--
-- Labeling notes (also kept in comments inline):
-- * confirmed_checkout_return is a CLIENT RETURN EVENT (funnel event
--   upgrade_completed on the checkout return page), not payment truth.
-- * tracked_sessions is first-party page_view context, not Lovable unique
--   visitors.
--
-- Fixed payment-truth cutover: timestamptz '2026-09-07 22:42:00+00'.
-- order_snapshots before that moment do not carry payment truth and are
-- excluded from automated proven payments entirely.

CREATE OR REPLACE FUNCTION public.owner_scorecard(_from timestamptz, _to timestamptz)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $fn$
DECLARE
  _cutover constant timestamptz := '2026-09-07 22:42:00+00';

  _funnel jsonb;
  _traffic jsonb;
  _truth jsonb;
  _cohorts jsonb;
  _kinds jsonb;

  _automated_orders_period bigint;
  _automated_proven_payers_total bigint;
  _legacy_baseline_payers bigint;
  _proven_payers_total bigint;
  _new_proven_payers_period bigint;
  _proof_first_order_at timestamptz;

  _first_mode_subscription_total bigint;
  _first_mode_one_time_total bigint;
  _first_mode_unknown_total bigint;
  _first_mode_subscription_period bigint;
  _first_mode_one_time_period bigint;
  _first_mode_unknown_period bigint;
  _one_time_first_total bigint;
  _one_off_to_subscription_total bigint;
  _one_off_to_subscription_period bigint;
BEGIN
  -- Admin-only guard: moderators are explicitly forbidden.
  IF NOT public.has_role(auth.uid(), 'admin'::public.app_role) THEN
    RAISE EXCEPTION 'forbidden' USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Range validation: reject null/reversed windows and windows > 366 days.
  IF _from IS NULL OR _to IS NULL OR _from >= _to OR (_to - _from) > interval '366 days' THEN
    RAISE EXCEPTION 'invalid_range';
  END IF;

  ----------------------------------------------------------------------
  -- 1) Funnel: distinct session counts per canonical event in [_from,_to).
  ----------------------------------------------------------------------
  SELECT jsonb_build_object(
    'doc_start',               COALESCE(count(DISTINCT session_id) FILTER (WHERE name = 'doc_start'), 0),
    'result_viewed',           COALESCE(count(DISTINCT session_id) FILTER (WHERE name = 'result_viewed'), 0),
    'signup_or_claim',         COALESCE(count(DISTINCT session_id) FILTER (WHERE name IN ('signup_completed', 'draft_claim_succeeded')), 0),
    'auth_prompt_shown',       COALESCE(count(DISTINCT session_id) FILTER (WHERE name = 'auth_prompt_shown'), 0),
    'draft_claim_started',     COALESCE(count(DISTINCT session_id) FILTER (WHERE name = 'draft_claim_started'), 0),
    'draft_claim_succeeded',   COALESCE(count(DISTINCT session_id) FILTER (WHERE name = 'draft_claim_succeeded'), 0),
    'checkout_started',        COALESCE(count(DISTINCT session_id) FILTER (WHERE name = 'checkout_started'), 0),
    -- confirmed_checkout_return is a client return event, NOT payment truth.
    'confirmed_checkout_return', COALESCE(count(DISTINCT session_id) FILTER (WHERE name = 'upgrade_completed'), 0),
    'doc_download_success',    COALESCE(count(DISTINCT session_id) FILTER (WHERE name = 'doc_download_success'), 0)
  ) INTO _funnel
  FROM public.funnel_events
  WHERE created_at >= _from AND created_at < _to;

  ----------------------------------------------------------------------
  -- 2) Traffic context from page_views (first-party data).
  --    tracked_sessions is first-party context, NOT Lovable unique visitors.
  ----------------------------------------------------------------------
  SELECT jsonb_build_object(
    'tracked_sessions', COALESCE(count(DISTINCT session_id), 0),
    'pageviews',        COALESCE(count(*), 0)
  ) INTO _traffic
  FROM public.page_views
  WHERE created_at >= _from AND created_at < _to
    AND event = 'pageview';

  ----------------------------------------------------------------------
  -- 3-9) Payment truth from order_snapshots after the cutover only.
  ----------------------------------------------------------------------
  WITH
  -- 3) Automated proven orders: the ONLY automated proven payments.
  proven AS (
    SELECT os.user_id, os.purchase_kind, os.created_at
    FROM public.order_snapshots os
    WHERE os.created_at >= _cutover
      AND os.created_at < _to
      AND os.environment = 'live'
      AND os.payment_status = 'paid'
      AND os.stripe_session_id IS NOT NULL
      AND os.user_id IS NOT NULL
  ),
  -- 4) Legacy pre-snapshot Stripe subscription baseline (separately labeled;
  --    never inferred from profiles/pro_until/quota/status flags).
  legacy_baseline AS (
    SELECT s.user_id
    FROM public.subscriptions s
    WHERE s.environment = 'live'
      AND s.stripe_subscription_id IS NOT NULL
      AND s.created_at < _cutover
    UNION
    SELECT t.owner_id
    FROM public.teams t
    WHERE t.environment = 'live'
      AND t.stripe_subscription_id IS NOT NULL
      AND t.created_at < _cutover
  ),
  -- First automated proven order per user.
  first_orders AS (
    SELECT user_id, min(created_at) AS first_at
    FROM proven
    GROUP BY user_id
  ),
  first_kinds AS (
    SELECT fo.user_id, fo.first_at, p.purchase_kind AS first_kind
    FROM first_orders fo
    JOIN proven p ON p.user_id = fo.user_id AND p.created_at = fo.first_at
  ),
  -- 7) First automated purchase mode (closed classification).
  first_modes AS (
    SELECT
      user_id,
      first_at,
      CASE
        WHEN first_kind IN ('team', 'subscription') THEN 'subscription'
        WHEN first_kind IN ('strict_unlock', 'branding', 'entry_pack', 'topup', 'one_time') THEN 'one_time'
        ELSE 'unknown'
      END AS first_mode,
      first_kind
    FROM first_kinds
  ),
  -- 8) One-off -> subscription: later automated subscription/team order.
  one_time_conversions AS (
    SELECT
      fm.user_id,
      min(p.created_at) FILTER (
        WHERE p.purchase_kind IN ('subscription', 'team')
          AND p.created_at > fm.first_at
      ) AS first_sub_at
    FROM first_modes fm
    JOIN proven p ON p.user_id = fm.user_id
    WHERE fm.first_mode = 'one_time'
    GROUP BY fm.user_id
  )
  SELECT
    -- 6) Period counts.
    (SELECT count(*) FROM proven WHERE created_at >= _from),
    (SELECT count(*) FROM proven),
    (SELECT count(*) FROM legacy_baseline),
    -- 5) Distinct union: legacy baseline users + automated proven-order users.
    (SELECT count(*) FROM (SELECT user_id FROM legacy_baseline UNION SELECT user_id FROM proven) u),
    (SELECT count(*) FROM first_modes fm WHERE fm.first_at >= _from AND fm.user_id NOT IN (SELECT user_id FROM legacy_baseline)),
    -- 7) Mutually exclusive first-mode totals / among new period payers.
    (SELECT count(*) FROM first_modes WHERE first_mode = 'subscription'),
    (SELECT count(*) FROM first_modes WHERE first_mode = 'one_time'),
    (SELECT count(*) FROM first_modes WHERE first_mode = 'unknown'),
    (SELECT count(*) FROM first_modes fm WHERE fm.first_mode = 'subscription' AND fm.first_at >= _from AND fm.user_id NOT IN (SELECT user_id FROM legacy_baseline)),
    (SELECT count(*) FROM first_modes fm WHERE fm.first_mode = 'one_time' AND fm.first_at >= _from AND fm.user_id NOT IN (SELECT user_id FROM legacy_baseline)),
    (SELECT count(*) FROM first_modes fm WHERE fm.first_mode = 'unknown' AND fm.first_at >= _from AND fm.user_id NOT IN (SELECT user_id FROM legacy_baseline)),
    -- 8) One-off -> subscription conversion context.
    (SELECT count(*) FROM first_modes WHERE first_mode = 'one_time'),
    (SELECT count(*) FROM one_time_conversions WHERE first_sub_at IS NOT NULL),
    (SELECT count(*) FROM one_time_conversions WHERE first_sub_at >= _from)
  INTO
    _automated_orders_period,
    _automated_proven_payers_total,
    _legacy_baseline_payers,
    _proven_payers_total,
    _new_proven_payers_period,
    _first_mode_subscription_total,
    _first_mode_one_time_total,
    _first_mode_unknown_total,
    _first_mode_subscription_period,
    _first_mode_one_time_period,
    _first_mode_unknown_period,
    _one_time_first_total,
    _one_off_to_subscription_total,
    _one_off_to_subscription_period;

  -- Earliest automated proven order as the earliest proof point.
  SELECT min(p.created_at) INTO _proof_first_order_at
  FROM public.order_snapshots p
  WHERE p.created_at >= _cutover
    AND p.created_at < _to
    AND p.environment = 'live'
    AND p.payment_status = 'paid'
    AND p.stripe_session_id IS NOT NULL;

  _truth := jsonb_build_object(
    'automated_proven_orders_period',  COALESCE(_automated_orders_period, 0),
    'automated_proven_payers_total',   COALESCE(_automated_proven_payers_total, 0),
    'legacy_baseline_payers',          COALESCE(_legacy_baseline_payers, 0),
    'proven_payers_total',             COALESCE(_proven_payers_total, 0),
    'new_proven_payers_period',        COALESCE(_new_proven_payers_period, 0),
    'proof_first_order_at',            _proof_first_order_at
  );

  _cohorts := jsonb_build_object(
    'first_mode_subscription_total',  COALESCE(_first_mode_subscription_total, 0),
    'first_mode_one_time_total',      COALESCE(_first_mode_one_time_total, 0),
    'first_mode_unknown_total',       COALESCE(_first_mode_unknown_total, 0),
    'first_mode_subscription_period', COALESCE(_first_mode_subscription_period, 0),
    'first_mode_one_time_period',     COALESCE(_first_mode_one_time_period, 0),
    'first_mode_unknown_period',      COALESCE(_first_mode_unknown_period, 0),
    'one_time_first_total',           COALESCE(_one_time_first_total, 0),
    'one_off_to_subscription_total',  COALESCE(_one_off_to_subscription_total, 0),
    'one_off_to_subscription_period', COALESCE(_one_off_to_subscription_period, 0)
  );

  ----------------------------------------------------------------------
  -- 9) Automated order counts in the period by closed purchase_kind
  --    (including unknown). No revenue/amount sums.
  ----------------------------------------------------------------------
  SELECT COALESCE(jsonb_object_agg(purchase_kind, n), '{}'::jsonb) INTO _kinds
  FROM (
    SELECT os.purchase_kind, count(*) AS n
    FROM public.order_snapshots os
    WHERE os.created_at >= _from
      AND os.created_at < _to
      AND os.created_at >= _cutover
      AND os.environment = 'live'
      AND os.payment_status = 'paid'
      AND os.stripe_session_id IS NOT NULL
    GROUP BY os.purchase_kind
  ) k;

  RETURN jsonb_build_object(
    'truth_schema_version', 1,
    'payment_truth_cutover', _cutover,
    'range', jsonb_build_object('from', _from, 'to', _to),
    'funnel', COALESCE(_funnel, '{}'::jsonb),
    'traffic_context', COALESCE(_traffic, '{}'::jsonb),
    'payment_truth', _truth,
    'first_purchase_cohorts', _cohorts,
    'purchase_kinds', _kinds
  );
END;
$fn$;

-- Access: aggregate RPC for admins only.
REVOKE ALL ON FUNCTION public.owner_scorecard(timestamptz, timestamptz) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.owner_scorecard(timestamptz, timestamptz) FROM anon;
GRANT EXECUTE ON FUNCTION public.owner_scorecard(timestamptz, timestamptz) TO authenticated;

COMMENT ON FUNCTION public.owner_scorecard(timestamptz, timestamptz) IS
  'Stage 2d1a owner scorecard. Admin-only aggregate RPC. confirmed_checkout_return is a client return event, not payment truth; tracked_sessions is first-party context, not Lovable unique visitors. No revenue sums; no identifiers returned.';
