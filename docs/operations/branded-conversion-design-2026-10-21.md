# Branded conversion pass — preview only

## Delivered
- Approved ДН geometry alongside unchanged licensed Cyrillic calligraphy; larger desktop lockup and mobile sizing that accommodates the expanded menu button.
- Search-first home with a native paper demonstration on navy. Reuses existing fictional preview data, explicitly labels the example and fictional parties, with no signatures, seals or certification claims.
- Product presentations show tangible output summaries, canonical prices/discounts, examples and the existing per-product intake actions. Closed-state actions still resolve to details; no availability flag changed.
- Shared public header, both footers, product cards/comparison entries and home plans band carry the same identity. No backend, auth, payment, analytics, dependency or legal-document changes.

## Changed source files
`src/components/BrandLockup.tsx`, `Header.tsx`, `Hero.tsx`, `Footer.tsx`, `SeoFooter.tsx`, `home/ProductsSection.tsx`, `products/ProductOutputVisual.tsx`, `products/HeroProductRail.tsx`, `products/ProductComparisonList.tsx`, `products/ProductCard.tsx`, `src/index.css`.

Supporting files: `src/test/brandedProductActions.test.tsx`, `src/test/mobileConversion.test.tsx` (removed obsolete exact-height styling assertion), `AGENTS.md`, `roadmap.md` and this report.

## Verification
- Five focused files: 62 tests passed, covering product destinations/prices, existing home behavior, wordmark and analytics search privacy. New destination test rerun after the test typing correction: 1 passed.
- Automatic harness build/typecheck: latest entry 2026-10-21 14:08:05 UTC `build OK`; the earlier invalid test-only `exact` property was corrected. No manual build/typecheck executed.
- Local Chromium: 1280×1800 desktop and 390×844 mobile, light/dark. No horizontal overflow on home, products, plans or catalog. No page errors.
- Search submitted with `наем` reaches `/catalog?q=…`; product action reaches sign-in with the correct `/produkti/proverka-predi-podpis/start` return address. Mobile menu opens; screenshots reviewed for calligraphy, contrast, sample/product layout and footer.
- Screenshots and scripts under `/tmp/browser/brand/`; sandbox-only, not public deliverables.

## Limits
Not published. No new payment or signed-in entitlement test: this was a presentation-only pass. No measured performance or conversion improvement claim; no new fonts, external media, animations or dependencies. Production timing comparison remains separately blocked as previously documented. Detailed internal catalog/plan layouts retain their existing design with the upgraded shared shell.