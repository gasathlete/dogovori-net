# Security hardening — 28 September 2026

**Status: production database and reviewed frontend/Edge security fixes are live; additional hardening and verification remain open.**

Owner authorization: “Оправете всички възможни секюрити проблеми.” No additional approval is required for the already requested security fixes. Purchases/new AI activation remain gated. No real signing, email, payment or customer-document test was performed; eSpravki is separate.

## Current checkpoint — 28 September 2026, 21:42 UTC

This checkpoint supersedes the historical deployment-blocker and unfinished-OTP/pending-media statements below. The earlier evidence is retained for traceability.

- The synchronization blocker was resolved. PR #8 merged as `ae8e0a54d29e32cd5c624cec5f068e918f405cce`; deployment `a26860c8-3f03-498c-8b33-60ed631b1fcc` was publicly verified with `index-DJHVHHGu.js` and no CSP `unsafe-eval`.
- Later PR #10 was merged as `9aebd1498dc37e30842f90530a5d147f7a4d3153`. Its recorded public release is `d7858f79-1d30-4e5f-9ac9-fcc8dee59fe3`, verified by the SEO release task at 21:20–21:23 UTC. See `seo-indexability-2026-09-28.md`. Do not confuse the older security deployment with the latest published release.
- Latest recorded complete CI: 2007 app tests passed, 4 skipped; 1010 shared Edge tests passed. Runs 36484238220 (build) and 36484238264 (tests). These are previous exact-head release results, not new tests of subsequent work.
- HMAC OTP / atomic attempts / resend and body limits / no debug OTP, owner-bound shared signing, exact-origin CORS and private pending-media approval flow have been implemented and deployed. See the 20:15 follow-through below for Edge function evidence.
- Live pending buckets now enforce PNG/JPEG/WebP MIME types and destination-compatible sizes: partner-logos-pending 2621440 bytes, user-articles-pending 5242880 bytes. Aggregate preflight found both empty. Applied SQL is recorded in commit `6a1eb5e9ab8af685050bbfd81a14f8541cd075e8`.
- Live team-assets now enforces 2097152 bytes; home-testimonials enforces 5242880 bytes, matching existing frontend limits. Preflight: one team PNG at 650681 bytes and no testimonial objects. No file or customer row was rewritten/deleted. SQL: `docs/migrations/security_media_size_caps_2026_09_28.sql`, commit `a9b23df39a28be379bbfc5f8d19cd84e5ec4907b`.
- Auth UI observed: HIBP on, auto-confirm email off, secure email change on, anonymous users off, email/Google on; OTP length 8 and expiry 3600 seconds. Saving minimum password length 8 returned “Auth config updated”, but reopening the numeric field still displayed blank; persistence of that particular value is NOT independently verified.
- Re-authentication and current-password requirements remain off. ResetPassword.tsx currently calls updateUser({password}) without re-authentication/current-password UI; do not turn these requirements on blindly and break the flow.
- Redirect UI displayed production domains and project-specific preview hosts, plus the fixed lovable.app host. It reported 10 entries while exposing five text entries; the entire effective list is not verified.
- Deep scan started through the Security UI and is still running. Do not call it passed before results exist.
- The @lovable.dev/mcp-js Medium flag was identified by the scanner as GHSA-67mh-4wv8-2f99. Its nested locked esbuild is 0.27.7, outside that advisory's <=0.24.2 range; do not label this specific occurrence exploitable on that basis. A different real low advisory, GHSA-g7r4-m6w7-qqqr, affects 0.27.7 on Windows dev servers and is fixed in 0.28.1. The separate Drizzle old-esbuild advisory remains distinct. Compatible dependency remediation and validation are now in progress.

### Remaining release/security limitations

1. Actual HTTP CSP, anti-framing protection and Permissions-Policy remain absent in the hosting checks. HTML meta CSP does not supply frame-ancestors, and public/_headers is ignored. HSTS, nosniff and Referrer-Policy are present. No supported response-header control was found in the accessible hosting UI/tools; hosting/CDN administration or provider support is required. No DNS migration was attempted.
2. Review completed deep-scan findings and actual dependency remediation results. No “all vulnerabilities fixed” claim.
3. GitHub branch protection/code scanning and owner MFA enrollment/recovery remain unverified. The connected GitHub app lacks administration access.
4. Content decoding/malware quarantine, complete fail-closed coverage, restore drills and alert ownership are not verified. MIME/size caps are defense in depth, not content scanning.
5. Purchases/new AI gates remain closed. Existing approved legal text remains unchanged. No real emails, signatures or payments were used as tests.

---

## Historical evidence (superseded where the current checkpoint differs)

## Verified code and CI

