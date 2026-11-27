# Organic content wave 3 and public indexability audit

## Scope

Eight original practical articles complete the twelve approved briefs (three per sector package). They cover rental return/renewal, service scope/additional work, digital change requests/handover and equipment/role changes. They reference existing canonical catalog entries and the relevant package, reuse existing topic images, include sources and distinguish practical suggestions from legal requirements. No invented lawyer approval, new legal templates, purchase activation, customer-data changes or AI processing.

Validated source and live inventory:47 published blog modules and777 sitemap URLs. These are not Google-indexed counts.

## Public observations and changing deployment

First read-only audit, 28 September 2026 around 20:44 UTC: deployment `3e6eb592-86a7-4bf7-91ff-3523914b1c7f` exposed 735 unique URLs across six child sitemaps: 29 static, 46 category/sector, 625 templates and 35 articles. Homepage, catalog, blog index, rental package and the sampled acceptance-protocol document returned HTTP200 with correct self canonicals. The rental kit and wave2 inventory article returned homepage HTML/canonical. Googlebot was allowed by the wildcard robots group; OAI-SearchBot was blocked.

While this task continued, an independent deployment became public: `a26860c8-3f03-498c-8b33-60ed631b1fcc`. A repeat audit saw 769 sitemap URLs, correct dedicated canonicals for `/komplekti/naem-zhilishte` and `/blog/opis-na-obzavezhdane-pri-naem`, and `OAI-SearchBot: Allow: /`. The earlier missing wave2 release findings are superseded by these observations; this task did not initiate that deployment.

The upgraded monitor checked 22 public URLs (16 fixed targets plus six sitemap samples): four canonical errors and thirteen warnings. One real existing error was `/contacts` returning the homepage canonical. Three errors were expected probes of the new unpublished wave3 articles. Warnings were mostly editorial title/description length, plus the unknown-route HTTP200 SPA fallback. This is a sample, not a crawl of every page and not Google's rendered URL Inspection.

A full, read-only initial-HTML crawl of all769 sitemap URLs followed at21:10–21:13UTC on deployment `a26860c8-3f03-498c-8b33-60ed631b1fcc`. Sitemap traversal had no problems. It found exactly five canonical mismatches: `/contacts`, `/terms`, `/privacy`, `/cookies`, `/refund`, each initially canonicalizing to the homepage. No sampled-only inference is needed for these routes. Other findings were654 title-length warnings and4 description-length warnings; these editorial limits are not Google indexing thresholds. No HTTP status, HTML type, title-presence or noindex error was detected across the769 requests by this checker. This is still not a Google coverage or rendered-inspection report.

HTTP root redirects to HTTPS with301; www HTTPS redirects to apex with302; `/catalog/` responds200. Prefer permanent www normalization after hosting support is confirmed, but302 alone is not proof of exclusion. Unknown routes currently return200 with homepage initial HTML; React NotFound has noindex after rendering. A server-level404 remains the preferred hosting follow-up; no hosting routing changes were made here.

## Corrections

- Sitemap generator uses canonical templateIndex routes. Preserves all content groups and public-route membership, rejects duplicate URLs, excludes explicit drafts via the shared publication loader.
- Removes checkout filesystem modification dates and build-date fallbacks. Article lastmod remains its editorial modification/publication date. Other optional dates are omitted until a reliable significant-change ledger exists. Sitemap index dates are omitted rather than confusing the newest article date with sitemap-file modification.
- Removes unsupported claims that priority/changefreq or smaller sitemaps control Google's crawl rate. The XML writer omits these ignored hints.
- Public SEO monitor no longer treats private `/build` and `/auth` as indexable targets. It covers packages, kits and representative guides, checks canonical equality/count, Googlebot/robots directives, HTTP X-Robots-Tag, status, content type and meta refresh. It reports redirects without following them, imposes20-second request timeouts and treats missing/empty/broken sitemaps as errors.
- `/contacts` receives dedicated initial HTML, canonical and ContactPage schema. Public company/contact facts are shared with its existing React page. Existing legal content and response commitments are unchanged. Four other legal sitemap routes remain SPA-only in the previous build and need separate content-parity work; do not claim every route is fully prerendered.

## Initial Search Console boundary (superseded by the follow-up below)

GSC Wizard was connected by the user during this task. Its plugin resource is present, but its Search Console actions were not exposed in the current executable tool registry at the time of this report. No property, URL Inspection result, performance metric or indexed-page count has been retrieved. Do not claim it is unconnected or infer Google coverage from site: search results. Continue through the connected integration when its actions become available; prioritize the four packages, four kits, twelve guides and the twenty enriched document routes.

