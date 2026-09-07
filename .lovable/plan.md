# Stage 2d — Owner operating scorecard (90 days, 60 proven payers)

Read-only audit at HEAD `b2f841fbe45df8d1cd0314afff98d6b78d2c31f1`, clean tree. No files edited, no commands with side effects, no DB/Stripe/network calls.

## 1. Existing admin surface (reusable)

- Routes, all lazy: `src/App.tsx:344` `/admin/funnel`, `src/App.tsx:347` `/admin/metrics`, `src/App.tsx:362` `/admin/financials`; imports at `src/App.tsx:127,130,133`.
- Guard: every admin route uses only `ProtectedRoute` (`src/components/ProtectedRoute.tsx:5-23`) — login only, **no role check in the router**. `AdminMetrics.tsx` and `AdminFunnel.tsx` contain no `is_staff` call; they rely on the SECURITY DEFINER RPC raising `forbidden`. `AdminAnalytics.tsx:30` and `AdminFinancials.tsx:46` do the correct client-side `supabase.rpc("is_staff", …)` gate.
- Nav: `src/pages/Admin.tsx:131` (Growth & Quality), `:136` (Финанси).
- Reusable presentation: `src/pages/AdminMetrics.tsx:52-95` (`Kpi`, `FunnelBar`), `src/components/admin/analytics/KpiCards.tsx`, `RangePicker.tsx` (`rangeToBounds`, `AnalyticsRange`), `TrafficChart.tsx`, `AppKpiPanel.tsx`. `AdminMetrics.tsx:50` already defines `RANGE_DAYS = {7d,30d,90d}`.

## 2. Canonical journey events

Single source of truth: `src/lib/funnelEvents.ts:44-70` (`CANONICAL_EVENTS`) and `:75-104` (`STORED_NAME` canonical → stored name). Relevant mapping:

| Journey stage | Canonical | Stored in `funnel_events.name` |
|---|---|---|
| document start | `document_selected` | `doc_start` (`funnelEvents.ts:76`) |
| useful result viewed | `result_viewed` | `result_viewed` (`:84`) |
| auth prompt | `auth_prompt_shown` | `auth_prompt_shown` (`:82`) |
| signup | `signup_completed` | `signup_completed` (`:83`) |
| claim continuity | `draft_claim_started` / `draft_claim_succeeded` / `draft_claim_blocked` | same names (`:93-97`) |
| checkout started | `checkout_started` | `checkout_started` (`:86`) |
| checkout completed | `checkout_completed` | **`upgrade_completed`** (`:87`) |

Helpers: `canonicalEventName()` `funnelEvents.ts:107-113`; dedup `ONCE_PER_SESSION_DOC` `:120-130`; PII scrubbing `sanitizeFunnelProps`; call-site wrappers in `src/lib/docFunnel.ts` (`trackResultViewed:227`, `trackPaywallShown:238`, `trackCheckoutCompleted:246`); descriptor allowlists in `src/lib/checkoutAnalytics.ts:79-171`.

Insert path: `src/lib/funnel.ts:265` merges `getCurrentFunnelContext()` into props, `:286-297` inserts into `public.funnel_events` with `session_id` = browser id and optional `user_id`.

## 3. Cohorting fields available today

- one_time vs subscription: `checkoutAnalytics.ts:79-88` `PURCHASE_KINDS` and `:145-171` `purchaseKindForPrice` → props `kind`, plus `plan` / `billing` from `describePriceId` (`:18-29`). Emitted on completion at `src/pages/CheckoutReturn.tsx:135-139`.
- Product / plan / source: `CHECKOUT_PRICE_KEYS` `:91-106`, `CHECKOUT_SOURCES` `:109-118` — closed allowlists, safe to render.
- Audience/segment: `props.segment` ∈ business|freelancer, already aggregated in `metrics_overview` (`supabase/migrations/20260904210000_metrics_overview_checkout_failed.sql`, `seg_business`/`seg_freelancer`).
- Journey continuity: `journey_id`, `run_id`, `browser_id`, `tab_session_id` from `src/lib/funnelContext.ts:214-229`; validated pair at `:207-210`.
- Anonymous vs claimed: `funnel_events.user_id` NULL vs set (`funnel.ts:292`) plus the `draft_claim_*` events.
- **Unsafe to render:** `session_id` / `browser_id` / `tab_session_id` / `journey_id` / `run_id` / `user_id` / any Stripe id. The raw Stripe session id is already never stored — only `compactSessionToken` (`docFunnel.ts:243-252`). The scorecard must show counts and rates only.

