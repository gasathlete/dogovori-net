# Project architecture rules

- Edge Stripe runtime and type imports use the same pinned npm SDK version; retain the shared gateway transport and API version to avoid CDN declaration-fetch failures without changing payment semantics.
- Generate the canonical Bun lock with the exact CI Bun version and verify a frozen install; preserve lock schema and scoped compatibility overrides rather than weakening CI checks.

- Sector packages are curated browse-only compositions over canonical catalog templates; never duplicate legal document text or create a purchase path from browser-provided content.
- Featured kit lifecycle metadata must reference every existing kit item exactly once; missing closing artifacts stay explicitly planned and unlinked.
- Home must not import the full catalog (templateIndex/CATALOG); use declared metadata guarded by a test against the canonical catalog — keeps the home bundle small without silent count drift.
- The hero LCP poster lives in public/hero with a path-scoped preload in index.html; keep component srcset and preload identical so the image is discovered before JS.
- Ledgers that mean "already charged" (quota_session_charges, corrections_batch_charges) and signer rows are written only by SECURITY DEFINER / service-role code; clients never get INSERT/UPDATE on them — a client-written row would grant free or forged value.
- Catalog template rewrites live as versioned candidates in src/data/templateCandidates bound to the original's SHA-256; originals in templateDrafts stay immutable and app code never imports candidates until a human legal approval step — automation cannot grant or inherit approval.
- Bulk catalog/AI regeneration goes only through scripts/template-regen-generate.ts with an evidence packet (original text + SHA-256, findings, owner-read sources) and writes only under reports/template-regen/generated; title-only generators that write templateDrafts/templateContent or their index are retired.
