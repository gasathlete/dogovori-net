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