Code commit: `38c8fb1e2636bd99a7ea816eb1e5b1c7d57c862b`.
- [Tests 36474681306](https://github.com/gasathlete/dogovori-net/actions/runs/36474681306): success. 154 app files; 1992 passed, 4 skipped. These include 17 security migration cases, the admin privacy aggregate regression and the document-identity regression. Edge CI: 1003 passed, 0 failed. Repeated subsets are not added to the totals.
- [Build & SEO 36474681202](https://github.com/gasathlete/dogovori-net/actions/runs/36474681202): success.
- [Security scan 36474681229](https://github.com/gasathlete/dogovori-net/actions/runs/36474681229): success; Gitleaks reported no leaks within its scanned revision range. This is not a guarantee about every secret or vulnerability. SARIF upload warned that repository code scanning is not enabled.
- Bun 1.4.2 is pinned in workflows; strict frozen installation passed. The text bun.lock, package-lock.json and package.json were committed together. The compatible dependency trio includes the testing-library DOM peer required by clean CI.
- Root integrated the reviewed Lovable security changes with existing main changes, preserving the exact-origin CORS fix and admin privacy work. Independent SEO PR #9 is not merged by this security change. Its green CI was not counted as security-main validation.

## Protections applied to the production database

All modifications were individually reviewed; existing records were not rewritten.

| Surface | Applied protection |
|---|---|
| Charge ledgers | Clients cannot insert false already-paid quota/correction records. Definer charging and own-row reads remain. |
| Signer evidence | Direct client writes to signer state/evidence removed; safe column reads retained. Owner cancellation is constrained to valid open-to-cancelled transitions. |
| Teams and profiles | Billing/seat/membership and assistant counters are server-controlled. Profile/company/branding edits retain their intended grants. |
| Consent evidence | Append-only client records; withdrawal remains a new record. |
| Internal RPCs | Eight confirmed internal quota/rate/cleanup/prompt/reminder helpers restricted to service role, plus reviewed S7 maintenance/oracle restrictions. |
| Staff metrics | growth_snapshot authorizes the JWT role/staff identity before any query. admin_privacy_kpis now checks authorization before evaluating scalar subqueries. Root confirmed its SELECT body otherwise unchanged. |
| Loyalty | Browser operation counts ignored; server-maintained user/team counters determine awards. Team membership check preserved. |
| Shared links | INSERT/UPDATE policies bind targets to their owner. A targeted trigger blocks counterparty signature/QES/PDF/identity forgery, preserves normal create/owner-sign/revoke, and makes revocation and existing owner signatures one-way. |
| Document/file ownership | Client inserts require the caller as owner; updates cannot replace user_id. Uploaded/saved storage paths must remain inside that owner's folder; traversal rejected. Valid team edits remain. Storage team reads also bind the file folder to the record owner. |
| Public legal metadata | Active-source legal documents and already-published legal versions are public; official legislation is not misclassified as private customer content. |

Migration sources:
- docs/migrations/security_hardening_2026_09_28.sql (S1–S14 applied in reviewed stages).
- docs/migrations/security_privacy_kpis_authz_2026_09_28.sql (applied).
- docs/migrations/security_document_identity_2026_09_28.sql (applied).
- Exact prior hotfixes and approval boundary: docs/operations/security-live-hotfixes-2026-09-28.md.

Root verified live privileges, trigger presence, policy expressions and the validated uploaded-path constraint. Before applying the path guards, aggregate preflight found 57 uploaded record paths, zero incompatible paths and zero saved-document payload storage paths. PGlite supplies isolated behavioral proof; root's earlier live role-switch DO probe returned API499 and is NOT counted as passed.

**Correction to the earlier report:** authenticated SELECT on otp_code_hash was already false before this work. The confirmed vulnerability was client-writable signer state/evidence; there is no verified before/after OTP hash read leak.

**Automatic-review boundary:** a blanket shared_links INSERT/UPDATE revocation was rejected as potentially disruptive and was never applied. The accepted alternative preserves creation grants and uses target ownership policies plus the tested column/state guard. Do not reintroduce the rejected revocation.

## Storage settings now live

| Bucket | Maximum bytes | Server MIME allowlist |
|---|---:|---|
| partner-logos | 2621440 | PNG, JPEG, WebP |
| user-articles | 5242880 | PNG, JPEG, WebP |
| user-contracts | 10485760 | PDF, DOCX |
| qes-signatures | 16777216 | Existing setting retained (server-controlled writes) |

Existing object sizes/types were checked in aggregate before MIME restrictions. Approved public URLs were not changed. Private partner-logos-pending and user-articles-pending buckets exist, but their end-to-end submission/moderation integration and existing unapproved-object migration are NOT verified complete. Update 20:15 UTC: submission and staff approval now use these private buckets (see Follow-through).

## Source fixes awaiting verified deployment

- Explicit safe signing-panel columns and patched PDF.js with eval/XFA disabled.
- Share Edge functions require target user_id = link.owner_id and owner-folder paths; atomic counterparty signing prevents replay races.
- Legal fetching checks every redirect, caps redirects/time/body size and refuses unsafe destinations.
- CORS permits exact project/production origins, not arbitrary Lovable subdomains or forged suffixes.
- signer-action: versioned HMAC OTP, atomic attempts/resend/signing, no debug code, bounded body — DEPLOYED (see Follow-through).

The configured Lovable project still reports code `d101677b23152509249fc3a8ee89492ea5bbc913`; its default file read cannot find the new document-identity migration even though GitHub main contains it. The earlier execution remains running and subsequent completion requests are accepted/queued without a verified final commit. Publishing that workspace could publish a different revision from the tested one. Root therefore did not deploy it.

Last independently verified public release remains `2cf897f7354c2f7ba0cc1468a3d4d6cb25282b4e`, deployment `3e6eb592-86a7-4bf7-91ff-3523914b1c7f`. No new frontend or Edge deployment is claimed.

## Remaining work / limitations

1. Recover Lovable execution/GitHub synchronization, verify the integrated code, deploy the changed Edge functions and all affected shared-helper consumers, then publish and check the actual public asset/headers and normal flows.
2. Finish OTP HMAC/version compatibility, remove production debug-code exposure, bound request bodies before decoding, and prove concurrent attempt/resend handling. Existing source still has residual signing weaknesses.
3. Complete private pending-media submission and approval publication, retaining approved assets.
4. Review/fix remaining dependency advisories against the final lockfiles. Earlier audit snapshots are retained under docs/operations/security-audit-2026-09-28/ but are not a fresh audit of this final dependency tree. React Router advisory GHSA-wrjc-x8rr-h8h6 / GHSA-337j-9hxr-rhxg and CSP unsafe-inline/unsafe-eval remain open until a tested fix is deployed.
5. Enable repository branch protection/code scanning and review leaked-password/MFA settings through authorized administrator capabilities. The connected GitHub app cannot administer those settings.
6. Unrelated pending 0044–0047 migrations and product/AI activation were not blindly applied. This pass is not an exhaustive line-by-line audit of all database functions.

Do not mark this release fully complete or claim 100% security while these items remain.


---

## Follow-through on root head 5a84c464 — 28.09.2026, 20:15 UTC

The workspace now contains root's integrated head (5a84c464: text bun.lock, Bun 1.4.2 in 6 workflows, admin_privacy_kpis guard + `privacyKpisAuthz.pglite.test.ts`, document-identity S15 applied live, exact-origin CORS). The earlier Lovable-only work (commits c375ac10…79054f8d) was not on this head; it was re-applied file by file only where root had not changed the file. `signer-action` took the hardened version (superset of root's resend/CAS change); `Sign.tsx` kept root's Bulgarian errors, removed the debug code display and added messages for the new error codes.

**What is live / deployed now**
| Item | State |
|---|---|
| OTP v2 HMAC (`SIGNING_OTP_HMAC_SECRET`), legacy v1 until expiry, constant-time compare, CAS attempts (5/code), resend 60 s / 5 per h, 15 failures per 24 h lock, no debug code, 22 MiB streaming body cap | DEPLOYED (`signer-action`) |
| Private pending media + staff `approve-media` promotion (copy to public bucket, stable URL, staging object kept) | DEPLOYED (`approve-media`, `submit-user-article`); storage policies LIVE (`docs/migrations/private_media_staging_2026_09_28.sql`, recorded in the live drizzle journal as 0022). Frontend (submit dialogs, admin previews) waits for root publish. |
| CSP without `'unsafe-eval'` (+ `https://www.google.com` in connect-src for GA4) | SOURCE — goes live with the frontend publish |
| Approved assets | 4 logos + 1 article image: HTTP 200 with the expected sizes; anonymous pending public URL 400, list `[]` |

Deployed this step: `sign-shared-document`, `signer-action`, `approve-media`, `submit-user-article` — all "Successfully deployed". The 59-function redeploy earlier this evening was done from the pre-sync workspace; the only root-head difference in function source was one line in `sign-shared-document`, now redeployed. Smoke checks (no real signer/email): unknown token 404, empty approve-media 400, empty sign-shared-document 400.

**Dependencies (exact advisories from the GitHub Advisory API; the npm audit endpoint is not available in this sandbox)**
- minimatch GHSA-3ppc-4f35-3m26, GHSA-7r86-cg39-jmmj, GHSA-23c5-xmqv-rm74: bun.lock had 3.1.2 (eslint chain) and 9.0.5 (typescript-estree). Fixed by the compatible dev upgrades `eslint ^9.39.5` and `typescript-eslint ^8.71.0` (no new overrides): bun.lock now 3.1.5 / 9.0.9 / 10.2.6, all at or above the patched versions. Build-time only (lint), not shipped to browsers.
- react-router / react-router-dom 6.30.6, @remix-run/router 1.23.4 — fixed release for GHSA-jjmj-jmhj-qwj2 (the earlier "needs 7.x" note was wrong).
- bun.lock generated with Bun 1.4.2 (lockfileVersion 3, nested overrides kept). `bun@1.4.2 install --frozen-lockfile` on a clean copy of package.json + bun.lock: 811 packages, OK. **Note:** the sandbox runs Bun 1.3.3 and can rewrite bun.lock to lockfileVersion 1 with flattened overrides on dev-server restart. Root should check that the committed bun.lock starts with `"lockfileVersion": 3` before merging.
- package-lock.json regenerated with `npm install --package-lock-only --legacy-peer-deps` (the `@lovable.dev/email-js` / `@react-email/render` peer conflict also exists on the unchanged head): minimatch 3.1.5 / 9.0.9 / 10.2.6, react-router 6.30.6.

**Tests (this workspace)**
- vitest: 154 files, 1992 passed, 4 skipped, 0 failed.
- Deno: 1330 passed, 0 failed. `security-addendum.test.ts` now requires signing to be conditional on the verified hash (`hashAtCheck`, re-read at verification time), placed after the QES upload, and no debug-OTP strings. This is a stricter check, not a weaker one.
- `vite build` OK; `deno check` of the changed functions OK.
- `tsc -p tsconfig.app.json`: 1 error at `src/lib/templateDraftResolver.ts:97`, a file this work did not touch (root CI typecheck reported green). Pre-existing `no-explicit-any` lint errors in `Sign.tsx` lines 20/30/234 are not from this change.

**Remaining limits (precise)**
- Bucket MIME lists: root set PNG/JPEG/WebP and PDF/DOCX on the public/contract buckets. The two pending buckets have size limits only; the insert policy allows only png/jpg/jpeg/webp extensions.
- 1 unreferenced object in public `partner-logos` stays reachable by its exact URL. Not deleted, as instructed.
- `'unsafe-inline'` scripts remain. Stripe.js was not exercised because purchases are locked.
- Branch protection, code scanning, leaked-password and MFA settings need GitHub/Auth admin access, which is not available here.
- Frontend not published. No real email, signature or payment.

## Dependency follow-through — esbuild (2026-09-28, 21:45 UTC request, base a9b23df/562f93ca)

Before (bun audit, public registry, bun.lock v3): 2 advisories — GHSA-67mh-4wv8-2f99 (moderate, esbuild <=0.24.2; copy 0.18.20 via drizzle-kit → @esbuild-kit/esm-loader → @esbuild-kit/core-utils) and GHSA-g7r4-m6w7-qqqr (low, esbuild >=0.27.3 <0.28.1; copy 0.27.7 via @lovable.dev/mcp-js 0.20.1).

Fix: narrow nested override `"@lovable.dev/mcp-js": { "esbuild": "^0.28.2" }`; all existing overrides kept. Resolved esbuild copies: root 0.25.12, mcp-js 0.28.2, tsx 0.28.2, @esbuild-kit/core-utils 0.18.20 (npm lock also lovable-tagger 0.25.0).

After: 1 advisory — GHSA-67mh-4wv8-2f99 (moderate), one copy only (0.18.20). GHSA-g7r4-m6w7-qqqr resolved. Each advisory counted once.

Drizzle chain (not fixed, blocker documented): drizzle-kit 0.31.11 (kept, not downgraded) still depends on the deprecated @esbuild-kit/core-utils, which pins esbuild ~0.18.20. A tried override `"@esbuild-kit/core-utils": { "esbuild": "^0.25.12" }` produced a bun.lock that Bun 1.4.2 `install --frozen-lockfile` rejects on a clean copy ("overrides changed since bun.lock was saved"), and npm ignored it in package-lock.json. That attempt was reverted. Exposure: dev tooling only (drizzle-kit loading its config); GHSA-67mh concerns esbuild's serve mode, which that path does not start; nothing is shipped to browsers. Proper fix needs an upstream drizzle-kit release without @esbuild-kit.

Verification: Bun 1.4.2 clean-copy frozen install (801 packages) OK; tsc -p tsconfig.app.json OK; vitest 156 files, 2007 passed, 4 skipped, 0 failed; vite build OK; security-shield 10/10; drizzle-kit check OK; @lovable.dev/mcp-js import OK. No database, email, signing or payment actions. Not published.
