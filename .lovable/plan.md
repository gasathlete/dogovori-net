# Admin Analytics Dashboard (Plausible-style)

Build a lightweight first-party analytics dashboard in the admin panel, fed by our own `page_views` table, plus existing app data for conversion KPIs.

## Scope

1. **Tracking** — every page visit writes a row to `page_views` (no PII, hashed visitor id by day + UA-derived browser/OS/device, referrer, country from CF/Vercel header if available, path, duration, is_bounce).
2. **Admin route** `/admin/analytics` — staff-only, shown as a new tab in the existing admin panel.
3. **Metrics** (24h / 7d / 30d switcher):
   - KPI cards: Unique visitors, Pageviews, Bounce rate, Avg visit duration
   - Time-series chart (Recharts area chart)
   - Top tables: Pages, Sources/referrers, Countries, Devices (mobile/desktop/tablet), Browsers
   - App KPIs: new signups, ops consumed, paid conversions (% of signups → subscription) — from `auth.users`, `download_quota`, `subscriptions`

## Technical plan

### 1. DB migration
- `public.page_views` table:
  - `id uuid pk`, `created_at timestamptz`, `visitor_day_hash text` (sha256 of ip+ua+date salt — daily uniques), `session_id uuid`, `user_id uuid null`, `path text`, `referrer_host text null`, `utm_source text null`, `country text null`, `device text` (mobile/tablet/desktop), `browser text`, `os text`, `duration_ms int null`, `is_bounce bool default true`, `event text default 'pageview'` (allow custom events later).
- Indexes: `(created_at desc)`, `(path, created_at)`, `(visitor_day_hash, created_at)`.
- GRANT INSERT to `anon, authenticated` (writes go via edge function with service_role — so actually grant only to `service_role` and keep RLS deny-all for clients).
- RLS: SELECT only via `is_staff(auth.uid())`; no client INSERT.
- Aggregation RPCs (security definer, staff-only):
  - `analytics_kpis(_from, _to)` → visitors, pageviews, bounce_rate, avg_duration_ms
  - `analytics_timeseries(_from, _to, _bucket)` → time bucket + visitors + pageviews
  - `analytics_top(_from, _to, _dim text, _limit int)` → returns `(label, visitors, pageviews)` for dim in (`path`,`referrer_host`,`country`,`device`,`browser`)
  - `analytics_app_kpis(_from, _to)` → signups, ops, paid_conversions, paying_users

### 2. Edge function `track-pageview`
- Public (verify_jwt=false), CORS open.
- Body: `{ path, referrer, session_id, duration_ms?, is_bounce? }`.
- Server derives: country (from `cf-ipcountry` / `x-vercel-ip-country` / fallback null), device/browser/os (from UA via simple regex parser inline), `visitor_day_hash = sha256(ip + ua + YYYY-MM-DD + salt)`.
- Optional `user_id` from JWT if present.
- Inserts via service_role; rate-limits per IP (best effort in memory).
- Supports a second event mode `event: 'duration_update'` that updates an existing row's `duration_ms` and clears `is_bounce` (sendBeacon on unload).

### 3. Client tracker `src/lib/pageviewTracker.ts`
- Auto-tracks route changes (react-router `useLocation`) — hooked in `App.tsx`.
- Respects existing analytics cookie consent (`getCategoryConsent('analytics')`) — fully aligned with current Plausible gate.
- Sends initial pageview on route change, then sends `duration_update` via `navigator.sendBeacon` on `visibilitychange=hidden` / `pagehide`.

### 4. Admin UI
- New page `src/pages/AdminAnalytics.tsx`, registered in router and linked from `Admin.tsx` as a tab/section card.
- Components inside `src/components/admin/analytics/`:
  - `RangePicker` (24h / 7d / 30d)
  - `KpiCards`
  - `TrafficChart` (Recharts AreaChart)
  - `TopList` (reused for Pages / Sources / Countries / Devices / Browsers, tabbed)
  - `AppKpiPanel` (signups, ops, paid conversion rate)
- All data fetched via `supabase.rpc(...)` against the new staff-only functions.
- Uses semantic design tokens (`bg-card`, `text-muted-foreground`, `text-primary`) — no hardcoded colors.

### 5. Privacy / compliance
- No raw IP stored; only daily-rotated hash.
- Tracker gated by analytics consent (same as Plausible).
- Add a short note in the existing Cookies page that we also run first-party analytics; no new consent category needed.

## Out of scope (v1)
- Funnels, goals UI, custom events beyond pageview/duration (schema supports it — UI later).
- Geo map (countries shown as ranked list only).
- Realtime live counter (can add a 30-min query later — easy extension).

## Files to change / add

```text
supabase/migrations/<ts>_analytics_pageviews.sql        # new
supabase/functions/track-pageview/index.ts              # new
src/lib/pageviewTracker.ts                              # new
src/components/admin/analytics/RangePicker.tsx          # new
src/components/admin/analytics/KpiCards.tsx             # new
src/components/admin/analytics/TrafficChart.tsx         # new
src/components/admin/analytics/TopList.tsx              # new
src/components/admin/analytics/AppKpiPanel.tsx          # new
src/pages/AdminAnalytics.tsx                            # new
src/App.tsx                                             # mount tracker + route
src/pages/Admin.tsx                                     # add link/tab to /admin/analytics
```
