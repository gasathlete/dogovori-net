# Security hardening — 28.09.2026

Base: `main` 3a15d746e2c2a73a11b6730a7b6e8c54a6b978df (last published 2cf897f7).
The changes below are in the working tree on top of that base. The platform
records them as the next commit; root takes the final SHA from that commit/CI.
**Not published. The database patch is prepared but NOT applied.**

This covers the surfaces audited this pass. It does not claim every possible
vulnerability is gone.

## 1. Confirmed findings (by priority)

| # | Sev | Finding (reproduced against real production policies/grants) | Fix |
|---|-----|------|-----|
| S1 | Critical | `quota_session_charges` / `corrections_batch_charges` had `INSERT own` policies. `consume_quota_session` and `consume_corrections_batch` treat an existing row as "already charged", so a signed-in user could insert a row and then download or correct documents **for free**. | DB patch: drop the policies and revoke client INSERT/UPDATE/DELETE. Only the SECURITY DEFINER charge functions write them. Users can still read their own rows. |
| S2 | High | The envelope owner could UPDATE `signing_request_signers` (set `status='signed'`, signature, hash) **Correction (root, 18:08 UTC):** production `otp_code_hash` SELECT for authenticated was already FALSE before this patch; no OTP-hash read leak was demonstrated. The confirmed exploit was the writable signer status/signature/evidence columns, which let the owner mark a counterparty as signed. The owner could also set envelope `status='completed'` or edit `document_snapshot`. | DB patch: signer rows are server-only for writes. Column-level SELECT leaves out `otp_code_hash`, `otp_expires_at`, `otp_attempts`, `signer_ip_hash`. Envelope UPDATE is limited to `status/cancelled_at/updated_at`, and a trigger allows only open → `cancelled`. Client: `SigningPane.tsx` no longer uses `select("*")`. |
| S3 | High | `teams_update_admin` allowed every column: `seat_count`, `status`, `current_period_end`, `stripe_*`, `owner_id`, `environment`. That is a seat/plan bypass. `team_members_admin_manage` (ALL) let an admin insert any user or promote a member to owner. | DB patch: column-level UPDATE for branding/company/SSO fields only. No client INSERT/UPDATE on `team_members` (invite/accept/transfer already go through service-role functions). Admins can still remove members. |
| S4 | Medium | `profiles_update_own` covered `assistant_messages_used` / `assistant_quota_reset_at`, so users could reset their own assistant quota. | DB patch: column-level UPDATE/INSERT for user-editable fields only. |
| S5 | Medium | `user_consents_update_own` let users rewrite consent evidence (`granted_at`, `document_version`). | DB patch: consents are append-only for clients. Withdrawal is already a new row. |
| S6 | Medium | `is_staff(uuid)` could be called by anyone, including anon, for any UUID, so staff accounts could be enumerated. | DB patch: it answers only for `auth.uid()` or the service role and always returns a boolean. All RLS and DB callers pass `auth.uid()` (checked in `pg_policies`/`pg_proc`). Edge callers use their own ID or the service role. |
| S7 | Medium | Anon could EXECUTE SECURITY DEFINER maintenance/oracle functions: `cleanup_anonymous_drafts`, `purge_old_funnel_events`, `verify_cron_secret`, `free_ops_cap(uuid)`, `can_access_saved_document(uuid,uuid)`, retired `get_first100/90_remaining`, and trigger functions. Guarded admin/staff RPCs could also be called by anon. `assistant_edit_payload_path` had a mutable search_path. | DB patch: service-role only for maintenance/oracle/trigger functions. Signed-in only for admin/self RPCs (they check inside). search_path is pinned. |
| S8 | Low (scanner `RLS_EXPOSURE`, error level) | `legal_documents` `USING (true)`. The data is official BG/EU legislation text (21 rows: Constitution, ЗЗД, …), which is public by nature, but inactive sources were exposed too. `legal_versions` `USING (true)` showed unpublished/future policy versions. | DB patch: public read only for documents of **active** sources and for **published** versions (`published_at <= now()`). Staff keep full read. Public browsing is unchanged. |
| D1 | High | `pdfjs-dist` 5.7.284: arbitrary JS execution when a malicious PDF is opened. Users upload PDFs. | Upgraded to 6.3.289. `getDocument` now uses `isEvalSupported:false, enableXfa:false` in `extractContractText.ts` and `productExtraction.ts`. |
| D2 | High/Mod | Transitive: `react-router` open redirects, `ws`, `nanoid`, `lodash`, `dompurify`, `fflate`, `prismjs`, `glob`, `minimatch`, `brace-expansion`. | `react-router-dom` ^6.30.6 plus scoped `overrides` in `package.json`. `package-lock.json` and `bun.lockb` regenerated. |

