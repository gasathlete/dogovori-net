# Read-only issue audit — HEAD d24615e5

No files edited, no commit, nothing deployed or applied, no database writes, no provider/payment/email calls. Working tree verified clean after the audit (`git status` empty).

## Checks that were run (network-silent)

| Check | Result |
|---|---|
| `tsgo` typecheck | PASS, zero errors |
| `vitest run` (full) | 126 files, 1808 passed, 4 skipped, 0 failed |
| Deno `_shared/*.test.ts` | 755 passed, 0 failed |
| Deno `functions/*/*.test.ts` | 1086 passed, 0 failed |
| `eslint .` | 938 problems (826 errors, 112 warnings) |
| `scripts/product-rollout-preflight.ts` | PASS (9 migrations, 3 products, fail-closed gates) |
| `scripts/wizard-full-audit.ts` | 0 findings, no CRITICAL |
| Migration pair byte-parity (all of `drizzle/migrations` vs `supabase/migrations`) | 3 mismatches (see I2) |
| Seven sitemaps vs `0de2067b` | identical |
| Security scan (Lovable/backend) | 1 warn-level finding (see I5) |
| Runtime errors snapshot | none |
| Read-only DB introspection | applied-migration ledger, RLS/policy map, function search_path |

## Cannot be run here, and why

- `bun run build` / prerender / `verify-build` / `verify-seo-urls` — build is a state-changing command and out of scope for a read-only audit; also rewrites generated sitemap/meta artifacts.
- pgTAP suites `supabase/tests/0034–0041` — need a live PostgreSQL session with pgTAP and the migrations applied; applying is forbidden.
- Two-session PostgreSQL concurrency proofs for job claim / refinement / reconciliation — require real concurrent DB sessions.
- Stripe sandbox duplicate-webhook proof, real provider (AI/OCR/RAG) execution, email delivery — forbidden live traffic.
- Paid export end-to-end proof — needs a real paid entitlement in a live environment.
- PageSpeed / SEO monitor / load tests — network egress against the published site.
- Deployed edge-function secret/flag state (`PRODUCT_CHECKOUT_ENABLED`, `PRODUCT_AI_FULFILLMENT_ENABLED`, `PRODUCT_AI_ZERO_RETENTION_VERIFIED`, Stripe keys, webhook secrets) — reading secret values is out of scope; presence is unverified.

## Confirmed issues (with evidence)

### I1 — P0 — 21 database changes exist only in source; live schema is 26 days behind
Evidence: live `supabase_migrations.schema_migrations` newest version is `20260826080408`. 21 files in `supabase/migrations` are newer (`20260904210000_metrics_overview_checkout_failed.sql` … `20260921013000_gate3_paid_fulfillment_exact_once.sql`). Live introspection confirms `product_reconciliation_state`, `resolve_product_reconciliation`, `mark_product_job_reconciliation`, `mark_product_refinement_reconciliation`, `begin_product_result_refinement`-era Gate 3 objects are absent.
Impact: every Gate 1–3 exact-once guarantee (assistant turns, AI operations, paid fulfilment/refinement reconciliation), marketing-consent hardening, quota ledger and review authorization is source-only. Edge functions that call those RPCs would fail at runtime if their flags were turned on.
Source-only or live: source-only; live backend lacks the contracts.
Safest next action: agree an ordered apply window (0027→0041 dependency order), apply in a controlled session, then run the pgTAP suites. Do not enable paid flags before this.

### I2 — P1 — Three migration pairs are not byte-identical
Evidence: `drizzle/migrations/0006_metrics_overview_checkout_failed.sql`, `0007_credit_topup_ops_hardening.sql`, `0008_credit_topup_ops_acl_hardening.sql` differ from their `supabase/migrations` twins. Diffs are Bulgarian header comments plus inline comments; `0008` additionally differs only by a trailing newline. No SQL statement differences observed in `0006`/`0008`; `0007` differs by comment lines only.
Impact: the repo's own pairing convention ("paired copies must be byte-identical") is violated for three files, so checksum-based review of those cannot be trusted at a glance. Functionally benign as far as the diffs show.
Source-only or live: source-only (none of the three is applied — see I1).
Safest next action: make each pair byte-identical by copying the annotated `supabase/` version over the `drizzle/` one; re-run the preflight test.

