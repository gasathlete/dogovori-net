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

## Deferred
Header restyle, sector package/kit card restyle, products section, catalog cards, FAQ/footer and section-height reduction.