## 4. Existing aggregation and security constraints

- Table: `supabase/migrations/20260629173521_…sql:2-20` `funnel_events` with indexes on `created_at`, `name`, `session_id`; RLS `:22-40` — anon/auth INSERT with shape check, SELECT only for `has_role(auth.uid(),'admin')`. So a non-admin staff member cannot read raw rows; aggregate RPCs are the correct path.
- `metrics_overview(_from,_to)` — latest source `20260904210000_metrics_overview_checkout_failed.sql:16`, `STABLE SECURITY DEFINER`, gated by `is_staff(auth.uid())`, returns `acquisition / activation / continuity / conversion / segments / quality`. That file's own header states it is a prepared, **not applied** source; the frontend tolerates the missing `conversion.checkout_failed` (`AdminMetrics.tsx:35-37`). Applied state not verified (no DB query in this audit).
- `metrics_event_timeseries(_from,_to,_bucket)` — `20260811211714_…sql:123-144`.
- `admin_financial_audit(_months)` — `20260811100758_…sql:1-80`: monthly signups, `active_paid` from `subscriptions.status IN ('active','trialing','past_due')`, teams/seats, ops, AI cost. No cash amounts.
- `purge_old_funnel_events()` — `20260811212141_…sql:1` (retention; long-range series can be truncated by it).

## 5. Payment-proof sources (per purchase kind)

Webhook `supabase/functions/payments-webhook/handlers.ts`:

| Kind | Proof row written | Line |
|---|---|---|
| strict unlock | `strict_doc_unlocks` upsert (+ entry-pack credit) | `:225-250` |
| branding | `branding_unlocks` upsert | `:253-270` |
| entry pack / topup | `credit_topup_ops` RPC (writes `topup_purchases`, idempotent per session) | `:274-295` |
| subscription | `subscriptions` upsert | `:126-141` |
| team | `teams` status/seat update (`metadata.kind === "team"`) | `:71-93, 109, 188-198` |
| **every completed session** | `order_snapshots` upsert, fail-closed, `onConflict: "stripe_session_id"` with `plan_name`, `price_amount`, `currency`, `billing_period`, `stripe_subscription_id` | `:300-334` |

`order_snapshots` schema `20260610075416_…sql:95-129`; staff can read it (`order_snapshots_user_select`: `user_id = auth.uid() OR is_staff(...)`); uniqueness index `20260907203000_order_snapshots_session_unique.sql:19`.

**Rule for the dashboard:** `order_snapshots` is the only per-payment truth covering all six kinds, because it is written by the verified Stripe webhook once per session. `profiles.plan` / `pro_until`, admin RPCs `admin_set_pro` / `admin_add_bonus_contracts`, and quota tables can all be set manually and must never count as payments. A "proven payer" = a distinct `order_snapshots.user_id` whose row has a non-null `stripe_session_id`. Revenue must not be displayed unless summed from `order_snapshots.price_amount` grouped by `currency` — and even then labeled as recorded order amounts, not settled revenue (no refund/dispute state is stored).

## 6. Recommended Stage 2d scope (narrowest safe)

New owner-only page `/admin/scorecard`, aggregate-only, default 90d.