Checked and not changed (no confirmed bypass found):
- Webhooks: Stripe uses `verifyWebhook` and is fail-closed on env. Email events use signed `createEmailWebhookHandler`.
- Cron: every endpoint uses the shared exact service-token / cron-secret guards.
- `verify_jwt=false` public functions are token-bound by design (shared doc, signing, unsubscribe, invitation info) or already gated from earlier passes.
- Redirects: `safeRoute.isSafeRoute` rejects `//`, `/\`, control characters, and results that leave the origin.
- Workflows: all have `permissions: contents: read`. No `pull_request_target`.
- Production build has `sourcemap: false`.

## 2. Tests

- `src/test/securityHardening20260928.pglite.test.ts`: 10 behavioural tests on real PostgreSQL (PGlite) with production-shaped policies. They reproduce S1/S2/S6 **before** the patch and check the fixed state for unauthenticated, wrong-owner and correct-owner cases, the service role, and idempotency. S1–S8 all pass.
- App: 151 files, 1977 passed, 4 skipped, 0 failed (after the patch below). `tsgo` typecheck is clean.
- `leadMagnetPdf.test.ts`: pdf.js v6 moved `destroy()` to the loading task, so the test now calls `task.destroy()`. Assertions are unchanged.
- Edge/server: `deno test -A --no-check supabase/functions` run **from the repo root**: 1309 passed, 0 failed.
- **The previous "10 non-CI server failures" are stale invocation, not bypasses.** Those 10 tests (`cron-auth`, `dry-run`, `internal-cron-credential`, `legal-monitor-auth`, `service-token`, `payments-webhook/env`) read source files with repo-root-relative paths. They fail only when `deno test` is started inside `supabase/functions/`. From the root, as CI runs them, all 37 pass. No assertion was weakened.

## 3. Dependency advisories

Before (`package-lock.json`, production scan): 21 advisories. High: `@supabase/supabase-js`→ws, `docx`→nanoid ×3, `react-router-dom`→@remix-run/router XSS/open redirect, `recharts`→lodash. Moderate: jspdf→dompurify ×6, fflate; react-router ×5; lodash ×2.
After the lockfile was regenerated, it also surfaced packages the stale lock hid, including pdfjs-dist.

Remaining after this pass (11, all reviewed):
- `@react-email/components` → brace-expansion / minimatch 3.x ReDoS. Build/email-render time only, no user-controlled globs. Forcing across majors would break the email toolchain.
- `@lovable.dev/mcp-js` → ajv `$data` ReDoS and esbuild dev-server advisory. Dev/manifest tooling, not in the browser bundle.
- `react-router-dom` 6.30.6 → two advisories fixed only in v7 (SSR hydration: not applicable, no SSR; backslash open redirect: mitigated because every redirect goes through `isSafeRoute`). A v7 migration is a separate task.
- `deno.lock`: Edge functions pin `esm.sh/@supabase/supabase-js@2.45.0` in some functions. The Deno side has no advisory scanner here. Not changed.

## 4. Intentional public surfaces (unchanged)

Legislation texts/chunks/sources (active only after the patch), published legal versions, `template_search_index`, `template_download_counts` (aggregate counters), public `partner-logos` / `user-articles` buckets (public images), the aggregate registered-user counter, top articles, post ratings, template search, web-vitals aggregate, waitlist and lead-magnet sign-up RPCs (explicit consent, 90-day retention unchanged), anonymous feedback and funnel inserts (length-checked).

## 5. Still required from the owner

1. Review and apply `docs/migrations/security_hardening_2026_09_28.sql` in one transaction. It is independent of pending 0044–0048 and product activation, and it deletes no data.
2. Verify:
   ```sql
   select has_table_privilege('authenticated','public.quota_session_charges','INSERT');        -- f
   select has_column_privilege('authenticated','public.signing_request_signers','otp_code_hash','SELECT'); -- f
   select has_column_privilege('authenticated','public.teams','seat_count','UPDATE');           -- f
   select has_column_privilege('authenticated','public.profiles','assistant_messages_used','UPDATE'); -- f
   select has_function_privilege('anon','public.cleanup_anonymous_drafts()','EXECUTE');         -- f
   select policyname from pg_policies where tablename in ('legal_documents','legal_versions');
   ```
   Then as a normal user: rename a profile, save team branding, cancel an envelope, open the signing panel, download a template (it should be charged once and free on the same-tab repeat).
3. Publish the frontend (it contains the SigningPane column fix and the dependency upgrades). The frontend is compatible with both the pre-patch and post-patch database.
4. Rollback (per section, if needed): recreate the dropped policies from `pg_policies` output taken before applying; `GRANT UPDATE ON public.teams|profiles|signing_requests TO authenticated`; `GRANT SELECT ON public.signing_request_signers TO authenticated`; `DROP TRIGGER trg_signing_requests_client_update_guard`; restore the previous `is_staff` body (`select exists(... user_id=_user_id ...)`); re-GRANT function EXECUTE to anon. Take a `pg_policies`/`\dp` snapshot before applying.
5. The scanner finding for `legal_documents` stays **active** until the patch is applied. Then rescan and mark it fixed.

## 6. Honest residual limits

- The DB patch is tested on PGlite with production-shaped copies of the affected policies, not on the live database.
- ~~CSP unsafe-eval~~ removed in the follow-through (see below). `'unsafe-inline'` for scripts remains (inline boot/consent shell).
- Signing OTP hashing stays unsalted sha256 of a 6-digit code on the server side. After S2 it is no longer readable by clients, but moving to an HMAC with a server secret is recommended.
- The earlier pending privacy gates (0044–0048: storage/saved-document/document_versions/growth_snapshot) are still unapplied. `saved_documents`/`uploaded_contracts` owner ALL policies stay as they were.
- 72 "signed-in can execute SECURITY DEFINER" linter items remain. **Correction:** the earlier statement that each of them checks `auth.uid()` was unsupported and was contradicted by the independently found RPCs (charge_corrections_wave, consume_assistant_message, _roll_feature_counters, rate_limit_check, loyalty). They have NOT all been read line by line; no blanket "all safe" claim is made.
- Leaked-password protection, MFA and other auth settings were not changed.

---

## Addendum — owner-verified findings (28.09.2026, evening)

Scope: the nine findings submitted by the owner. All DB statements are appended to
the SAME staged file `docs/migrations/security_hardening_2026_09_28.sql`
(one transaction, idempotent, NOT applied by the agent). Live state was re-read
during this pass; note that EXECUTE on several functions changed while the audit
ran (someone already applied part of it) — the patch is idempotent either way.

| # | Finding | Live state at audit | Fix | Where |
|---|---|---|---|---|
| 1 | growth_snapshot current_user guard | prosrc md5 already = reviewed 0048 body; anon revoked, authenticated kept | S9: 0048 body byte-for-byte + grants, only this fix folded in | SQL S9 |
| 2 | charge_corrections_wave / consume_assistant_message / _roll_feature_counters take arbitrary user ids | authenticated EXECUTE was true at first read, false minutes later | S10: service-role only (+ consume_team_quota, credit_topup_ops, assemble_prompt_content, cleanup/purge). No browser/edge caller (grep); internal definer callers unaffected | SQL S10 |
| 3 | Loyalty trusted browser `_total_ops` | confirmed | S11: count from `download_quota.total_used` / `team_usage.lifetime_ops`; membership kept; signatures unchanged so DashboardTab/Team callers keep working | SQL S11 |
| 4 | shared_links forgery | live INSERT/UPDATE WITH CHECK already bind target ownership; table-wide column grants let owner forge `signed_at`, `signed_signature`, `signer_name`, `signed_pdf_path`, QES, token | S12: client INSERT removed (links created by create-share-link, service role); UPDATE only `owner_signed_at/owner_signature/owner_signer_name/revoked_at`; trigger makes owner signature and revocation one-way. Edge: get-/sign-shared-document now require `target.user_id = link.owner_id` and owner-folder storage paths before any signed URL/download; counterparty signing is atomic (`signed_at IS NULL AND revoked_at IS NULL`, 409 otherwise) | SQL S12, `_shared/share-target.ts`, both functions |
| 4b | uploaded_contracts.storage_path browser-mutable | preflight: 0 rows outside owner folder | S13: CHECK owner-folder prefix, no `..` (NOT VALID; run VALIDATE after preflight) + edge path check above | SQL S13 |
| 5 | profiles counters client-writable | confirmed (table-wide UPDATE) | S4 column grants (already in file) | SQL S4 |
| 6 | cleanup/purge anon; assemble_prompt_content; full definer audit | confirmed at first read | S7+S10. Audit: every definer callable by anon/authenticated without auth.uid() was listed; remaining are intentional public (counters, search, waitlist, lead magnet, web vitals, ratings, top articles) or RLS helpers (is_staff/has_role/is_team_*; is_staff self-only per S6); match_legal_chunks reads public legislation only | SQL S7/S10 |
| 7 | Public buckets without size/type limits | partner-logos, user-articles public, no limits; user-contracts private, no limits | Client now accepts PNG/JPEG/WebP only (no SVG). Staged bucket settings below | frontend + settings |
| 8 | fetch-legal-source redirect SSRF; CORS *.lovable.* | confirmed | `_shared/safe-fetch.ts`: manual redirects, each hop re-checked against allowlist, no credentials/odd ports, 3 hops, 20 s timeout, 8 MB cap. CORS: only this project's preview/published hosts | code |
| 9 | signer-action QES upload before OTP; sign path OTP not attempt-limited | confirmed: `sign` compared OTP without counting attempts → unlimited guessing of a 6-digit code | OTP check (expiry, 5-attempt lock, increment on failure) moved BEFORE any storage work; signing update atomic on `otp_code_hash` + `status <> 'signed'`, uploaded QES removed on race loss | code |

### Staged storage settings (apply with the storage settings tool, not SQL)
- partner-logos: file_size_limit 2MB, allowed_mime_types image/png,image/jpeg,image/webp (live objects: 3 png ≤2.02 MB — one PNG is 2,022,657 B, set 2.5MB if it must stay re-uploadable; 2 jpeg).
- user-articles: 5MB, image/png,image/jpeg,image/webp (live: 1 jpeg 1.36 MB).
- user-contracts: 10MB (matches client MAX_FILE_BYTES; live max 9.24 MB), application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document.
- qes-signatures: server-only writes; set 16MB, keep private.
- Draft/unapproved media privacy: NOT fixed. Buckets stay public so approved logos/images keep their existing public URLs; an unapproved file is reachable by anyone who knows its exact URL (uid + timestamp path, not listable). Proper fix = private bucket + signed URLs on approval (product change, needs owner decision).

### Tests (added this pass)
- `src/test/securityHardening20260928.pglite.test.ts`: 15/15 (5 new: S9 reproduce+fix, S10, S11 reproduce+fix incl. anon/non-member, S12 reproduce+fix incl. wrong owner/one-way/service role, S13).
- `supabase/functions/_shared/security-addendum.test.ts`: 4/4 (owner path/target, redirect-to-metadata IP blocked, loop/oversize/credentials, CORS foreign *.lovable.app refused).
- No real email, real signing or live-user calls were made.

### Rollback (addendum)
S9: re-grant as before (body identical to live). S10: `GRANT EXECUTE ... TO authenticated` per function. S11: restore previous bodies from `pg_get_functiondef` snapshot. S12: `DROP TRIGGER trg_shared_links_client_update_guard`, `GRANT INSERT, UPDATE ON public.shared_links TO authenticated`, recreate `shared_links_insert_own` from the pg_policies snapshot. S13: `ALTER TABLE public.uploaded_contracts DROP CONSTRAINT uploaded_contracts_storage_path_owner`. Code: revert the listed files.

### Residual limits (addendum)
- `send_otp` resets `otp_attempts`; each new code gets 5 tries, rate limited only by email delivery. Recommend a per-signer resend cap and HMAC OTP hashing.
- Loyalty relies on `total_used`/`lifetime_ops` being maintained only by definer/service code (true for current grants after S4/S10).
- Pre-existing links signed or edited before the patch are not rewritten or re-verified.
- Edge function changes take effect only after deployment; the DB patch only after the owner applies it.


---

## Follow-through — 28.09.2026, 18:26–20:05 UTC

Status legend: **LIVE** = applied/deployed in production by this pass or by root; **STAGED** = in `docs/migrations/security_hardening_2026_09_28.sql`, awaiting root review; **SOURCE** = code only.

### Live state per section (individually)
| Section | Status | Notes |
|---|---|---|
| S1–S8 | LIVE (root, 18:13) | legal_documents scanner finding closed after verifying `legal_documents_public_read_active` + staff read in pg_policy |
| S9 growth_snapshot | LIVE (root) | exact 0048 body |
| S10 eight internal RPCs | LIVE (root) | `_roll_feature_counters`, `charge_corrections_wave`, `consume_assistant_message`, `rate_limit_check`, `cleanup_anonymous_drafts`, `purge_old_funnel_events`, `assemble_prompt_content`, `check_compliance_reminders` |
| S10 additions `consume_team_quota(uuid)`, `credit_topup_ops(...)` | STAGED | |
| S11 loyalty | LIVE (root) | |
| S12 shared_links | STAGED — **rewritten** | No `REVOKE INSERT/UPDATE`, no `DROP POLICY shared_links_insert_own` (automatic-review boundary kept; the test asserts both are absent). BEFORE INSERT/UPDATE trigger for `authenticated`/`anon` only: INSERT must leave server evidence columns empty; UPDATE may change only `owner_signed_at/owner_signature/owner_signer_name` (once) and `revoked_at` (once). Ownership WITH CHECK is re-stated byte-equivalent to the live hotfix (no-op). Service role unaffected. |
| S13 uploaded_contracts path CHECK | STAGED (NOT VALID) | live preflight: 57 rows with a path, 0 outside the owner folder |
| S15 saved_documents / uploaded_contracts owner+path forgery | STAGED — **new** | Trigger: INSERT user_id = auth.uid(); UPDATE cannot change user_id; only the row owner may change `storage_path` / `payload.storage_path`; pointer must be `<owner-uuid>/…`, no `..`, `//`, leading `/`, control chars or backslash. Team metadata edits keep working. Live preflight: uploaded 0 bad / 57, saved_documents 0 rows with `payload.storage_path`. |
| Private media staging policies | LIVE (this pass, migration `0022_private_media_staging_policies`) | additive storage.objects INSERT (own folder, png/jpg/jpeg/webp) + SELECT (owner or staff) on the two new private buckets; no anon policy |

