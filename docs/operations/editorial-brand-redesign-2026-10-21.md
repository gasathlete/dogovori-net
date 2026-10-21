# Editorial brand redesign — 21.10.2026 (preview only)

Status: done in the preview/source only. **Not published to production.** Version before this work: 0c08fb45b26b485dacf5b80b16fe04ecbec75c6c (recorded during the pass); this work is newer and is committed by the platform. Credit cost: not measured by tooling in this session.

## Direction
Warm ivory paper with deep ink for new visitors; a flat deep-ink dark theme that is kept when the visitor saves that choice. Muted brass is used only for small marks (numbers, rules). No gradients, glows, glass, dotted/grid textures, large rounded panels, scroll animation, automatic carousels or English uppercase labels.

## Header wordmark
- `src/components/HeaderWordmark.tsx` + `src/lib/headerWordmark.ts`: the exact text "Договори.нет" as vector outlines in one colour (currentColor), with `role="img"` and `aria-label="Договори.нет"`; the home link is labelled "Договори.нет — начало". Size: 218×44 px from 640 px up, 198×40 px on phones, 178×36 below 360 px.
- Source: the Cyrillic glyphs of **Marck Script Regular** (Google Fonts `ofl/marckscript`, Copyright (c) 2011 Denis Masharov & Marck Fogel). Outlined with fontTools (no HarfBuzz available). Letter spacing adjusted per letter (tighter о/г/в/е/т, more space after the period). The font file is not shipped. Licence: SIL OFL 1.1, copy at `public/licenses/MarckScript-OFL.txt`. The reserved font name is not used for the derived artwork.
- The old ДН monogram/BrandLogo stays for the footer and other places. Logos inside customer documents are unchanged.

## Visual system (`src/index.css`, "EDITORIAL BRAND" block at the end)
Ivory/ink colour settings for the light theme and flat ink for the dark one; brass at 31% lightness in light mode for ≥4.5:1 contrast. Corners: 4–6 px. Primary action: solid ink (`.btn-gold` restyled). Underlined ink links (`.link-ink`). Section labels in normal case. Gradient text, glows, blur/glass, decorative blobs, radial textures, pulsing dots, sheen/shimmer and scroll animation are switched off. The emerald plan accent now uses ink. New visitors start in light (`index.html` no-flash script + `useTheme`); a saved choice still wins. The theme button label is now in Bulgarian.

## Home page
- Order: Hero → registered companies → Sector packages → Situation kits → Products and plans → DogovaryAI → FAQ → footer (same on phone and desktop). Removed from the home page only (pages/routes unchanged): AdSpotlight, BrandedDocumentShowcase, FeaturedBlanks, PlatformCapabilities, Testimonials, PainSolution, ComparisonTable, ComplianceSection, CTABand and every BackdropSection. Space reserved for not-yet-loaded sections was resized to match.
- Hero: left-aligned exact H1 "По-малко бюрокрация. Повече време за Вас." (no gold italic), mission, the working `?q=` search with "Намерете документ", quick searches and the action links. The framed rental demo was replaced by a numbered "Започнете от задачата" index of real package/search links, plus the shared CATALOG_REVIEW_STATUS line. The one-time products appear as a priced list with links to the samples (prices from `lib/products`: 2,99 / 3,99 / 7,99 €).
- Packages: two-column service entries separated by rules, with stages and available/planned counts. Kits: an index list with small existing photos. Products and plans: a plans table from `lib/pricing` plus links to /produkti and /plans. DogovaryAI: a printed sample excerpt with sources and the AI/"not legal advice" disclosure; no chat bubbles. Partner logos: a static row, no marquee. FAQ: left-aligned, separated by rules.

## Other public pages
Shared header, colour settings and resets apply to the catalog, products, plans, packages, kits and blog. The catalog and plans headings are now left-aligned. The animated aurora on the plans page and its gradient heading were removed. Tools, admin, the editor and document rendering were only re-coloured, not redesigned.

## Unchanged
Addresses, canonical links, metadata, auth, cookie consent, bottom navigation, payment and launch rules, the uniform "В преработка" status, the analytics search-privacy fix, the database, edge functions, dependencies and bun.lock.

## Verification
- `tsgo` app typecheck: passed. Focused tests passed: mobileConversion, visualClarity, sectorPackagesExperience, p2Conversion, products, productPages, productResultPreview, copyCorrectionPass, homeShell, logo (+ a new HeaderWordmark test), positioningOffer, gate8PublicOffers, catalogQueryUrl, analyticsNoSearchText. Tests that relied on the old composition were updated to the new order. One stale p2 assertion (`to="/catalog"` → `action="/catalog"`) was also fixed.
- Local browser (Playwright, localhost:8080): fresh light and saved dark at 1440/768/390/360. The wordmark rendered unclipped at 218×47 / 198×40 px; no horizontal overflow at any width. Whole home page scrolled; no blank gaps were seen. Search with Enter and with the button → /catalog?q=… with matching results; Back works; the task link opens /paketi/uslugi-svobodni-profesii; the product sample page /produkti/proverka-predi-podpis opens; the 360 px phone menu opens; the theme toggle switches and saves. Also viewed: the catalog, plans, package, kits and blog pages. Screenshots: `/tmp/browser/ed/` (sandbox only, not uploaded).
- Not checked: the cloud preview URL (needs Lovable sign-in), signed-in views, admin/tools pages in detail, and a full build run (the platform build runs on its own).

## Known remaining items
Inner product/package pages still use some older bordered panel components, and the blog keeps its photo grid; they now use the new colours and corners but were not restructured. The "–20%" price label is still a small rounded mark from the shared ProductPrice component.
