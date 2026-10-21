# Editorial finishing / performance — 21 October 2026

Preview/source changes only; no publication, backend, auth, payment, consent, legal-content, dependencies or lock changes.

## Versions
Entry HEAD: `ef19f4ee28a60d2740309965f8a55e007ad88b03`, newer than the supplied observed version. Functional edits were platform-recorded through `874378288961041ff5311caba0b60b233880dcf2`; the final verification/test and documentation commits are recorded automatically after this note. No manual Git mutations. Actual task credit cost is unavailable; no estimate presented as a charge.

## Finished surfaces
- Product detail: open price line with original/current price and exact discount, plain secondary link, wider readable sample, ruled steps/result sections/FAQ/related entries instead of repeated enclosing cards.
- Sector package: quiet heading, stage labels and sequential ruled document entries; existing/planned distinction and canonical links retained.
- Kit detail: removed decorative TOP/sparkles and icon container; staged reading index, ruled preparation/guidance, clear optional/planned entries. Warnings and actual preparation action retained.
- Sample results: paper document presentation, no nested ordinary panels; severity and redline distinctions retained. Variants/tabs use existing Button controls, wrap on mobile and retain keyboard semantics. Fixed an actual CSS regression: utility display rules exposed hidden sample tab panels; scoped `[hidden]` protection now preserves exactly one visible panel.
- SEO footer: existing outlined calligraphic wordmark, readable link spacing, corrected responsive column count (six real columns), phone bottom clearance. Original monogram and customer-document logos untouched. Mobile navigation itself unchanged.
- CSS additions are scoped to public detail/sample classes; no system-wide rewrite. Removed negative heading letter spacing. Home content, search/history, catalog status and analytics privacy remain unchanged.

## Performance baseline and after: blocked, not an improvement claim
Original pre-edit record: `reports/perf/editorial-polish/baseline.json`.

The supported existing script `scripts/perf/lighthouse-median.sh` requires a production `dist` served by Vite preview on port 4173. This sandbox exposes **no dist**, no production preview listener and no installed Lighthouse. Platform instructions prohibit running project builds/typechecks manually; the automatic harness reports `build OK` but does not expose an artifact here. No dependencies installed and no development measurements substituted for production numbers.

| Local mobile production lab | Before | After |
|---|---|---|
| Score / LCP / CLS / TBT | unavailable | unavailable |
| Initial transfer / JS bytes / font requests | unavailable | unavailable |
| Comparable throttled runs | 0 | 0 |

No measured dominant production cost established; therefore no speculative font, preload, catalog-loading or network optimization applied. The next measurement needs the current production artifact served on 4173, then identical cold-cache 390px runs using the existing median script before any speed intervention. These are local-lab requirements, not production field data. Historical reports were not reused as this task's baseline.

## Verification
- Seven focused test files, **60 passed**: productPages, productResultPreview (additional selected-panel regression), sectorPackagesExperience, homeShell, catalogQueryUrl, analyticsNoSearchText, logo.
- Automatic harness build OK after edits. Independent app typecheck and complete SEO/prerender build pipeline are **not verified**: unavailable under harness-only instructions.
- Native Playwright at localhost:8080, 390/1440/360 in light and saved dark (`dogovori:theme`). Home, both interactive product samples, package and kit inspected; real Enter and button searches arrived at `/catalog?q=…`, catalog input retained the query and real template links rendered. Phone menu opened. No horizontal overflow, clipped wordmark or page errors across the six combinations. Home scrolled through pending sections to footer; no pending sections remained.
- Fresh screenshots inspected: `/tmp/browser/polish/` (sandbox evidence, not Library). Initial cookie banner remains visible in some captures; consent behavior was not modified.
- Product variants and negotiation letters genuinely switched through the UI. No purchase, email or signature executed.
- Cloud preview behind login, signed-in pages, production field speed and browser performance improvement are not claimed. Blog/catalog browsing layouts were not restyled in this bounded package.