Behavioral proof (PGlite, `src/test/documentOwnerForgery.pglite.test.ts`, 5 tests): before patch a team member inserts a row with a teammate's user_id + private path, repoints a teammate's storage_path and rewrites user_id (all succeed); after patch all refused; own creates, own pointer change, team title edits and service-role insert succeed; S12 keeps client create / owner-sign once / revoke once, refuses foreign target, forged `signed_at/signer_name` on insert and six server-only column updates; service role retains full capability; S12+S15 idempotent.

### Storage (applied with the storage tool; verified from `storage.buckets`)
| Bucket | public | file_size_limit (bytes) | MIME list |
|---|---|---|---|
| partner-logos | true | 2 621 440 (2.5 MiB; largest existing object 2 022 657 B) | not settable with the available tool → enforced in client + staging policy extension check |
| partner-logos-pending (new) | **false** | 3 145 728 | extension check in policy |
| user-articles | true | 5 242 880 | — |
| user-articles-pending (new) | **false** | 5 242 880 | extension check in policy |
| user-contracts | false | 10 485 760 | — (client validates PDF/DOCX) |
| qes-signatures | false | 16 777 216 | server validates extension (`pdf,p7s,p7m,asice,asics,sce,scs,xml`) |

Unapproved-media privacy: new partner logos and article images go to the private staging buckets; the row stores `pending-media:<bucket>/<owner>/<uuid>.<ext>`. `approve-media` (staff-only, JWT + `is_staff`) copies the object to the public bucket, writes the stable public URL and sets the status in one server step; the staging object is kept (no deletion). `submit-user-article` now accepts only the caller's own staging marker. Admin panels preview staging files via 5-minute signed URLs.
Verification: all 5 approved assets (4 logos, 1 article image) return 200 with the expected size; anonymous `…/object/public/partner-logos-pending/…` → 400, anonymous list → `[]`. Existing data: 0 pending, 0 rejected partners/articles (nothing to migrate). **Residual:** 1 object in `partner-logos` is not referenced by an approved partner and is still reachable by its exact public URL (bucket is public, so the approved-only read policy does not apply to the public endpoint). Not deleted per instruction; staff can remove it or move it to staging.

