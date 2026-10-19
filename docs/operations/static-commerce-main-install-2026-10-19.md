# Main static-commerce installation — 2026-10-19

## Narrow npm redeployment and deposit-file comparison — 17:08 UTC

- Preserved and deployed source HEAD `8b4a8d70bffb04fedb9db23c61fb96501e962f4c`. Deployed ONLY `static-catalog` and `payments-webhook`, retaining tested `npm:stripe@22.0.2` runtime/type imports and gateway transport.
- Tool confirmed submitted source/settings SHA-256: static-catalog `ed798e8b1acf747b759e9c50f6375ad866b5f7881fdd40318955604d8b7559a1`; payments-webhook `cfd3d64d5254d64968bf1c64892b62707bf2475f7464b623a6073cee41b71df4`. These are submitted hashes, not remotely extracted executable hashes.
- Fresh deployed checks: unauthenticated **401**; invalid live Stripe signature **400**; authenticated owner readiness **200**, `owner_operator`, assets `[]`, live/sandbox both `false`; live checkout **503** `static_checkout_closed`. Session restored for the existing requesting owner; no roles/reviews changed.
- Authorized Storage API GET **200** for `document-blanks/v6/family/razpiska-za-poluchen-garantsionen-depozit-pri-sklyuchvane-na-aacd5232.docx`. Index `1b17919c-b73f-4d63-91bc-29bf8097ca23` confirmed this path, sector `family`, database version **1**, created/updated 2026-06-05. The `v6` directory is not evidence of document revision 6.
- Actual file: **10,069 bytes**, SHA-256 `3ba4b2feb691e54d7e8115931e8e616e00c5e60f7e4b44d8cc26514955bd3c25`. Canonical source `src/data/templateDrafts/razpiska-za-poluchen-garantsionen-depozit-pri-sklyuchvane-na-dogovor-za-naem.ts` text SHA-256 `2a3c3a6fde74f69b909d01ca5be1d384b79346b444b8ae18a3359367e9c6501e`. Extracted DOCX body text SHA-256 `1d71e7e4146c19ccd2facd7f1c6a9f9b4e5fef45a5a368ea593f58d1eb1be8bb` (paragraphs joined with LF). Both exact and whitespace-normalized text comparisons **failed**.
- Concrete mismatch: stored title is only “РАЗПИСКА”; identifies its signatory as tenant while stating receipt of the deposit; contains literal `null null`; omits the canonical original's six numbered clauses, including security scope, return period/conditions, deduction accounting, and the separate landlord/tenant signature sections. No legal text generated or rewritten; no determination that either version was actually reviewed.
- Inspected body, headers/footer, comments, footnotes and document metadata: personal fields are placeholders; no real personal identifiers found, no 10-digit identifier or email in body; metadata author is the brand, last modifier generic. This is inspection evidence, not a universal PII certification. No personal data copied into this report.
- **No draft static asset created**: exact-original provenance cannot be established. Additionally the existing registration pipeline requires an actual price and explicit acceptance and immediately records an accepted review; it cannot safely be used as an unaccepted upload. No bypass or architecture change added.
- Smallest concrete next input: inspect the canonical original at `/shablon/razpiska-za-poluchen-garantsionen-depozit-pri-sklyuchvane-na-dogovor-za-naem`, then supply the exact final DOCX/PDF representing the version actually reviewed, with its genuine review reference. Do not treat the indexed file above as that original. Price binding remains the separate previously documented launch input; none created/changed here.
- No database/storage writes, acceptance, prices, charges, email, checkout activation or frontend publication. No code changes or full test reruns. Staging actual TEST paid/refund/replay/repeat/wrong-user E2E and rollback are recorded separately by the parent and were **not rerun** here.
- Confirmed total before batch **43.1/100 credits**; tools do not expose incremental batch cost. Two preliminary metadata queries failed with `42703` on guessed columns; information_schema then established the actual columns and the exact index query succeeded. No schema modifications.

## Final frontend release — parent verification, 2026-10-19

- Published main b6f19b277efd952e903df6aa14186b4d44e3e082 via deployment ed9ad8e8-3eb0-4dd1-bc85-47e981c71f31. Browser subsequently confirmed https://dogovori.net/gotovi-dokumenti renders the new catalog and login requirement, with purchases explicitly closed. The admin route redirects unauthenticated visitors to auth with its return path.
- Exact application source 255addc7 passed Tests, Build & SEO, and Static catalog sandbox. Final b6f19b changes only this report; its Tests and Build & SEO also passed. Its separate static typecheck failed on both attempts because esm.sh refused the HTTP/2 stream for stripe@22.0.2/esm/resources/OAuth.d.ts, before application typechecking. Logs read using the dedicated GitHub job-log connector; no check disabled or suppressed.
- Known security-shield failure remains GHSA-vfj7-8cjw-p6xm in the braces build/development dependency chain; not represented as resolved.
- Confirmed aggregate Lovable task cost: **38.7 / 100 credits**. Frontend publication does not imply that live commerce was enabled. Main still needs a genuine final uploaded asset, exact-version human approval, actual live price binding, and deliberate live-checkout activation. No fabricated approval, live charge or customer email.
- Earlier sections below describe their respective installation times and are retained as historical evidence.


Verified at 13:59 UTC. Frontend was not published. No payment, email, synthetic asset, asset acceptance, migration or live-checkout enablement was performed.

## Final narrow redeployment — after 14:12 UTC

