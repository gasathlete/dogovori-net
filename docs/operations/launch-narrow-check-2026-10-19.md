# Narrow launch preparation — 19 October 2026

## Scope and source

Started from `5b7977a01edbad1c0fccae20e971d47bb912d30c`; preserved newer UI, regeneration and payment controls. No database writes, asset acceptance, price creation, payment, email, deployment or frontend publication in this batch. Existing checkout flags were not changed.

## Stripe CI import correction

Changed only the Stripe SDK imports in `supabase/functions/_shared/stripe.ts` and `_shared/customer.ts` from `https://esm.sh/stripe@22.0.2` to `npm:stripe@22.0.2`. Same SDK/API version (`2026-03-25.dahlia`), gateway transport, credentials and verification logic retained. No CDN Stripe imports remain in edge source. Reported CI OAuth.d.ts HTTP2 failure was not independently reproduced; the replacement avoids that CDN dependency and passed local Deno checks.

## Dependency evidence

- Official advisory: https://api.github.com/advisories/GHSA-vfj7-8cjw-p6xm (updated 2026-10-02): vulnerable `<=3.0.3`, `first_patched_version: null`.
- Public npm registry latest braces is still `3.0.3`. No compatible maintained patched release was found; no speculative override or audit suppression applied.
- Exact Bun 1.4.2 public-registry audit returned **1 high vulnerability**, braces, via `tailwindcss > micromatch > braces`. Lock also contains Tailwind 3.4.19 → chokidar 3.6.0 → braces 3.0.3 and fast-glob 3.3.3 → micromatch 4.0.8 → braces.
- This is a build/dev glob toolchain dependency, not an app/edge import; malicious deeply nested glob input can exhaust the build process stack. Security shield remains legitimately blocked.
- Default sandbox registry audit returned HTTP 404 on its bulk-advisories endpoint; public-registry audit succeeded without changing project configuration.
- Checkout contained lock schema v1 with scoped overrides dropped. Regenerated using Bun **1.4.2** in `/tmp/launch-lock`, preserving the current manifest; frozen install succeeded (**802 packages**), schema **v3**, scoped overrides retained. Running `bun x` subsequently rewrote the project lock to v1 through the environment; restored the verified v3 file and ran Vitest directly. No assertions weakened.

## Read-only actual assets and live prices

Main `static_catalog_assets` query returned **0 rows**, not just zero accepted rows. No final static asset ID/version/file hash or exact-version review exists to match against Stripe.

Existing indexed DOCX objects verified by storage metadata (not downloaded; bytes/hashes/legal provenance not inferred):

| Canonical source | Actual indexed file | Indexed ID / version / bytes |
|---|---|---|
| `razpiska-za-poluchena-suma` | `v6/family/razpiska-za-poluchena-suma-bccb04a5.docx` | `5523feca-f299-436a-84e1-7260fd4a7ccf` / 1 / 10066 |
| same canonical source | `v6/services/razpiska-za-poluchena-suma-248a0ff8.docx` | `04f709c8-1ed9-45d4-8226-5846fecd72d5` / 1 / 10145 |
| `razpiska-za-poluchen-garantsionen-depozit-pri-sklyuchvane-na-dogovor-za-naem` | `v6/family/razpiska-za-poluchen-garantsionen-depozit-pri-sklyuchvane-na-aacd5232.docx` | `1b17919c-b73f-4d63-91bc-29bf8097ca23` / 1 / 10069 |

The existing registry identifies exact original draft sources, version `v1-original`:

- `src/data/templateDrafts/razpiska-za-poluchena-suma.ts`: registered source-text SHA-256 `30ade9ad9018fa352c6d732ffd4d80f802d23f011a436e633f60ab3584931e1e`; citation article 77 remains unverified in the registry.
- `src/data/templateDrafts/razpiska-za-poluchen-garantsionen-depozit-pri-sklyuchvane-na-dogovor-za-naem.ts`: registered source-text SHA-256 `2a3c3a6fde74f69b909d01ca5be1d384b79346b444b8ae18a3359367e9c6501e`.