### OTP / signer-action (DEPLOYED)
- Versioned `v2:` HMAC-SHA256 with the new server secret `SIGNING_OTP_HMAC_SECRET` (generated server-side, never printed). Missing/short secret → `send_otp` 503 `otp_unavailable` and v2 verification throws (fail closed).
- Legacy unsalted v1 hashes still verify until their 10-minute expiry (backward compatibility), then disappear.
- Constant-time comparison; code must be exactly 6 digits.
- Attempt consumed atomically (compare-and-swap on `otp_attempts` + `otp_code_hash`) **before** comparison → concurrent/replayed guesses cannot exceed 5 per code; after lock even the right code is refused.
- Resend: 60 s cooldown, max 5 sends/hour, CAS on `otp_expires_at` so only one concurrent resend wins; 15 failed attempts in 24 h lock sending and verifying (resend no longer yields unlimited fresh attempts).
- `SIGNING_DEBUG_OTP` and `debug_code` removed from the function and from `Sign.tsx`.
- Body read with a streaming cap (22 MiB) before JSON parse; QES base64 length capped before `atob`.
- Tests: `supabase/functions/_shared/signing-otp.test.ts` (6) — 40 concurrent wrong guesses → exactly 5 counted, rest locked; valid path; expired/missing; legacy v1; oversized body by header and by stream. Live smoke (no real signer): 21 MB junk → 400 `invalid_input`; 23.5 MB → 502 from the platform before the function; short token → 400; unknown token → 404; forged `evil--<project-id>.lovable.app` origin → canonical origin. No email/signature was sent.

