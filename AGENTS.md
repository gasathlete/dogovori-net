# Project architecture rules
- Signup evidence is captured once by an auth-identity lifecycle trigger and consumed only by the confirmed owner; mutable metadata and unbound browser evidence never grant consent. Billing event and credit/reversal ledgers serialize service-only writes and keep TEST balances separate from customer quota.
- Auth mutations use a synchronous request lock with finally-based recovery; password recovery ignores stale product navigation. Static funnel SEO derives plans from canonical pricing and marks known private entry routes noindex before JavaScript runs.
- Registration CTAs share sanitized signup destinations; the homepage has one session-dismissed invitation suppressed by visible actions/forms/cookies/overlays. The lazy voluntary story uses the existing dialog focus lifecycle and local-only scenes, never timers or a signup gate. Marketing benefit presentation is shared; server consent/grant logic stays authoritative.
- Story capability examples reuse canonical product findings where applicable and isolate fixed local selections in StoryCapabilityDemo; never invoke real analysis, chat or exports from a presentation.
- Starter bonus eligibility is server-owned and historical legacy allowances count as claimed; atomic consent-triggered grants use the existing signup-minus-monthly delta, while user-initiated quota denials replay the identical request at most once after confirmed consent/grant.

- All billing navigation validates exact application origins; CSV exports share formula-neutralizing cell escaping, and raw PostgREST OR values are quoted as literals — untrusted data must not become navigation, spreadsheet commands or query syntax.

- Edge Stripe runtime and type imports use the same pinned npm SDK version; retain the shared gateway transport and API version to avoid CDN declaration-fetch failures without changing payment semantics.
- Generate the canonical Bun lock with the exact CI Bun version and verify a frozen install; preserve lock schema and scoped compatibility overrides rather than weakening CI checks.

- Sector packages are curated browse-only compositions over canonical catalog templates; never duplicate legal document text or create a purchase path from browser-provided content.
- Featured kit lifecycle metadata must reference every existing kit item exactly once; missing closing artifacts stay explicitly planned and unlinked.
- Home excludes full catalog imports; test declared metadata against canonical counts to prevent drift.
- Lazy demos reuse canonical previews/calculators; never submit or replace consent. Partner tracks preserve query data, hide clones from focus/ARIA and pause for visibility/focus/motion preferences.
- Catalog and template review notices use one shared public-status constant/component without slug/category/acceptance inference; this keeps all browse surfaces consistent without changing approvals, paid rights or legal content.
- Home links/shelves use metadata; tabs are fictional, never submit. Mobile guide uses canonical prices/status; nav replaces itself with product CTA and hides for cookies/keyboard/checkout. Product preparation is public; server actions require auth.
- The hero demo is one local-only interactive workspace (edit → brand → review) with a single preview whose state changes; it never saves, sends or submits, and links only to existing creation routes.
- Public visual finishing stays scoped to the public shell and named public-page classes; preserve editor/admin/document rendering and functional status/consent semantics to avoid decorative changes altering product behavior.
- The header wordmark is pre-outlined SVG paths (src/lib/headerWordmark.ts) derived from an OFL font with its licence in public/licenses; never ship a web font or raster for it — avoids font flash and missing Cyrillic.
- Public detail reading styles use the explicit editorial-detail/sample-document scope; preserve hidden sample panels and do not extend these layout rules to admin, editors or customer documents.
- Ledgers that mean "already charged" (quota_session_charges, corrections_batch_charges) and signer rows are written only by SECURITY DEFINER / service-role code; clients never get INSERT/UPDATE on them — a client-written row would grant free or forged value.
- Catalog template rewrites live as versioned candidates in src/data/templateCandidates bound to the original's SHA-256; originals in templateDrafts stay immutable and app code never imports candidates until a human legal approval step — automation cannot grant or inherit approval.
- Bulk catalog/AI regeneration goes only through scripts/template-regen-generate.ts with an evidence packet (original text + SHA-256, findings, fetched excerpts, category checklist) and writes only under reports/template-regen/generated with explicit status; only schema- and check-validated records for the same hash are reused — failed output never counts as a candidate or approval.
- Raw uploaded-document text is written only by the uploaded-text-intake edge function (service role); the DB trigger enforce_no_client_document_text_write denies client text writes.

- Generated saved-document JSON is persisted by saved-document-content; client raw payload writes stay disabled. Owner/revision binding and metadata ownership checks apply before service-role writes.
- Paid product sources of kind owner_text are trusted only via service-only product_text_attestations receipts written by uploaded-text-intake for the exact text hash+revision; file sources stay closed until the independent bridge is enabled — never relabel pasted text as file extraction.
- Product ENV config is projected by a pure module; private service-written deployment observations run after serving starts with bounded tri-state probes, so operator evidence never blocks auth or conflates network failure with disabled configuration.
- Strict readiness validates full paginated candidate rows through the same chunk verifier with request-only registered-source reuse; never cache legal permission across requests or cap candidate truth.
- New LIVE product checkout requires the private service-controlled launch row on every request; missing/error means closed, sandbox retains staff authentication, and existing fulfillment never depends on this gate.
- Existing product reversals bind authoritative Stripe environment/payment-intent/session to locked paid ledgers, never the owner's mutable staff role; revocation must not preserve refunded access.
- Refinement models return allowlisted narrative patches; the server preserves source and evidence from the paid base and validates the merged result — avoids regenerating immutable evidence and oversized output.