These are source-text hashes, **not DOCX hashes** or proof of exact-file acceptance. Registry historical catalog-level owner confirmation is not a new file review. The two sum receipts have different file sizes/sector identities; do not automatically choose one.

Export trace: `Template.tsx` loads canonical original text for preview; `templateDraftResolver.ts` exposes actual selection provenance. `downloadDocument.ts` invokes the gated saved-document flow then PDF/DOCX exporters. `download-blank/index.ts` can replay an existing file but new files use legal retrieval and AI generation (lines 530–763), not an immutable approved-original export. Existing exporters alone therefore do not establish a reviewed static file. No such pipeline was bypassed or rewritten.

Public existing files are supporting material, not accepted purchasable catalog assets:

- `public/legal-memorandum-dogovori-net.docx`: SHA-256 `c20ec0a1cde83facb478fbf1487beaf75e0859853b60e7573a7acca534975d27`.
- `public/lead-magnets/10-cherveni-flaga-dogovor-za-naem.pdf`: `619c5f5d56926820594f9ac102445802992bb64d034c5ce3f7ab9bb3475266ce`.
- `public/lead-magnets/chek-list-truddoven-dogovor-2026.pdf`: `a5510cf619e915bc8a127175876436fcf5d27e6ad3b9d49308e59423dcf5a016`.

Live Stripe `/v1/prices?active=true&type=one_time&limit=100` succeeded, complete list (`has_more:false`). Initial expanded-product request failed HTTP 400 `Invalid array` for `expand`; retried without expansion successfully.

- `price_1TWcN7Q7izR0PPEqxbNjrIBY`, `single_contract`, product `prod_UTsDT44R3Y5eQZ`: actual **190 eurocents**, active, live, one-time, **tax_behavior unspecified**. Product GET confirms “Единичен договор Pro”, description “Еднократно сваляне на един договор в PDF и DOCX без абонамент.” This legacy generic price is not an exact-file match and VAT-inclusive treatment is not established. No reuse or change authorized by this report.
- Existing VAT-inclusive live EUR prices `contract_check_299` (`price_1UFXSTQ7izR0PPEqm8hViQEZ`), `contract_improve_399` (`price_1UFXSQQ7izR0PPEqXtvzHz94`), `negotiation_package_799` (`price_1UFXSUQ7izR0PPEqe4oQHRHi`) belong to distinct AI products, **not static catalog files**; do not repurpose them.

## Smallest concrete launch preparation

Use one existing original deposit receipt above as a **selection proposal only**, not an accepted asset. Required inputs: the actual final DOCX/PDF selected by the operator (including confirmation whether the indexed file faithfully represents that original), its exact filename/version/hash, real review reference/provenance recorded through `/admin/static-catalog`, and a corresponding live EUR one-time VAT-inclusive price. No matching accepted file/price pair currently exists. The known October report's five affected templates and regenerated candidates were not selected or accepted.

## Checks actually executed

- Deno check: static-catalog, webhook-proof, payments-webhook, create-product-checkout — **passed**, SDK resolved from npm.
- Focused Deno static-catalog admin + webhook handler tests — **50 passed / 0 failed**.
- Focused Vitest request/return/lock checks: first run **13 passed / 2 failed** on environment-rewritten v1 lock; after restoring verified v3, direct Vitest **15 passed / 0 failed**.
- Frozen Bun 1.4.2 install — passed; no lock schema downgrade accepted.
- Automatic preview build log: **build OK**, 17:03:36 UTC. Manual production build/typecheck not run: environment instructions reserve builds/typechecks to the harness. Full production pipeline/GitHub exact-SHA status is not independently claimed here.
- No staging payment/refund/replay/wrong-user or rollback rerun; previous separate evidence remains unchanged.

Batch credits are not measured by these commands. User-confirmed baseline **38.7/100**, requested batch ceiling **8**; no claim of a measured batch charge.