- Latest preserved main source HEAD: `255addc7d09246524c9e12fdb14ff25296ffb79d`, including the CI fixes and parent's two customer UI corrections.
- Redeployed ONLY `static-catalog` and `payments-webhook`; tool confirmed successful deployment.
- New submitted source/settings SHA-256:
  - `static-catalog`: `2c86c423f216865e8b39be17b7575c36f98ec3ac718854612cb4fdc3e0ae295b`.
  - `payments-webhook`: `3329e7582fba6c33a45301d252661b692e5730de115282a3b45c8c838b129853`.
- Actual fresh deployed HTTP checks: unauthenticated static catalog **401** `unauthorized`; invalid live webhook signature **400**; authenticated readiness **200**, reviewer `owner_operator`, assets `[]`, sandbox/live checkout both `false`; live checkout **503** `static_checkout_closed`.
- No database, price, reviewer, acceptance, payment, email or flag mutations. No frontend publication. No broad/manual build or test reruns; exact final-SHA GitHub tests/build remain the parent's frontend release gate.
- Actual staging TEST paid, first/repeat download, refund, duplicate replay and wrong-user denial, plus rollback results, were reported by the parent and recorded separately; not rerun here and not evidence of a MAIN live payment.
- This report-only update does not change deployed function source. Confirmed budget before this narrow batch: 37.7/100; incremental cost is not supplied by the deployment or HTTP tools.

## Deployed source

- Checkout branch HEAD: `83988d48308aee5518bf1454eec71b3a042c146a`, direct child of supplied `88ddc074bcdbbeb40bec5fd63d632a2239b8ee2f`.
- Difference from supplied HEAD: generated application database types only; function source unchanged.
- Deployment tool confirmed both main functions deployed successfully:
  - `static-catalog`: submitted source/settings SHA-256 `e334429803df42ba2e9a107e8ac5ba554a2cc19a033bab2ddbd39b6cab012434`.
  - `payments-webhook`: submitted source/settings SHA-256 `f066359ffb6f01ffc6a7c57b0f25c3533dc204284afd0c7a540781836b5910df`.
- These are tool-reported submitted hashes, not remotely extracted executable hashes. HTTP checks below exercised the deployed endpoints.

## Main endpoint smoke checks actually run

| Check | Observed result |
|---|---|
| Unauthenticated POST static-catalog | 401 `unauthorized` |
| Invalid Stripe signature, webhook `env=live` | 400 `Webhook error` |
| Authenticated readiness before onboarding | 200; reviewer null; sandbox false; live false; assets [] |
| Authenticated live catalog | 200; checkout_open false; items [] |
| Authenticated live checkout attempt without an asset | 503 `static_checkout_closed` (before order/Stripe operations) |
| Authenticated readiness after onboarding | 200; reviewer owner_operator; sandbox false; live false; assets [] |
| Existing six static tables | RLS true and authenticated INSERT false for all six |

No broad suite rerun. User-reported same-SHA GitHub/test and isolated staging results are not represented as checks run in this installation session. No real/main paid E2E was attempted.

## Human operator onboarding

The requesting owner's exact existing account was resolved through `lovable auth-session --json --self`. Database records confirmed email confirmation and an existing `moderator` role. No admin role was granted or inferred from user-editable profile metadata.

Inserted one reviewer record, labelled `Даниел Милев — собственик/оператор (не е независим юрист)`, capacity `owner_operator`. No credential of a lawyer or asset review was invented. Deployed readiness confirmed the resulting capacity.

Initial guarded insertion returned no rows because `is_staff` additionally requires authenticated identity/service-role claims; the operator SQL context has neither. Its definition was inspected, and the retry used a direct existing protected user_roles membership check and confirmed exact user ID instead. No security function or grants were changed.

Initial main counts were zero for assets, orders, entitlements, payment events, reviews and reviewers. Only the reviewer onboarding record was added.

## Payment settings / final launch inputs

- Payments status tool: all five live onboarding/readiness steps completed. Live connection and both live/sandbox webhook signing-secret names are present. No secret values were read or output, endpoints edited, charges created or keys rotated.
- Both `STATIC_CATALOG_LIVE_CHECKOUT_ENABLED` and `STATIC_CATALOG_SANDBOX_CHECKOUT_ENABLED` are absent from main secrets. Existing strict `=== "true"` checks therefore keep both OFF, confirmed via deployed responses. No missing setting prevents this OFF-state installation.
- Still required for sale: owner uploads the actual final PDF/DOCX in `/admin/static-catalog` with exact version/source provenance, actual human review reference and explicit personal acceptance, linked to its actual live one-time EUR VAT-inclusive Stripe price. Main has no sellable assets yet; no price was fabricated or inspected as an asset-specific prerequisite.
- Frontend release remains with the parent once same-SHA Tests and staging UI follow-up complete. This session did not verify their completion or publish.
- Live checkout activation remains a separate explicit release action after those proofs and an actual accepted live asset. It was not enabled here.
- Presence/status checks do not prove a valid signed LIVE event delivery; only the invalid-signature rejection was tested on main. Staging paid/refund evidence was supplied by the parent, not rerun here.

## Cost

`credits.get_my_usage` returned 623 credits for the entire Sep 29–Oct 29 billing period, not this batch. It does not expose this session's actual `cost_credits`; no incremental cost is asserted. Previously confirmed total is 27.1/100, excluding this batch and separate staging follow-up.