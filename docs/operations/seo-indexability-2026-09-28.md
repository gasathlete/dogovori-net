# Organic content wave 3 and public indexability audit

## Scope

Eight original practical articles complete the twelve approved briefs (three per sector package). They cover rental return/renewal, service scope/additional work, digital change requests/handover and equipment/role changes. They reference existing canonical catalog entries and the relevant package, reuse existing topic images, include sources and distinguish practical suggestions from legal requirements. No invented lawyer approval, new legal templates, purchase activation, customer-data changes or AI processing.

Expected source inventory: 47 published blog modules and 777 sitemap URLs. These are not Google-indexed counts.

## Public observations and changing deployment

First read-only audit, 28 September 2026 around 20:44 UTC: deployment `3e6eb592-86a7-4bf7-91ff-3523914b1c7f` exposed 735 unique URLs across six child sitemaps: 29 static, 46 category/sector, 625 templates and 35 articles. Homepage, catalog, blog index, rental package and the sampled acceptance-protocol document returned HTTP200 with correct self canonicals. The rental kit and wave2 inventory article returned homepage HTML/canonical. Googlebot was allowed by the wildcard robots group; OAI-SearchBot was blocked.

While this task continued, an independent deployment became public: `a26860c8-3f03-498c-8b33-60ed631b1fcc`. A repeat audit saw 769 sitemap URLs, correct dedicated canonicals for `/komplekti/naem-zhilishte` and `/blog/opis-na-obzavezhdane-pri-naem`, and `OAI-SearchBot: Allow: /`. The earlier missing wave2 release findings are superseded by these observations; this task did not initiate that deployment.

The upgraded monitor checked 22 public URLs (16 fixed targets plus six sitemap samples): four canonical errors and thirteen warnings. One real existing error was `/contacts` returning the homepage canonical. Three errors were expected probes of the new unpublished wave3 articles. Warnings were mostly editorial title/description length, plus the unknown-route HTTP200 SPA fallback. This is a sample, not a crawl of every page and not Google's rendered URL Inspection.

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

Local focused tests:49 passed across five files, including nine new indexability/sitemap regressions. Generated lightweight metadata contains47 articles. Full build/typecheck/security/application/Edge validation is required in CI for the exact PR head. Record the result below; no deployment claim is implied by a merge.

## Source notes

- Google sitemap documentation: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap — accurate significant-update dates; priority/changefreq ignored; sitemap is a hint, not guaranteed indexing.
- Google canonical documentation: https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls
- Google SPA/soft404 guidance: https://developers.google.com/search/docs/crawling-indexing/javascript/javascript-seo-basics
- ZZD official text: https://justice.government.bg/home/normdoc/2121934337 — article233 return of rental property;20/20a interpretation/change. Direct fetch502, relevant official passages retrieved via search.
- MТСП: https://www.mlsp.government.bg/trudovo-pravootnoshenie-izmenenie — written agreement for employment changes; not an exhaustive administrative checklist.
- OWASP: https://cheatsheetseries.owasp.org/cheatsheets/Secrets_Management_Cheat_Sheet.html — restricted access, secure transfer and revocation.
- MDN: https://developer.mozilla.org/en-US/docs/Learn_web_development/Extensions/Testing/Introduction — agreed browser/device checks.

Practical examples are fictional and editorial; none is a statutory form or guaranteed legal outcome.
