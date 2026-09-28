# Security hardening — 28 September 2026

**Status: database protections are LIVE; reviewed code is in GitHub main; frontend and Edge deployment are blocked by Lovable synchronization/execution. This is not a claim that all vulnerabilities are eliminated.**

Owner authorization: “Оправете всички възможни секюрити проблеми.” No additional approval is required for the already requested security fixes. Purchases/new AI activation remain gated. No real signing, email, payment or customer-document test was performed; eSpravki is separate.

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

Existing object sizes/types were checked in aggregate before MIME restrictions. Approved public URLs were not changed. Private partner-logos-pending and user-articles-pending buckets exist, but their end-to-end submission/moderation integration and existing unapproved-object migration are NOT verified complete. Public pending images therefore remain an open item.

## Source fixes awaiting verified deployment

- Explicit safe signing-panel columns and patched PDF.js with eval/XFA disabled.
- Share Edge functions require target user_id = link.owner_id and owner-folder paths; atomic counterparty signing prevents replay races.
- Legal fetching checks every redirect, caps redirects/time/body size and refuses unsafe destinations.
- CORS permits exact project/production origins, not arbitrary Lovable subdomains or forged suffixes.
- signer-action moves OTP verification before QES storage, adds resend checks and atomic state predicates. Further HMAC, body-size and concurrency work is queued and NOT reported as complete.

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