### CSP
`'unsafe-eval'` removed from `index.html` and `public/_headers`. Evidence: in the build only `docx`'s setImmediate polyfill (string-callback path, unused) and bluebird's promisify codegen (disabled in browsers) contain `new Function`; pdf.js runs with `isEvalSupported:false`. Standard gtag.js does not need eval (only GTM Custom-JS variables would). Playwright on the production build and the dev server over `/`, `/catalog`, `/plans`, `/blog`, `/paketi` with consent accepted: gtag loads, **0 CSP violations**. This found a pre-existing block of `https://www.google.com/g/collect` (GA4 beacons) → added to `connect-src`. Stripe checkout is locked in prelaunch, so Stripe.js was not exercised live. `'unsafe-inline'` remains.

### Dependencies
- `react-router`/`react-router-dom` 6.30.6 and `@remix-run/router` 1.23.4 installed — the fixed release for GHSA-jjmj-jmhj-qwj2. The earlier "fix requires 7.x" statement was wrong.
- minimatch: 3.1.2 (root, eslint chain) and 9.0.5 (glob, typescript-estree, editorconfig); patched backports exist on both lines. **Not changed in this pass:** this sandbox copy does not contain root's CI head 4a4e2d41 and still has `bun.lockb`, nested overrides and `bun-version: latest`, so a lockfile edit here would conflict with root's lock state. The upgrade should be done on 4a4e2d41 (scoped overrides, text `bun.lock` via Bun 1.4.2, frozen install on a clean checkout).

