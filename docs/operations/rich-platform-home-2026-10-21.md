# Rich platform homepage — preview only

## Restored and reused
- `ProductShowcaseCarousel` with `ProductResultPreview`: real demonstration data, findings, before/after and three strategy choices, negotiation plan/actions/letters, canonical prices and intake links. Existing pause, keyboard, swipe, hidden-page and reduced-motion behavior retained.
- `ComparisonTable` restored with a truthful comparison of our three canonical product outputs. Removed old unsupported lawyer prices/timing, legal-validity and available-signing claims instead of republishing them.
- Existing calculator compute functions for VAT, notarial fees and paid leave in an interactive home tab section. Results update locally; no submitted inputs or analytics added.
- Platform workflow carousel/tabs: catalog query links, document preparation steps, sample folder organization and fictional corporate branding. Uses approved calligraphy/mark. Existing account/build routes retain their own authentication and disclaimers. Signing is explicitly unavailable without D-Trust integration.
- Existing packages/kits remain immediately after social proof. Then plans → product demonstrations/comparison → platform workflows → calculators → DogovaryAI → FAQ. New sections lazy-load below the fold.

## Files
New: `src/components/home/ProductExperience.tsx`, `PlatformExperience.tsx`, `ToolExperience.tsx`, `src/test/homeToolExperience.test.tsx`.
Updated: `src/components/home/HomeSections.tsx`, `src/components/ComparisonTable.tsx`, `src/index.css`, `AGENTS.md`, `roadmap.md`.

The older `PlatformShowcase`, `PlatformCapabilities` and `BrandedDocumentShowcase` were inspected, but not mounted unchanged: their content includes unsupported signatures, certification-like stamps, unrelated metrics or obsolete claims. Useful workflow/branding presentation concepts were retained without those statements.

## Checks
- 32 tests passed across productShowcase, visualClarity and homeToolExperience. Existing carousel tests cover rotation, pause, swipe, reduced motion and product truth. New calculator test asserts 100 EUR at 20% yields 120.00 EUR and the exact calculator destination.
- Automatic build/typecheck latest 14:12:12 UTC: build OK. No manual build/typecheck or dependency changes.
- Local Chromium at 1280×1800 and 390×844: product selection → improve; ArrowRight → full package; dispatched mobile touch swipe → check. Pause control exercised. Workflow branding link is `/account?tab=branding`. VAT input 100 → `120,00 €`; changing tab renders notarial output `6,00 €` for its default inputs. No page errors or horizontal overflow. Screenshots reviewed; low-contrast workflow preview corrected and rechecked.
- `/tmp/browser/rich/` holds sandbox-only browser scripts, results and screenshots.

## Limits
No publication, payment/config/auth/security changes, new media or dependencies. No marketing statistics, performance gains, conversion lift or legal guarantees claimed. Payment/entitlement flows were not rerun for presentation-only work. Mobile swipe verification uses dispatched browser touch events, not a physical phone. Dark-mode review of these new sections was not separately captured; they use existing semantic tokens plus explicit navy/paper preview scope.