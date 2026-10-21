# Home theme and content balance — preview only

Owner feedback: retain the current stronger design, recover useful content density, avoid fragmented light/dark surfaces.

## Changes
- Completed foreground/card/muted/action/border token scopes for the platform demonstration. Its preview follows the active theme: paper in light, ink in dark; no bright paper interruption inside the dark workflow section.
- Reduced duplicated headings/branding and vertical spacing in the new product/workflow bands, preserving the carousel, fictional demonstrations, prices and controls.
- Added concise, factual plan selection context to the previously sparse left column and linked plan names to the existing plans page.
- Mobile comparison is an expandable breakdown per product instead of three repeated full lists. All existing inclusion rows remain reachable; desktop comparison stays visible.
- Sector packages have smaller mobile thumbnails and move the verbose stage list to desktop; the full cycle remains on each package detail page. Availability counts and outcomes stay visible.

## Verification
- 32 tests passed: productShowcase, homeToolExperience, visualClarity.
- Latest automatic build 14:19:17 UTC: build OK. No manual builds/typechecks.
- Chromium at 1280×1800 and owner viewport 393×706, light/dark: product tab selection, workflow branding tab and live calculator input exercised. VAT 100 → 120.00 EUR in all four combinations; no horizontal overflow or page errors.
- Mobile comparison expanded and collapsed through native summary controls. Theme checks explicitly changed the document theme class to inspect both palettes, not the persistent theme-toggle flow.
- Screenshots reviewed in `/tmp/browser/theme-balance/`. Final dark preview: background RGB 24/28/37, foreground 240/237/229, muted 204/196/184. Light preview: 252/251/248, 21/27/40, muted 90/82/73.

No publication, backend/payment/auth/consent changes, new dependencies or performance/conversion claims.