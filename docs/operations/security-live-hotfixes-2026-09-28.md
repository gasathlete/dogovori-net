# Security live hotfixes — 2026-09-28

Owner instruction: “Оправете всички възможни секюрити проблеми.” These are narrow production fixes performed during the broader security audit. No customer data was changed; no emails, charges or AI activation occurred.

## Applied and verified
1. growth_snapshot(timestamptz,timestamptz): applied the exact transaction in docs/migrations/0048_growth_snapshot_authz.sql, after independently confirming that the query body matches the live function byte-for-byte outside its authorization guard/search_path. Removed the SECURITY DEFINER current_user bypass; anon EXECUTE false, authenticated true (staff guard), service_role true; search_path public,pg_temp. Unrelated 0044–0047 were NOT applied.
2. shared_links INSERT/UPDATE policies: added document ownership and uploaded storage-owner checks, while retaining existing authenticated INSERT/UPDATE privileges and the service role creation path. Metadata verification confirms both new WITH CHECK expressions and server/client creation privileges. Existing link-target mismatch and unexpected uploaded owner-prefix aggregate counts were both zero before the change. This closes forged foreign target creation/retargeting; it does NOT by itself secure all signature fields or every storage consumer.

## Exact applied ownership policy transaction

```sql
BEGIN;
ALTER POLICY shared_links_insert_own ON public.shared_links WITH CHECK ((auth.uid() = owner_id) AND (
(document_id IS NOT NULL AND uploaded_contract_id IS NULL AND EXISTS (
SELECT 1 FROM public.saved_documents d WHERE d.id = shared_links.document_id AND d.user_id = auth.uid()
))
OR
(uploaded_contract_id IS NOT NULL AND document_id IS NULL AND EXISTS (
SELECT 1 FROM public.uploaded_contracts u WHERE u.id = shared_links.uploaded_contract_id AND u.user_id = auth.uid()
AND (u.storage_path IS NULL OR split_part(u.storage_path, '/', 1) = u.user_id::text)
))
));
ALTER POLICY shared_links_update_own ON public.shared_links WITH CHECK ((auth.uid() = owner_id) AND (
(document_id IS NOT NULL AND uploaded_contract_id IS NULL AND EXISTS (
SELECT 1 FROM public.saved_documents d WHERE d.id = shared_links.document_id AND d.user_id = auth.uid()
))
OR
(uploaded_contract_id IS NOT NULL AND document_id IS NULL AND EXISTS (
SELECT 1 FROM public.uploaded_contracts u WHERE u.id = shared_links.uploaded_contract_id AND u.user_id = auth.uid()
AND (u.storage_path IS NULL OR split_part(u.storage_path, '/', 1) = u.user_id::text)
))
));
COMMIT;
```

## Automatic review rejection and safer alternative
A proposed blanket client INSERT/UPDATE ACL revocation on shared_links was rejected by automatic review as a possible disruption to normal share creation. That transaction was NOT executed. The narrower ownership policy transaction above was subsequently accepted and applied. Do not secretly reapply the rejected broad revocation. Further tightening must preserve/prove the normal create/revoke/owner-sign paths and protect server-only fields with targeted controls and regression evidence.

## Before-state / controlled rollback evidence
- Original policies shared_links_insert_own and shared_links_update_own used only WITH CHECK (auth.uid() = owner_id); UPDATE USING remains (auth.uid() = owner_id). Restoring the old expressions would reopen the vulnerability and is not a normal operational action.
- The pre-fix growth function is the historical source superseded by the reviewed 0048 patch; do not restore its current_user authorization bypass.
- The root audit inspected pg_policies, pg_proc definitions/ACLs, column privileges, storage bucket configuration and triggers. It did not exploit real user documents or invoke destructive RPCs.

## Confirmed follow-up surfaces
The broader implementation must still address authenticated-callable quota/correction helpers, untrusted loyalty operation counts, client-writable profile counters, shared-link signature/path integrity, uploaded/saved document storage-path trust, arbitrary rate_limit_check keys/windows, service-only cleanup RPCs, public upload limits, legal-fetch redirects/timeouts, OTP/signing abuse and dependency/configuration findings. Metadata also shows direct signing_request_signers INSERT/UPDATE policies through request ownership: verify that an owner cannot forge another signer's OTP/status/signature. Trigger-returning functions are not ordinary callable RPC exploits and should not be misclassified.

Public legal_sources currently contains 21 active BG law/code sources (13 laws, 8 codes). legal_versions is version/changelog metadata. Public legislation is not itself a user-document leak; review its consumer scope accurately.

Broader report: docs/operations/security-hardening-2026-09-28.md (in progress at the time this note was recorded).

## Live checkpoint — 2026-09-28 18:08 UTC

Root has now applied the independently reviewed S1–S8 portion (only) of `docs/migrations/security_hardening_2026_09_28.sql`. All referenced columns and existing column ACLs were checked against production; client call sites were reviewed. Production metadata verifies: client charge-ledger INSERT false; signer-status UPDATE false; team seat_count UPDATE false; profile assistant counter UPDATE false; consent UPDATE false. Allowed profile name/team name edits and envelope cancellation column remain granted; service_role signer and membership INSERT/UPDATE remain granted. Cancellation is further constrained by the new trigger. No customer rows were modified.

