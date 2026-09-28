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
| S2 | High | The envelope owner could UPDATE `signing_request_signers` (set `status='signed'`, signature, hash) and READ `otp_code_hash` = unsalted sha256(6-digit code \| id), which can be brute-forced offline in milliseconds. Combined with the owner-visible sign link, the owner could **sign as the counterparty**. The owner could also set envelope `status='completed'` or edit `document_snapshot`. | DB patch: signer rows are server-only for writes. Column-level SELECT leaves out `otp_code_hash`, `otp_expires_at`, `otp_attempts`, `signer_ip_hash`. Envelope UPDATE is limited to `status/cancelled_at/updated_at`, and a trigger allows only open → `cancelled`. Client: `SigningPane.tsx` no longer uses `select("*")`. |
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
- CSP still has `'unsafe-inline'`/`'unsafe-eval'` for scripts. Removing them needs a separate compatibility pass (Stripe, the Lovable tag, inline shell).
- Signing OTP hashing stays unsalted sha256 of a 6-digit code on the server side. After S2 it is no longer readable by clients, but moving to an HMAC with a server secret is recommended.
- The earlier pending privacy gates (0044–0048: storage/saved-document/document_versions/growth_snapshot) are still unapplied. `saved_documents`/`uploaded_contracts` owner ALL policies stay as they were.
- 72 "signed-in can execute SECURITY DEFINER" linter items remain. Each one checked checks `auth.uid()` inside, but not every one of the ~150 functions was read line by line.
- Leaked-password protection, MFA and other auth settings were not changed.

## Addendum 2 — S9–S14, CI lockfile, live-hotfix reconciliation (28.09.2026)

Status: source and staged SQL only. The DB patch is NOT applied by this change; root reviews and applies.

### CI
- Cause: Bun 1.3.3 (sandbox) and 1.4.2 (CI) serialise nested overrides differently → `lockfile had changes, but lockfile is frozen`.
- Fix: flattened overrides, text `bun.lock` generated by Bun 1.4.2 against registry.npmjs.org, `bun.lockb` removed, `bun-version: "1.4.2"` pinned in all six workflows, `--frozen-lockfile` kept. Frozen install proved on a clean checkout with both Bun versions.

### Preserved live state (applied by root, not changed here)
- growth_snapshot = exact 0048 body + grants (S9 re-states it idempotently).
- shared_links INSERT/UPDATE ownership policies and existing authenticated grants.
- Service-only EXECUTE on the eight RPCs (S10 re-states exactly those eight; no client grant restored).

### Staged in docs/migrations/security_hardening_2026_09_28.sql
- S11 award_user_loyalty / award_team_loyalty: browser count ignored; tiers from download_quota.total_used / team_usage.lifetime_ops; team membership required.
- S12 shared_links: **no ACL revocation, no policy drop** (the rejected blanket change is not reintroduced). A BEFORE INSERT/UPDATE trigger applies only to client roles: counterparty-signature, signed PDF, QES, viewed, IP, token, password, target and identity columns are server-only; owner signature set once; revocation one-way; expires_at editable. service_role/postgres pass unchanged.
- S13 uploaded_contracts.storage_path CHECK (owner folder, no `..`), NOT VALID; live preflight 0 rows; VALIDATE statement included.
- S14 storage `user_contracts_team_select`: object folder must equal the record owner, so a team record cannot point at another user's file.

### Tests (actual results)
- PGlite: 17/17 — each S9, S11, S12, S14 reproduced on the unpatched fixture and closed after the patch; S12 proves legitimate create, owner-sign, revoke, and service-role signing/creation still work, and that grants stay unchanged.
- Deno: security-addendum 6/6; all server tests 1315 passed.
- App: 152 files, 1990 passed, 4 skipped; typecheck clean.
- Not run: real email/sign/charge; root's live role-switch negative test ended API499 request_cancelled and is **not** reported as passed.

### DB verify SQL (after apply)
```sql
SELECT p::regprocedure, has_function_privilege('anon',p,'EXECUTE') anon, has_function_privilege('authenticated',p,'EXECUTE') auth
  FROM unnest(ARRAY['public.charge_corrections_wave(uuid,uuid,integer)','public.rate_limit_check(text,integer,integer)',
   'public.consume_assistant_message(uuid,integer)','public._roll_feature_counters(uuid)','public.cleanup_anonymous_drafts()',
   'public.purge_old_funnel_events()','public.assemble_prompt_content(uuid)','public.check_compliance_reminders()'
  ]::regprocedure[]) p;                                  -- all false
SELECT has_table_privilege('authenticated','public.shared_links','INSERT'),
       has_table_privilege('authenticated','public.shared_links','UPDATE');   -- true, true (unchanged)
SELECT tgname FROM pg_trigger WHERE tgrelid='public.shared_links'::regclass AND tgname='trg_shared_links_client_write_guard';
SELECT md5(prosrc) FROM pg_proc WHERE proname='growth_snapshot';            -- unchanged vs 0048
```
Rollback: `DROP TRIGGER trg_shared_links_client_write_guard ON public.shared_links;` `ALTER TABLE public.uploaded_contracts DROP CONSTRAINT uploaded_contracts_storage_path_owner;` restore the previous `user_contracts_team_select` definition from pg_policies captured before apply; loyalty functions from the prior migration.

### Edge functions to deploy
cors (_shared), share-target, safe-fetch, get-shared-document, sign-shared-document, fetch-legal-source, signer-action (OTP before QES upload, atomic attempts/signing, 60 s resend cooldown, 5 sends/hour).

### Dependencies
Audit JSON in docs/operations/security-audit-2026-09-28/. 21 → 9 advisories; remaining are build/dev-time (vite, vitest, drizzle-kit, esbuild, rollup, postcss…) except react-router-dom (moderate, runtime) whose only fix is major 7.x — left active, not dismissed.

### Still open
- CSP `unsafe-eval`/`unsafe-inline` kept: Google Tag Manager and the preview tooling need them; removal needs a nonce/hash rollout tested on the live site.
- OTP hash is unsalted sha256 → move to HMAC with a server secret.
- Bucket size/MIME limits and private storage for unapproved images — owner decision.
- Auth/MFA settings that need the unavailable admin API — blocked.
- ~150 definer functions not read line-by-line; 0044–0047 unapplied.
