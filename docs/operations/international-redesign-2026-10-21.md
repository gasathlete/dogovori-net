# International redesign — first pass (21.10.2026)

Status: preview source only, not published to production.

## References (self-reported competitor figures, never Dogovori.net metrics)
| Reference | URL | Self-reported scale | Decision taken |
|---|---|---|---|
| LawDepot | https://www.lawdepot.com/ | 13m+ users, 41m+ docs | Search-first hero with quick queries |
| Rocket Lawyer | https://www.rocketlawyer.com/legal-documents | 30m+ served | Task cards grouped by life/business area |
| PandaDoc | https://www.pandadoc.com/ | 68k+ customers | Real product preview beside the headline |
| Juro | https://juro.com/ | 3m contracts | Demonstration clearly labelled as such |

No text, assets or branding were copied.

## Implemented
- Home hero: split desktop / stacked mobile; exact H1, mission and "Намерете документ" → /catalog (with `?q=` when typed, URL-encoded; analytics stores only `has_query`).
- Quick queries and 4 task cards using existing routes (/paketi/naemi, /paketi/uslugi-svobodni-profesii, /paketi/sluzhiteli-rabotodateli, /catalog?q=пълномощно).
- HTML "Примерен документ · Демонстрация" panel with "В преработка" and the exact warning.
- Removed the pen poster/video backdrop and its index.html preload (no orphan preload).

## Second pass
- Catalog now reads ?q= from the web address, fills the search box from it, follows back/forward and keeps the other filters (`withCatalogQuery`, test `src/test/catalogQueryUrl.test.ts`).
- The hero search now uses a real submit button (form action /catalog, name=q). Status and warning text come from CATALOG_REVIEW_STATUS. The "Вижте демонстрацията" button is back.
- Browser checks: the hero button opened /catalog?q=пълномощно with the field filled and 12 matches; typing updates q; the quick search "услуги" fills the field; the "Наеми и имоти" card opens /paketi/naemi; the 360 px light theme and the mobile menu are readable, with no sideways scrolling.

## Third pass (final)
- Header: a plain flex row instead of the three-column grid; menu links are 44 px tall with visible focus. Продукти/Планове stay side by side, and the mobile menu now shows "Каталог с шаблони" in its main list.
- SectorPackages: a clean card with a 48 px thumbnail and icon, a 22 px title, 12 px stage labels, and the real availability counts and /paketi links.
- LifeScenarios: 3/2/1 columns, 64 px thumbnails, 16 px titles, 12–14 px details and links, and motion only when the visitor allows it. "Show more" and "All kits" are kept.
- HeroProductRail: the blurred glow is removed and the card style matches; prices, status and product links are unchanged.
- HomeSections placeholder heights were not changed (no large gaps seen in screenshots).
- Tests: type check `bunx tsgo --noEmit -p tsconfig.app.json` passed with no errors. Ran 5 test files (catalogQueryUrl, visualClarity, homeShell, products, mobileConversion); 3 checks in mobileConversion still expected the old link-based button and were updated to the form action. Final result: all pass.
- Browser (localhost, /tmp/browser/r/f.py): dark and light at 1440/768/390/360 have no sideways scrolling (f_/p_/s_*.png). Частно лице and Фирма both keep the same H1, mission and "Намерете документ". Enter → /catalog?q=наем with the box filled and results shown; typing updates q; Back → /; Forward → /catalog?q=пълномощно with the box filled. Product card → /produkti/proverka-predi-podpis with the sample shown.

## Not restyled
FAQ, footer, inner catalog/detail pages, tools and admin. Core public home surfaces were restyled, not every screen. Preview only; not published.