**Correction to the generated report:** production `otp_code_hash` SELECT for authenticated was already FALSE before S1–S8. The confirmed signing vulnerability was writable signer/status/evidence fields, not a newly demonstrated OTP hash read. Preserve the existing OTP read protection; do not report a before/after read leak without evidence.

Eight internal RPCs were also made service-only and independently verified (PUBLIC/anon/authenticated cannot execute; service_role and owner postgres can):
- `_roll_feature_counters(uuid)`
- `charge_corrections_wave(uuid,uuid,integer)`
- `consume_assistant_message(uuid,integer)`
- `rate_limit_check(text,integer,integer)`
- `cleanup_anonymous_drafts()`
- `purge_old_funnel_events()`
- `assemble_prompt_content(uuid)`
- `check_compliance_reminders()`

Their exact ACL operation is `REVOKE EXECUTE ... FROM PUBLIC, anon, authenticated; GRANT EXECUTE ... TO service_role;`. Repo-wide call-site searches established that browser callers do not need these raw internal APIs. Definer wrappers still execute as their owner. No function bodies or user rows changed in this step.

S9 growth is already live as recorded below. S10's two additional RPCs, S11 loyalty, S12 share guards and S13 storage paths have NOT yet been applied by root. In particular, the old staged S12 that removes all client INSERT is NOT approved by root: the automatic review rejection described below remains binding. Use a targeted insert/update guard preserving legitimate creation, with behavioral proof.

A read-only negative test using SET LOCAL ROLE in a SQL DO block returned API499/request_cancelled. It is NOT a passed live test. Permission/definition metadata reads did succeed; isolated PGlite tests are separate evidence.

No security frontend/Edge deployment has yet been performed by root. Shared main also contains a separate SEO change; preserve it during release coordination.

## Further root verification

- **S11 loyalty is now LIVE:** root reviewed and applied the two replacement functions from the staged patch. Metadata verifies authenticated EXECUTE retained, anon denied, canonical download_quota/team_usage counters used, and no `IF _total_ops >=` browser-trusting comparison. No function was invoked for an actual user and no historical award was rewritten.
- Storage preflight (aggregate only): 57 uploaded rows have storage paths and 0 violate the owner prefix/path checks; saved_documents has 0 storage_path entries. This is a compatibility preflight, not a test of the future guards.
- Root found an additional CORS suffix issue in the addendum: `attacker--<project-id>.lovable.app` matched the suffix rule. Code commit `2808710c68d1fc31fc664ebaf1d497faf94272e9` uses exact project hosts and checks a syntactically exact origin. Regression tests committed in `8e4ce6ea084f12a93a38a68c18cd2d0c8470645b` cover this bypass. Root separately ran 4 accepted + 7 rejected origin assertions against the changed helper after stripping only its two TypeScript signatures. Passed. Full Deno/CI/deployment remains to follow. Preserve this stricter helper when deploying all consumers.
- A direct read-only HEAD request from root's local runtime returned URLError; it is NOT evidence that production headers passed or failed. Check actual served HTTP headers from an available network runtime after deployment.
- Separate draft PR #8 (`security/anti-hack-shield-20260928`) supplies scanner coverage and public-header regression/probe tooling; it is not merged by root. Preserve it and distinguish its independent scanner successes from application CI, which still needs coherent frozen locks.

## Reviewed production follow-through — 2026-09-28 19:45 UTC

- S12 targeted shared-link trigger from commit 8823cb625da744beac788f982e37150090f81cec is now LIVE. It preserves authenticated INSERT/UPDATE and ownership policies; rejects forged counterparty signature/QES/PDF fields and identity retargeting; preserves normal client create, owner-sign and revoke paths. Root read the corresponding behavioral PGlite cases. Metadata confirms the trigger exists and INSERT/UPDATE grants remain true. The previously rejected blanket ACL revocation was not applied.
- admin_privacy_kpis now authorizes before evaluating any scalar aggregate. Root compared its SELECT body byte-for-byte to production, applied docs/migrations/security_privacy_kpis_authz_2026_09_28.sql, and verified the guard plus anon EXECUTE false. No real user call or row mutation was performed.
- Bucket limits observed LIVE: partner-logos 2,621,440 bytes, user-articles 5,242,880, user-contracts 10,485,760, qes-signatures 16,777,216. Existing object maxima/types were checked in aggregate. Root added server-enforced MIME restrictions: PNG/JPEG/WebP for logos/articles; PDF/DOCX for contracts. No objects were deleted or public URLs changed by this operation.
- Further path issue confirmed: the ALL policies on saved_documents/uploaded_contracts permit team members to insert another user_id or change it with storage_path. S14 folder binding requires an additional owner-identity guard; it is not sufficient alone.
- IMPORTANT CI attribution: green 4a4e2d4175bf238fb448a88d8c9e5bfa70d3e535 belongs to separate PR #9, seo/practical-guides-20260928. It is NOT proof that security main passed. Root is integrating compatible dependency locks and security changes, preserving the independent SEO PR. No security frontend publish yet.
