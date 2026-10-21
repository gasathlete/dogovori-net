# Homepage commerce redesign — 21 October 2026

## Implemented
- Ink navy hero, antique-gold search action, strengthened approved calligraphy/monogram, compact quick tasks. Preserved exact H1, mission, catalog search destination and SEO metadata rather than replacing them with suggested copy.
- Replaced the dominant risk finding with a three-step, explicitly fictional document illustration using canonical preview data. Manual controls, swipe and native keyboard tabs; no automatic rotation, requests or saved inputs.
- Image-led sector and scenario shelves using existing assets/destinations, visible previous/next buttons and native scroll-snap. Existing available/planned counts and launch notices remain.
- Compact early product choices retain exact canonical prices and actual gate-dependent actions. Existing product carousel, before/after preview, product comparison, platform tabs and calculators retained without duplicate experiences.
- Added concise factual template/creation/kit comparison without invented price, guarantee or integration.
- Header catalog action at wide desktop; existing mobile bottom navigation and cookie controls unchanged.

## Exact changed project files
- `src/components/Hero.tsx`
- `src/components/Header.tsx`
- `src/components/home/DocumentWorkflowStage.tsx` (new)
- `src/components/home/BrowseShelf.tsx` (new)
- `src/components/home/SectorPackages.tsx`
- `src/components/LifeScenarios.tsx`
- `src/components/products/HeroProductRail.tsx`
- `src/components/home/ProductExperience.tsx`
- `src/index.css`
- `src/test/homeCommerceInteractions.test.tsx` (new)
- `AGENTS.md`, `roadmap.md`, this report

Owner visual direction also recorded in project memory. No backend, authentication, payment, dependency, lockfile or metadata edits.

## Actual checks
- Vitest: 4 files / 34 tests passed (`homeCommerceInteractions`, `productShowcase`, `homeToolExperience`, `visualClarity`). Existing carousel suite emitted non-failing React act warnings.
- Automatic harness latest entry at 15:26:11 UTC: `build OK`. No manual build or standalone typecheck performed; no independent typecheck result claimed.
- Chromium 1440×1800 and 390×844, explicitly light/dark: search `наем` navigated to `/catalog?q=%D0%BD%D0%B0%D0%B5%D0%BC`; steps advanced, keyboard ArrowRight selected the next step, demo CTA scrolled to the stage; package and kit next controls moved the shelves. No horizontal page overflow or page errors in all four combinations. Screenshots inspected; low-contrast light-theme hero input and crowded desktop header corrected before the final rerun.
- Native phone swipe and reduced-motion hardware behavior not separately tested; implementation uses native overflow and preference-aware scrolling. No conversion lift or performance gain claimed.
- Browser artifacts: `/tmp/browser/commerce/` (sandbox only).

## Delivery
Automatic source commits include `0e6d52946bc2c9abd8d54e4ee7558662d98eff81` for the final comparison/input/test correction; earlier changes were also automatically committed. Documentation receives a subsequent automatic commit. No manual Git state operations. **Not published.** Production/backend flags unchanged by this pass.