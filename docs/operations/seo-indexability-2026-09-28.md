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

## Search Console boundary

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

### Remaining priorities

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
