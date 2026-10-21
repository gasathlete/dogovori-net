# Paid release verification — 21 October 2026, 06:06–06:31 UTC

## Release boundaries
- No publication and no LIVE charge. `product_launch_control/public_products.live_enabled=false` verified by actual service read at 06:28 UTC. Existing fulfillment, core, keys and legal policy remain unchanged.
- Frontend release preparation now uses `ONE_TIME_PURCHASES_AVAILABLE=true` and `one_time_product=true` consistently. This source must not be published before ROOT review and coordinated server opening. Subscriptions, signing and raw-file sales remain separate/closed.
- Canonical Bun blob remains `a260168a413111af4d4dd680a9943e88f883606d`; no package changes. Current managed HEAD observed `22dd663f63380b4c48cc13986190170a6e744e5f` before final readback edits; Git state/commits are managed externally, no manual commit made.

## Genuine TEST evidence
Normal synthetic fixture `94ce2368-7265-4cfe-89b0-4341ab695730` signed in with password and a real JWT; it submitted its own four explicit TEST confirmations. Payment used official embedded Stripe Checkout and 4242 TEST card, not SQL paid rows or forged webhooks. Source was synthetic owner-supplied text.

| Product | Entitlement | Actual paid event | Observed delivery |
|---|---|---|---|
| contract_improve,399 EUR cents | 11475c9a-6859-4643-b812-8b6b667f0b91 | evt_1USsmKPyRrZ3BrwIcCPGBiCZ | ready; two corrections; owner selection/save; DOCX10667bytes, PDF155445bytes |
| negotiation_package,799 EUR cents | b45ed90c-589d-473d-a8ba-9e01b4592cc2 | evt_1USsp3PyRrZ3BrwI6HtFZssu | ready; two letters; initial full-output refinement failed with provider_outcome_unknown and remained pending/reconciliation |
| negotiation_package,799 EUR cents | 903cc585-f4ae-4b5d-b672-35bca7ecb25b | evt_1USsuwPyRrZ3BrwIKS4iLg57 | ready; two letters; bounded narrative refinement HTTP200; succeeded refinement2ddb1bdc-8451-4271-bbf8-2d9ed83b5bbf,version1; negotiation PDF175837bytes |

The already-proven contract_check was not repurchased. Improve/premium fulfillment repeated twice each: HTTP200, generation counts4→4 and6→6, respectively. No repeat model/payment on these replays. PDF text extraction confirmed Cyrillic and exact `Проверете внимателно преди подписване`; DOCX XML includes Cyrillic. Downloads were through authenticated real owner-result UI, not a substituted demo.

## Verified fixes and honest limits
- Refund/dispute event handling validates signed environment and exact session/payment-intent/locked ledger binding, no mutable current-staff requirement. Staff authorization remains for NEW sandbox purchases. Cross-environment and mismatched-payment-intent tests added.
- Previously failing improve validation now paid-retested successfully; evidence/anchors remain strict.
- Refinement no longer regenerates an entire immutable paid evidence packet. Allowlisted narrative patch is merged into exact server-held base, then validated by the existing full result/source/refinement verifier. No synthetic findings or altered source allowed. Unknown provider outcome remains frozen, not silently retried.
- Corrected downloads initially vanished on reload despite saved decisions. Server-selection reconstruction now requires matching output hash; CorrectionWorkspace receives rebuilt corrected text. Actual browser reload verified DOCX download available.
- **Late readback issue found:** successful refinement was persisted but old base letters/unused allowance were shown after reload. Added owner-bound, canonical/digest/source-verified succeeded-refinement readback through product-result-state, reusing exact replay verifier; frontend uses validated refined result. Deployed after TEST refunds. Actual retained successful row passed integrity readback (`kind=replay,used=1`). Authenticated end-to-end UI after this final readback change is NOT yet verified because fixture is disabled and purchases refunded; no refunded entitlement was reopened. ROOT should verify this remaining UI readback with an isolated legitimate TEST purchase before public opening. Earlier disabled button alone was NOT proof of used allowance (empty instruction also disables it).
- Initial failed refinement `bd6a8038-a3c2-49e0-a5d0-9763f697f6dc` remains pending historical provider-outcome audit, not claimed resolved. Its parent entitlement is refunded and processing/refinement leases cleared; audit is retained.

## Refunds and cleanup
All four historical genuine refunds reconciled through authoritative Stripe `charge.refunded` events and the same immutable reversal logic, no SQL-created refunded state. Old fixture remains disabled/role revoked.
All three new genuine refunds succeeded in Stripe and arrived via signed webhook; actual DB reads confirmed refunded with events:
- improve: evt_3USsmIPyRrZ3BrwI2I4o87rS;
- first premium: evt_3USsp2PyRrZ3BrwI2XP7ABfM;
- refined premium: evt_3USsuvPyRrZ3BrwI2zjrENpP.
New fixture moderator role removed and auth banned via normal admin API. Financial TEST rows, source receipts, outputs and historical provider records retained to preserve audit/dependencies; no emails/customer data. Temporary local credential files removed at completion.