Files to add:
- `src/pages/AdminScorecard.tsx` — page: `is_staff` gate like `AdminFinancials.tsx:46`, `Seo` noindex, range 90d default (30d/7d optional), sections: journey, payment truth, cohorts, weekly pace.
- `src/components/admin/scorecard/ScorecardKpi.tsx`, `PaceBar.tsx`, `CohortSplit.tsx` — thin presentation, or reuse `AdminMetrics` `Kpi`/`FunnelBar` by extracting them to `src/components/admin/MetricPrimitives.tsx`.
- `src/lib/ownerScorecard.ts` — pure formula layer (input aggregate JSON → derived rates, pace, status), fully unit-testable and free of `supabase`.
- `src/test/ownerScorecard.test.ts` — formula, division-by-zero, and label tests.

Files to edit:
- `src/App.tsx` — one lazy import + one route.
- `src/pages/Admin.tsx` — one nav button.
- `src/pages/AdminMetrics.tsx` — only if primitives are extracted (no metric change).

KPI definitions (all from aggregates, 90-day window by default):
```text
document_starts        = distinct sessions with name='doc_start'
useful_result_viewed   = distinct sessions with name='result_viewed'
result_rate            = useful_result_viewed / document_starts
signup_claim_continuity= draft_claim_succeeded / draft_claim_started   (continuity block)
checkout_started       = count(name='checkout_started')
checkout_completed     = count(name='upgrade_completed')       [event view]
checkout_completion    = checkout_completed / checkout_started
proven_new_payers      = distinct order_snapshots.user_id with stripe_session_id NOT NULL
                         and first such row inside the window          [PAYMENT TRUTH]
visitor_to_payer       = proven_new_payers / visitors (page_views)
cohort_one_time        = payers whose first proven row has billing_period IS NULL
cohort_subscription    = payers whose first proven row has stripe_subscription_id NOT NULL
one_off_to_subscription= payers with a one-time row earlier and a subscription row later
weekly_pace            = proven_new_payers / weeks_in_window
pace_status            = weekly_pace vs target 5/week (on/behind), gap to 60 total
```
Every card carries a source badge: `Плащане (проверено)` for `order_snapshots`-derived numbers, `Продуктово събитие` for funnel-derived ones. No revenue card in Stage 2d.

States: `loading` skeleton per section; `error` inline with the RPC failure reason category (no raw text); `empty` = explicit "0 доказани плащания в периода" plus the reason ("`order_snapshots` е празна") rather than a blank chart; partial = render funnel section even if the payment RPC fails, and vice versa.

Tests: pure-formula tests in `src/test/ownerScorecard.test.ts`; a copy-integrity test asserting the page never renders `journey_id`/`session_id`/Stripe ids and never claims revenue; a guard test that the page calls `is_staff` before fetching.

## 7. Blockers requiring a reviewed DB migration

1. **No aggregate RPC exposes proven-payment counts.** `metrics_overview.conversion.paid_subscriptions` counts `subscriptions` rows (pro/manual states included) and `admin_financial_audit` has no payment-proof column. A new `SECURITY DEFINER`, `is_staff`-gated function — e.g. `owner_scorecard(_from,_to)` returning first-payment cohorts from `order_snapshots` — is required. Reading `order_snapshots` directly from the client is possible via RLS but would ship per-user rows to the browser; not acceptable for this dashboard.
2. **`20260904210000_metrics_overview_checkout_failed.sql` is declared unapplied in its own header.** Any Stage 2d field must be optional-tolerant, or that migration must be reviewed and applied first.
3. **Index for the payment cohort query:** `order_snapshots` has only `(user_id, created_at DESC)` and the session unique index; a first-payment-per-user query over 90 days would benefit from `(created_at)`. Same reviewed migration.
4. **Router role gap:** `/admin/*` routes are login-only; the new page must gate on `is_staff` client-side (source-only, no migration).

No plan feature claims are proposed for change.

## 8. HEAD and status

```text
git rev-parse HEAD  → b2f841fbe45df8d1cd0314afff98d6b78d2c31f1
git status --porcelain → (empty; clean tree, unchanged by this audit)
```