## Validation and release

Local focused tests:49 passed across five files, including nine new indexability/sitemap regressions. Generated lightweight metadata contains47 articles.

PR#10: https://github.com/gasathlete/dogovori-net/pull/10. Final head `48f39092158bec454630b10ab71cf50b26e1f9b5`; merged as `9aebd1498dc37e30842f90530a5d147f7a4d3153`. The head-to-merge comparison has no file differences. The initial CI attempt found one existing source-format guard expecting an explicit product sitemap entry; implementation was adjusted without weakening that test, then the full suite was rerun.

- Build/typecheck/prerender/SEO verification: success;777 sitemap URLs,47 articles,773 prerendered pages. Existing warnings:654 long titles,4 long descriptions,4 SPA-only legal routes.
- Application tests:2007 passed,4 skipped across156 files. Additional checkout, parser, conversion and continuity suites passed. Edge shared suite:1010 passed,0 failed; draft typecheck and wizard audit passed (no CRITICAL findings).
- Security scan, dependency audit and security-shield regression: success. PR public-headers job skipped by its existing workflow condition; this is not claimed as an executed headers audit.
- Runs: build https://github.com/gasathlete/dogovori-net/actions/runs/36484238220 ; tests https://github.com/gasathlete/dogovori-net/actions/runs/36484238264 .

Lovable synchronized the exact merge SHA and reported ready/agentFinished before the publication request. Production deployment `d7858f79-1d30-4e5f-9ac9-fcc8dee59fe3` was requested; the immediate response was pending. A merge or a pending publication is not proof of live release. Post-publication evidence is recorded below when observed.

### Confirmed public release

At21:20–21:23UTC, a second full read-only crawl checked all777 live sitemap URLs on deployment `d7858f79-1d30-4e5f-9ac9-fcc8dee59fe3`, including all47 article routes. No sitemap traversal problems. All777 returned200 HTML with a nonempty title and no blocking noindex directive detected by this initial-HTML checker. All eight new articles passed; `/contacts` now returns its own title and canonical `https://dogovori.net/contacts`.

Exactly four canonical mismatches remain: `/terms`, `/privacy`, `/cookies`, `/refund`, each initially canonicalizing to the homepage. Warnings remain654 long titles and4 long descriptions. The unknown-route probe still returned200 with homepage canonical on the new deployment. Robots.txt allows public crawling through the wildcard group, keeps private paths disallowed and declares the sitemap index.

The protected Lovable preview returned401; no access bypass was attempted. Release validation above uses the public production domain, not that preview.

### Priorities at the end of wave 3 (follow-up below)

1. Fix initial HTML/canonicals for the four existing legal-policy routes while preserving their exact approved text and React parity.
2. Confirm hosting support and return genuine404 status for nonexistent routes; retain React noindex handling as defense in depth.
3. Obtain actual Search Console coverage and representative URL Inspection through GSC Wizard when its actions are exposed, or an explicitly approved browser fallback. No indexing request or sitemap submission was made through GSC in this task.
4. Edit long public titles/descriptions for clarity and intent, prioritizing revenue-facing package/document pages. Do not truncate legal document names indiscriminately or treat character-count warnings as indexing bans.

## Source notes

- Google sitemap documentation: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap — accurate significant-update dates; priority/changefreq ignored; sitemap is a hint, not guaranteed indexing.
- Google canonical documentation: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- Google SPA/soft404 guidance: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- ZZD official text: https://justice.government.bg/home/normdoc/2121934337 — article233 return of rental property;20/20a interpretation/change. Direct fetch502, relevant official passages retrieved via search.
- MТСП: https://www.mlsp.government.bg/trudovo-pravootnoshenie-izmenenie — written agreement for employment changes; not an exhaustive administrative checklist.
- OWASP: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html — restricted access, secure transfer and revocation.
- MDN: https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Testing/Introduction — agreed browser/device checks.

Practical examples are fictional and editorial; none is a statutory form or guaranteed legal outcome.

## Follow-up: actual Search Console evidence and remaining implementation