## LIVE read-only readiness
Actual active prices: contract_check_299=299,contract_improve_399=399,negotiation_package_799=799 cents; currency eur,type one_time,tax_behavior inclusive. `.env.production` publishable token prefix is live; development prefix is sandbox (values not disclosed).
LIVE app webhook enabled,existing signed verification preserved. Missing reversal/async events added using supported payment capability and re-read: charge.refunded,charge.dispute.created,charge.dispute.closed,checkout.session.async_payment_succeeded,checkout.session.async_payment_failed; existing events retained. No manual endpoint or analytics endpoint deletion. No genuine LIVE event/charge claimed.
Provider chat-completions zero retention remains established; separate AI app-context logging setting remains unknown. No global content-retention attestation or invented privacy toggle added; no unrelated privacy terms rewritten.

## Tests/deployment/cost
59 focused app tests passed;50 edge tests passed (webhook41,patch2,outcome7) before final readback; readback-specific tests recorded in continuation below. Automatic preview build OK06:29:46 UTC. No manual build/typecheck claimed; ROOT CI supplies full release checks.
Native deployed submitted-source SHA256:
- payments-webhook: b29135980a1a2118c2006e5c0fe668b79d5dc83954463d5d74a80c7f82148a3e;
- refine-product: e9a6cd8db6dffeab3a5df5802326cf3d3fae27001a7ef9369293c728f13b2730;
- product-result-state: e7017c0601badb6a773b02d0dc6d8b8a088e207348ea3bc9c48961f8001924d0.
Exact package credit consumption was not exposed by the tools used; unavailable, not estimated. ROOT controls review,remaining UI-readback proof,full CI,live row and native publication.

## Final bounded verification — 06:40–06:51 UTC
- Starting managed HEAD exactly `19e6e9b2c8537285491e70146bd0120e7063cda8`; canonical Bun blob still `a260168a413111af4d4dd680a9943e88f883606d`. No dependency changes, manual commits, deployment, publication or LIVE-row opening in this pass.
- Fresh normal synthetic fixture `1f360fa1-16be-44d6-ae11-3a40ccc1248d` signed in with password. Actual preview pasted-text intake, context and four independently unchecked confirmations produced checkout HTTP200, with mobile width390/no horizontal overflow.
- **Concrete checkout defect fixed:** shared StripeEmbeddedCheckout incorrectly gated every payment on the closed subscription feature, hiding the payment iframe after successful one-time session creation. Product checkout now gates on `one_time_product`; all other callers retain the subscription gate. Two regression tests verify product mounting and subscription non-mounting. No paid/auth/server boundary relaxed.
- That already-created session was paid once through official embedded Stripe Checkout with 4242 TEST card (not a second checkout or fake webhook). Actual entitlement `8a55890c-f272-414d-b625-2fd6ac3b50a2`, session `cs_test_a1CyjrwzqhEVt1r7dFocLh5lrT9YlPHDV1z5SCqYHdLJewujvzAOVtlJKY`, paid event `evt_1UStFyPyRrZ3BrwIOnS4BWIg`; fulfillment synthesis HTTP202→ready HTTP200. After the UI fix, the actual shared component mounted nine Stripe frames using that same session. No additional TEST purchase was made.
- Bounded refinement through authenticated owner UI returned HTTP200/ready. Before refund, actual owner status returned stored `refined_result`, used1 and exactly one succeeded refinement. A fresh authenticated navigation followed by **actual reload** displayed both subjects and complete letter bodies exactly equal to the stored succeeded result; no substituted demo/base letters. Loading was awaited before comparison.
- Reloaded UI visibly states `Включеното уточнение вече е използвано (1 от 1).`; instruction input and action are locked. A separate normal owner request with a valid nonempty instruction and fresh UUID received HTTP409 `invalid_request` (not interpreted as a more specific allowance code). No extra model call resulted.
- Authenticated UI PDF download174414bytes contains both complete UPDATED letter bodies and exact `Проверете внимателно преди подписване`; text comparison removes page footers/page numbers and whitespace, because the firm letter crosses a page boundary. No missing content. Screenshot evidence retained under `/tmp/browser/final/`.
- Four subsequent fulfillment replays HTTP200; generation-call count6→6. One genuine payment only; no repeat model call/payment. The fixture and paid entitlement remained active throughout all readback/export/component checks.
- Then genuine Stripe TEST refund `re_3UStFwPyRrZ3BrwI0I6OHZL6` succeeded. Actual signed reversal event `evt_3UStFwPyRrZ3BrwI0MCZCF5r` reconciled entitlement to refunded; model_calls6. Temporary moderator role removed (actual count0), fixture banned normally; result/fulfillment requests afterward HTTP401. Financial/source/refinement audit retained; local credential files removed.
- Deno check passed for create-product-checkout, product-result-state, refine-product and payments-webhook. Focused affected UI tests:4files/27passed, including both new availability regressions. Automatic preview build OK06:47:53UTC. No manual app build/typecheck or full-suite rerun claimed.
- LIVE read-only evidence revalidated: active EUR one-time prices299/399/799cents, inclusive tax behavior; production token prefix live. App LIVE webhook enabled with refund/dispute/async events intact. Private launch row remains **false** after cleanup. No LIVE charge, no publication and no additional owner-approval gate introduced; ROOT retains coordinated source/CI review and opening/publication.
- Remaining historical limitation: pre-fix unknown provider-outcome audit retained as already documented; no new failure in this fresh paid refinement. Separate service app-context setting remains unknown, not a fabricated privacy attestation. Exact credit consumption for this pass unavailable; not estimated.