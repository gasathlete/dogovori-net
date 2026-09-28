# SEO content growth — 2026-09-28

This increment connects practical decision support to the canonical catalog and the four browse-only sector packages. It implements four of the article briefs from `seo-organic-growth-2026-09-28.md` and improves 20 existing document routes.

## Delivered content

| Article route | Purpose | Primary document |
| --- | --- | --- |
| `/blog/opis-na-obzavezhdane-pri-naem` | Room-by-room inventory, worked example, photographs, handover comparison | Inventory appendix to rental agreement |
| `/blog/priemane-na-rabota-po-etapi` | Deliverables, versions, review criteria, objections and additional scope | Handover/acceptance protocol |
| `/blog/zadanie-za-uebsayt-kakvo-da-utochnim` | B2B website brief, testable requirements, dependencies and delivery | Statement of Work |
| `/blog/dlazhnostna-harakteristika-podgotovka` | Responsibilities, reporting, authority, requirements and version handling | Job description |

Each guide contains an original illustrative example, five practical sections, three FAQs, takeaways, source notes, an article-specific catalog CTA and curated related-document links. Existing topic images are reused. The source check is dated 2026-09-28; it does not assert review by a lawyer. All 35 previous article modules are retained unchanged; the publishable article inventory becomes 39.

The 20 exact document routes are declared in `src/lib/templateDiscovery.ts`. Each receives a specific title, description, three preparation points and a related guide. Titles are at most 60 characters and descriptions at most 160. These are preparation notes separate from canonical legal document content. No wizard input, legal document text, entitlement, price or purchase path changes. The original three-route `seo_intent_v1` metadata experiment is preserved.

## Technical changes

- Runtime, metadata generation, sitemap and prerender share the editorial publication predicate. Build consumers share one loader that excludes explicit drafts and undated modules and rejects mismatched filename/slug routes.
- Blog sitemap `lastmod` comes from editorial modified/publication dates, rather than checkout file timestamps. Static BlogPosting uses the same `dateModified` resolver as runtime.
- Static article HTML now includes the visible source list, curated document links and article-specific next step. The 20 preparation sections use the same source data in React and static HTML.
- Post-build verification checks published article/sitemap parity, dedicated article HTML, source/document/CTA links, modification dates and all 20 preparation sections.
- Six regression tests exercise real draft exclusion, route parity, slug validation and canonical relationships. The old hard-coded 35-article test now permits approved content growth while retaining uniqueness and ordering checks.

## Evidence and release boundary

Local focused suite: 40 tests passed across four files. TS/TSX syntax transpilation passed for the changed pages and build scripts. Local sitemap execution is unavailable in the partial source checkout because generated catalog dependencies are absent; the complete production build and SEO verification are required in GitHub CI before merge.

Expected inventory after a successful full build: 769 sitemap URLs, of which 39 are articles (previous baseline: 765 / 35). These are build inventories, not observed Google-indexed pages. Search Console indexing, traffic and conversion data have not been accessed.

Production publishing remains coordinated with the concurrent security release: the shared deployment operation cannot pin only this SEO commit. Do not infer that merge or a green build means the live domain was updated. Record the exact CI, merge and deployment status below once verified.

## Sources used for the new guides

- https://justice.government.bg/home/normdoc/2121934337 — ZZD art. 233 and 264; relevant official text retrieved through search. Direct page/PDF fetch returned 502 during this session.
- https://www.mlsp.government.bg/uploads/24/tpoout/kt.pdf — Labour Code art. 127(1)(4); official PDF inspected.
- https://www.mlsp.government.bg/trudovo-pravootnoshenie-izmenenie — official explanation of Labour Code art. 118/119; page inspected.
- https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Testing/Introduction — agreed browser/device testing scope; official MDN text retrieved.

The examples and preparation workflows are editorial practical suggestions; they are not presented as statutory forms or universal legal outcomes.

## Build prerequisite repaired

The initial CI run stopped before tests/build because main's package.json security overrides were newer than bun.lockb. Migrated the current npm lock to Bun 1.4.2's text bun.lock, retained package.json and all nested overrides, and removed the obsolete binary lock. The new lock uses public npm tarball locations with the existing integrity hashes instead of environment-specific Lovable cache URLs. No dependency manifest or security rule was relaxed. Local `bun install --frozen-lockfile --ignore-scripts` succeeds; CI will perform the complete install and build.
