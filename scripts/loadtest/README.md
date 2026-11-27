# Load-test harness (k6)

Real-traffic simulation of 50+ concurrent users against the deployed app.
Uses [k6](https://k6.io) — install once with `brew install k6` (macOS) or
follow https://k6.io/docs/get-started/installation/.

## Scenarios

- `browse.k6.js` — anonymous browsing of public routes (home, catalog, sector,
  template, blog). No auth, no writes.
- `wizard.k6.js` — logged-in user opens the wizard, fills answers, hits
  `generate-contract`, downloads a PDF. Requires `TEST_EMAIL` + `TEST_PASSWORD`.
- `mixed.k6.js` — realistic mix: 70% browse, 20% wizard, 10% assistant chat.
  Ramps 0→50 VUs over 1 min, holds 3 min, spikes to 100 for 30 s.

## Running

Set the target base URL (defaults to production):

```bash
export BASE_URL=https://dogovori.net
export SUPABASE_URL=https://<project>.supabase.co
export SUPABASE_ANON_KEY=<anon-key>

# Public-only:
k6 run scripts/loadtest/browse.k6.js

# Authenticated flow:
export TEST_EMAIL=loadtest@example.com
export TEST_PASSWORD=...
k6 run scripts/loadtest/wizard.k6.js

# Full mixed simulation (50→100 VUs):
k6 run --summary-export=reports/loadtest-$(date +%s).json scripts/loadtest/mixed.k6.js
```

## Acceptance targets (50 VU mixed)

| Metric | Threshold |
|---|---|
| `http_req_duration{group:browse}` p95 | < 800 ms |
| `http_req_duration{group:generate}` p95 | < 8 000 ms |
| `http_req_failed` | < 1 % |
| Edge function 5xx | 0 |

Thresholds are declared inline in `mixed.k6.js` so k6 exits non-zero when the
run misses them — CI-friendly.

## Notes on responsible testing

- Never run authenticated scenarios against production without a dedicated
  load-test account whose quota can be safely exhausted.
- Prefer running against a preview URL or a throwaway Cloud project for
  destructive scenarios (uploads, generation, corrections).
- `track-pageview` is public — the browse scenario will produce real page-view
  rows. That's intentional (measures the batching path end-to-end) but keep
  runs short.