### Edge deployment (all reported "Successfully deployed")
Changed: `get-shared-document`, `sign-shared-document`, `signer-action`, `fetch-legal-source`, `approve-media` (new), `submit-user-article`. Consumers of `_shared/cors.ts` / security helpers (redeployed from current source): admin-generate-article, admin-redact-payload, analyze-contract, apply-corrections, assistant-chat, assistant-chat-anon, assistant-edit, build-custom-contract, correct-uploaded, create-checkout, create-product-checkout, create-share-link, create-signing-request, create-strict-unlock-checkout, create-team, customer-portal, delete-account, download-blank, download-document, draft-claim, draft-sync, export-my-data, fulfill-product, generate-contract, generate-job, generate-linked-document, get-signing-request, growth-brief, gsc-impressions-trend, gsc-index-status, ingest-legal-source, legal-source-monitor, negotiation-strategy, ocr-contract, payments-price-audit, product-result-state, qa-bot-runner, refine-contract, refine-product, review-document, simulation-regression, simulation-run, team-accept-invite, team-billing-data, team-cancel-invitation, team-invitation-info, team-invite, team-manager-contact, team-members, team-remove-member, team-resend-invitation, team-update-seats, warm-blank-cache (59 total). Product/AI/checkout gates remain default-OFF secrets; nothing was activated.