Read through the user-approved browser fallback on 28 September 2026 UTC (29 September in the account's Bulgarian display). Property: `https://dogovori.net/`. The connected GSC plugin's actions still were not exposed; browser access succeeded without changing authentication or permissions.

### Google coverage, report last updated 21 September 2026

**730 indexed and 292 not indexed, across 1,022 known URLs.** This is an older Google report, not a count of the current 777 canonical sitemap URLs, and not evidence of gains from the new release.

| Exclusion reason | URLs | Observed evidence / treatment |
| --- | ---: | --- |
| Blocked by robots.txt | 127 | The ten visible examples are wizard / bilingual-wizard and product-start routes. Keep these private flows blocked; this sample does not classify all 127. |
| Crawled, currently not indexed | 27 | Visible examples include EN template/blog/catalog aliases and a Bulgarian vehicle power-of-attorney page. Canonical correction helps aliases, but Google still decides whether to index the main page. |
| Alternate with proper canonical | 9 | Not automatically an error; do not force duplicates into the index. |
| Redirect | 7 | Not automatically an error; evaluate destination rather than force-indexing a redirect. |
| Excluded by noindex | 5 | Do not remove exclusions blindly. |
| Duplicate, no user-selected canonical | 48 | Visible examples include `/en/shablon/distributorski-dogovor`, `/en/shablon/dogovor-za-posrednichestvo-pri-sdelka-s-imot`, and `/en/catalog?vid=power_of_attorney`. Last crawls in the visible sample were in August. |
| Discovered, currently not indexed | 69 | Visible examples include `/contacts`, `/kategoria/punomoshtni`, and several existing practical blog articles. No last crawl was shown for these examples. |

Sitemap report before resubmission: all five submitted entries show **Success**. The index was last read 27 September with 729 discovered URLs; the blog child showed 35 (last read 28 September), categories 46, legacy templates child 131, and static child 23. Child counts must not be added to the index count because they overlap. Current production sitemap inventory is 777, including 47 articles and additional template children.

URL Inspection for `/contacts`: the stored-index view said the URL was unknown/not indexed. The live smartphone test at **29 September 00:49:07 Bulgarian display** succeeded: fetching allowed, indexing allowed, canonical `https://dogovori.net/contacts`. This proves live eligibility, not that Google has indexed or selected the URL.

URL Inspection for priority package `/paketi/naemi`: **indexed**, Google-selected canonical is the inspected URL, user canonical matches, Googlebot smartphone fetch succeeded, crawling/indexing allowed. Last crawl: **28 September 23:55:06 Bulgarian display**. This individual inspection is more recent than the aggregate 21 September coverage report; do not attribute it to the not-yet-published follow-up.

All four priority packages were individually confirmed indexed with matching declared and Google-selected self canonicals. Smartphone crawling/fetching/indexing succeeded:

| Package path | Last Google crawl, Bulgarian display |
| --- | --- |
| `/paketi/naemi` | 28 September 23:55:06 |
| `/paketi/uslugi-svobodni-profesii` | 28 September 23:55:05 |
| `/paketi/ueb-digitalni-agentsii` | 28 September 23:55:06 |
| `/paketi/sluzhiteli-rabotodateli` | 28 September 23:55:05 |

The employer package's discovery/sitemap field showed a temporary processing error, while its authoritative index status remained **indexed** with the correct canonical. The other three had no referring sitemap shown. The separate sitemap report accepted the index resubmission; do not equate these discovery-field messages with exclusion from Google.

### Code changes (PR #11)

- All four policies render their unchanged approved React components and real layout into initial HTML. Build-only SSR removes browser chrome/analytics imports; browser behavior and legal text remain unchanged. Build verification compares the complete rendered policy bodies.
- Legacy `/en/catalog`, `/en/shablon/*`, `/en/blog` and `/en/blog/*` aliases now receive identical Bulgarian primary-content HTML with BG canonicals. They are not added to sitemaps and are no longer advertised as English translations via hreflang. This fixes the signal; Google must recrawl before its reports change.
- A shared formatter removes optional title boilerplate without cutting precise legal names. Template/product metadata is aligned between static HTML and React. Four long descriptions are rewritten concisely, without dropping pricing/availability qualifications.
- First full build passed with **777 dedicated canonical pages, zero SEO errors, zero long-description warnings, and 151 title-length warnings**, down from 654. Long titles remain advisory: Google has no fixed character-count indexing limit.
- The first complete unit run found one product-copy guard still reading literals from the old location. The shared metadata retains the contract-check phrase and the guard now verifies its binding plus all three intents. No safety tests were removed or skipped to ship this change.
- Security/media changes concurrently committed to main are preserved. No canonical legal document, checkout, customer data, AI operation, robots exclusion, DNS, or hosting setting was changed.
- Before release, concurrent security update `68dd087b` arrived with a rewritten Bun v1 lockfile and failed both frozen-install CI jobs. It differs from its already-audited `cc939e04` predecessor only in `bun.lock`. The SEO branch merges the current security changes and restores the exact v3 lock blob `3cb91ebdf27b01d854f1e3f3a4920d247e30bee5` from that audited commit; package manifests, npm lock and security dependency overrides are preserved. Full checks are rerun on the combined tree; frozen-install protection is not relaxed.

### Hosting boundary

Unknown paths still receive the managed host's HTTP 200 SPA fallback. The existing React NotFound `noindex` mitigation is preserved; Google documents this as a client-rendered error-page strategy. A genuine server HTTP 404 requires a supported hosting/CDN routing rule. No such control is exposed in this project's current repository/integration; no unsupported `_redirects` rule, hosting migration or DNS change was attempted. This remains a separately scoped hosting follow-up, not a fixed item.

Additional primary sources:
- https://developers.google.com/search/docs/appearance/title-link
- https://developers.google.com/search/docs/crawling-indexing/canonicalization
- https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- https://docs.lovable.dev/tips-tricks/external-deployment-hosting

### Search Console submission

The existing `sitemap.xml` index was resubmitted successfully on **29 September 2026 Bulgarian display** (28 September UTC). Google displayed “Sitemap бе изпратена успешно” and the submitted date changed to 29 September. The immediate report still showed its prior last-read date (27 September) and 729 discovered URLs. Do not misrepresent successful submission as a completed fresh crawl or 777 indexed pages. No URL removals, permission changes or bulk indexing calls were made.

### Final combined CI and publication request

PR #11: https://github.com/gasathlete/dogovori-net/pull/11. Final tested head `410a5a7b46e368e4a4924d672e14f01d998e9dba`; merged as `4938d618913d19afb4f9b63eef9815199c896a22` with zero tree differences from the tested head.

- Frozen install, application typecheck, production build, prerender and all 777 SEO URL checks: passed.
- App tests: **2013 passed, 4 pre-existing skips, 157 files**. Checkout, parser, conversion and continuity suites passed. Edge suite: **1010 passed, 0 failed**. Draft typechecks and wizard audit passed, no CRITICAL findings.
- Security scan, dependency audit and shield regression: passed. `public-headers` remained skipped by the existing PR condition; not claimed as executed.
- Build: https://github.com/gasathlete/dogovori-net/actions/runs/36489574406
- Tests: https://github.com/gasathlete/dogovori-net/actions/runs/36489574595

Lovable synchronized the exact merged SHA, reported ready and agentFinished, and accepted publication request `c3aa5c03-0a55-418f-863d-d325ba49c2cb`. The immediate response was pending, not proof of a live deployment. Live evidence follows only after observation.

### Confirmed live follow-up

By **22:08:46 UTC**, the custom production domain returned deployment `c3aa5c03-0a55-418f-863d-d325ba49c2cb`. The public Lovable domain redirects to the custom domain. All four policy probes returned HTTP 200, a single H1, their own page-specific title and correct self canonical.

Legacy alias probes `/en/catalog?vid=power_of_attorney`, `/en/shablon/distributorski-dogovor` and `/en/blog/kak-se-vadi-pik-ot-nap` returned dedicated initial HTML and the intended Bulgarian canonical, not the homepage. A rendered-browser check of the distributor alias confirmed exactly one BG canonical, `lang=bg`, no English hreflang and the correct document H1/title after JavaScript execution.

The unknown-route probe still returned initial HTTP 200/homepage fallback. A rendered-browser check confirmed that React replaces this with the not-found page and exactly one `noindex, nofollow` robots tag. This is mitigation, not a genuine HTTP 404 fix.

**Final full production crawl: 22:09:30–22:12:25 UTC.** Checked all **777 canonical sitemap URLs**, including **47 articles**, all on deployment `c3aa5c03-0a55-418f-863d-d325ba49c2cb`. No sitemap traversal problems, no initial-HTML indexability errors, no canonical mismatches, no blocking noindex directives, and no long-description warnings. The sole warning class is **151 titles above the editorial 60-character target** (previously 654); these include precise legal names and some tool/article titles, and are not claimed as indexing failures. A rendered `/privacy` check also confirmed one self canonical, one correct H1 and all 22 article subsection headings.

### Remaining after this follow-up

1. Genuine HTTP 404 at the hosting/CDN boundary. Existing rendered noindex is verified; no infrastructure change is authorized or performed here.
2. Recheck Google's coverage, duplicate clusters and new article discovery after recrawling. Submission and technical eligibility do not guarantee indexing, ranking or paying customers.
3. Optional editorial refinement of remaining long titles, preserving meaning; do not replace precise legal names solely to satisfy a character-count warning.
