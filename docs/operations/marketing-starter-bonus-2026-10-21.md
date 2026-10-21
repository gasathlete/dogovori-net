# Consent-only marketing starter bonus

## Delivered
- Existing configured allowance remains 2 monthly operations. The starter increment is 5−2 = 3, only after explicit optional marketing consent. Signup without consent remains possible.
- Historical quota rows are marked legacy; existing balances are not reset and no retroactive credit grant occurs. Legacy users cannot claim again. Their historical allowance windows and wave caps remain intact.
- MAIN migrations `0030_marketing_starter_bonus`, `0031_marketing_bonus_claim_proof`, `0032_marketing_bonus_wave_cap` applied. Signup consent insertion and later claim share one atomic marker update; later RPC locks the quota row, validates consent/version and verifies the actual marker before returning success.
- Withdrawal records remain supported and do not reclaim credits. Re-enabling marketing cannot create another grant. Claim evidence contains existing version/event UUID/timestamp plus controlled source metadata; no document text or analytics added.
- Global queued dialog rechecks server eligibility, starts unchecked, provides dismiss/paid alternatives, and retries original operation inputs/IDs at most once after server proof and balance invalidation. Reoffer happens on new explicit quota-denied attempts, not on rendering.
- Signup consent flush finishes outside the auth callback before redirect, avoiding evidence loss and SDK callback deadlock.

## Integration scope
Shared wrappers cover generation/build/review/refinement, analysis, corrections, downloads, linked documents, negotiation strategy and assistant streaming. Async generation terminal quota denial restarts with identical payload/key; status polling never prompts. OCR helper is covered but existing raw-image/OCR privacy gate remains closed. Intake and paid-product/payment/auth/privacy gates do not become credit offers. The strict-document subscription/unlock paywall remains intact: marketing credits never substitute for a document entitlement.

## Files
- Server: `drizzle/migrations/0030_marketing_starter_bonus.sql`, `0031_marketing_bonus_claim_proof.sql`, `0032_marketing_bonus_wave_cap.sql`; generated database types refreshed by the migration tool.
- Shared: `src/lib/marketingBonus.ts`, `invokeEdgeFunction.ts`, `generateContractJob.ts`, `downloadDocument.ts`, `savedDocumentContent.ts`, `extractContractText.ts`, `consents.ts`, `pricing.ts`.
- UI/hooks: `src/components/MarketingBonusDialog.tsx`, `App.tsx`, `hooks/useAuth.tsx`, `useQuota.ts`, `useIsPro.tsx`; Auth, InlineAuthDialog, GoogleConsentDialog, FreeWelcomeDialog; Wizard, BuildContract, UploadedContract, DocumentWorkspace, UploadContractDialog, NegotiationStrategyPanel, AssistantChat; account SubscriptionTab/DashboardTab.
- Tests: `marketingBonus.test.tsx`, `generationMarketingBonus.test.ts`, `useAuthRedirect.test.tsx`, `scripts/tests/marketing-bonus.integration.py`.
- Project rule and task tracking updated in AGENTS.md/roadmap.md.

## Verification
- 79 application tests across 8 focused files passed: unchecked/dismiss/reoffer, server failure retry, claimed suppression, concurrent UI queue, identical operation requests, SDK response cloning, assistant stream, payment/privacy separation and signup redirect ordering. Existing consent/generation/content-write tests included. Test runner emitted React act warnings, not failures.
- Real deployed MAIN function definitions executed in a separate local PostgreSQL 17 database with synthetic users: signup with/without consent; false/stale consent rejection; later/repeat claim; revoke/re-enable; historical balance 17 preserved; eight simultaneous claims and signup/claim race; consent UUID collision; protected marker/anonymous rejection; free/pro assistant reserve/cancel/replay; exhausted corrections/wave grant and replay. All assertions passed. No MAIN synthetic accounts, payments, models or emails created.
- Authenticated MAIN browser read confirmed the owner's actual eligibility false and configured bonus 3. Desktop and 390px dialog checked with explicitly mocked eligibility only: unchecked, dismiss/reoffer, no horizontal overflow. No MAIN grant/consent write was made. A fresh live signup→grant→paid operation browser flow is not claimed; server grant behavior was verified in isolated SQL and UI continuation in focused tests.
- Automatic preview build/typecheck logs report build OK. No manual build/typecheck or frontend publication.

## Deployment status
Database behavior is deployed to MAIN now; frontend is preview/source only until publication. No edge deployment, payment settings, auth/RLS relaxation, dependencies, prices or unrelated homepage changes. No backend deployment blocker remains for the bonus RPCs. Old published signup forms may still record genuine explicit marketing consent through the shared trigger; new optional-bonus wording requires publishing this frontend.