### Root: exact verify SQL after applying S10-additions / S12 / S13 / S15
```sql
select has_function_privilege('authenticated','public.consume_team_quota(uuid)','execute'); -- f
select tgname from pg_trigger where tgrelid='public.shared_links'::regclass and not tgisinternal; -- trg_shared_links_client_guard
select has_table_privilege('authenticated','public.shared_links','INSERT'), has_table_privilege('authenticated','public.shared_links','UPDATE'); -- t,t (retained)
select polname from pg_policy where polrelid='public.shared_links'::regclass; -- includes shared_links_insert_own
select tgname from pg_trigger where tgname in ('trg_uploaded_contracts_client_guard','trg_saved_documents_client_guard'); -- 2 rows
select conname, convalidated from pg_constraint where conname='uploaded_contracts_storage_path_owner'; -- f until VALIDATE
```

### Tests this pass
vitest 153 files: 1992 passed + the fixed `aiJsonParsers` regression (approve-media now uses the bounded reader) / 4 skipped; Deno 1322 + 7 new passed; `deno check` of changed functions OK. `tsc -p tsconfig.app.json` reports one error in `src/lib/templateDraftResolver.ts:97` that this pass did not touch (likely from the shared-main SEO work); left for root to reconcile on 4a4e2d41.

### Remaining admin-access limits
- Auth/MFA/leaked-password settings: no admin API available here; unchanged.
- MIME allow-lists on buckets: the available storage tool sets only size; MIME is enforced in client code, staging-policy extension checks and server functions.
- Live role-switch negative test by root returned API499 `request_cancelled` — not counted as passed.