### I3 — P2 — `eslint .` fails with 826 errors and is not part of CI
Evidence: `eslint .` exits with 938 problems. `.github/workflows/tests.yml` runs vitest/deno/audit only — no lint job. Dominant rules: `@typescript-eslint/no-explicit-any` (hundreds), `prefer-const`, plus `@typescript-eslint/ban-ts-comment` at `supabase/functions/warm-blank-cache/index.ts:378` (`@ts-ignore`) and `@typescript-eslint/no-require-imports` at `tailwind.config.ts:158`.
Impact: no compile/runtime breakage (typecheck and all tests pass), but the lint gate is effectively dead, so genuine new violations cannot be spotted.
Note: `no-control-regex` at `warm-blank-cache/index.ts:199` is an intentional control-character strip, not a defect.
Source-only or live: source-only.
Safest next action: decide a policy — either add a lint job with a baseline ceiling, or relax `no-explicit-any` to a warning — then fix only the real items (`@ts-ignore` → `@ts-expect-error`, `prefer-const`).

### I4 — P3 — Eight public tables have RLS enabled and zero policies
Evidence: live query — `generation_jobs`, `product_fulfillment_checkpoints`, `product_fulfillment_jobs`, `product_generation_artifacts`, `product_generation_calls`, `product_result_refinement_calls`, `rate_limit_buckets`, `template_cache`.
Impact: intended service-role-only design (deny-all to `anon`/`authenticated`), so this is correct-by-default, not a leak. Listed only so it is not mistaken for a gap later.
Source-only or live: live.
Safest next action: none; keep as documented intent.

### I5 — P3 — "Function Search Path Mutable" security warning is almost entirely extension noise
Evidence: scanner reports one warn-level `SUPA_function_search_path_mutable`. Live introspection shows the functions without a pinned `search_path` are pgvector/pg_trgm extension functions plus one project function, `assistant_edit_payload_path`, which is **not** SECURITY DEFINER (`prosecdef = false`).
Impact: no privilege-escalation path evidenced; cosmetic scanner noise.
Source-only or live: live.
Safest next action: optionally pin `search_path` on `assistant_edit_payload_path` inside the next migration batch; do not touch extension functions.

### I6 — P0 (release blocker, already known) — Gate 3 paid path has no execution proof
Evidence: pgTAP `supabase/tests/0041_gate3_paid_fulfillment_exact_once.sql` exists with `plan(68)` but has never been run (I1 — its objects do not exist live). Manifest `docs/migrations/product-rollout-manifest.json` records `0041` sha256 `f28b0c01…5d34b`, which matches both files on disk.
Impact: paid fulfilment idempotency, operator reconciliation semantics, orphan-refinement backstop and paid export are unverified against a real database.
Source-only or live: source-only.
Safest next action: apply, then run pgTAP 0039/0040/0041 and a controlled Stripe sandbox duplicate-webhook test before any paid go-live.

## Not defects — verified clean

- No `TODO`/`FIXME`/`HACK`/`XXX:` markers anywhere in `src`, `supabase`, `scripts` (0 hits).
- Manifest hashes match on-disk files for all ten recorded entries.
- Seven public sitemaps byte-identical to the reference commit.
- Paid feature flags default to `false` in `config/product-rollout-contract.json` (fail-closed); preflight enforces this.
- No runtime errors in the preview snapshot; no broken imports or routes evidenced (full render test suite passes).
- React `act()` and React Router v7 future-flag messages in the vitest output are test-environment warnings, not defects.

## Unverified risks (no evidence either way)

- Whether deployed edge functions already reference Gate 1–3 RPCs on a live code path; if any flag is enabled in the live environment, I1 becomes an active runtime failure rather than a dormant one. Needs a flag/secret-state read, which is out of scope here.
- Accessibility and mobile behaviour beyond what unit tests assert — no real-browser pass was run.
- Publish freshness: whether the published site matches this HEAD.

## Ordered action queue for the next implementation turn

1. Confirm live flag state for the three product flags (read-only), to decide whether I1 is dormant or active.
2. Make the three migration pairs byte-identical (I2) — smallest, zero-risk source fix.
3. Prepare an apply plan for the 21 unapplied migrations in strict dependency order, with per-migration rollback notes (no apply in that same turn).
4. Apply migrations in a controlled window, then run pgTAP 0034–0041 and record real counts (I1, I6).
5. Run the two-session PostgreSQL concurrency proofs for job claim, refinement reservation and reconciliation.
6. Run the controlled Stripe sandbox duplicate-webhook and paid-export proofs; only then consider enabling paid flags.
7. Decide and implement the lint policy, fixing the two genuine items (`@ts-ignore`, `prefer-const`) (I3).
8. Optionally pin `search_path` on `assistant_edit_payload_path` in the next migration batch (I5).
