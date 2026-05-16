# Performance optimization plan

Goal: make the app feel **instant** for corporate/dynamic use (repeat visits, multiple tabs, slower 4G/office VPN), while keeping all current content, visuals and functionality identical.

I audited the project. The biggest wins are (in order of impact): oversized public assets, font payload, bundle chunking for heavy libs (jspdf/docx/pdfjs/recharts/radix), eager catalog import on the landing page, missing LCP preload, and no repeat-visit caching layer.

---

## 1. Public assets — instant wins

- `public/favicon.png` is **857 KB** (!) — re-encode to ~10–30 KB PNG/ICO at proper size.
- `public/icon-512.png` 207 KB → re-encode (~30–50 KB).
- `public/apple-touch-icon.png` 28 KB → ~6 KB.
- `public/og-image.jpg` 102 KB → keep JPG but re-encode at q=80 mozjpeg (~50 KB).
- Hero logo (`src/assets/logo-dogovori-hero.png`) → ship as AVIF + WebP via `vite-imagetools`, fallback PNG. Add `<link rel="preload" as="image" fetchpriority="high">` for it in `index.html`.

Net saving: ~1.1 MB off cold load and ~600 KB off LCP path.

## 2. Fonts — trim + preload

Currently loads **10 weights of IBM Plex Sans + 3 of Libre Baskerville** = 13 WOFF2 requests.

- Drop weights actually unused in the UI (audit by grepping `font-weight`/`font-*` usage; typically 400/600/700 is enough). Target: 4 IBM Plex weights + 2 Baskerville weights.
- Add `<link rel="preload" as="font" type="font/woff2" crossorigin>` for the **single** woff2 used for body 400 and headings 700 so the browser fetches them before CSS parses.
- Ensure `font-display: swap` everywhere (fontsource defaults to swap — verify).

## 3. Vite build — better chunking & compression

`vite.config.ts` currently splits only react/supabase/query. Add:

- `vendor-radix`: all `@radix-ui/*` (used across many UI primitives).
- `vendor-pdf`: `jspdf`, `pdfjs-dist`, `mammoth` (only loaded inside `src/lib/exporters.ts` + `templateExporter.ts`; should already be lazy — verify via dynamic `import()`).
- `vendor-docx`: `docx`, `file-saver`.
- `vendor-charts`: `recharts` (only used by `chart.tsx`).
- `vendor-markdown`: `react-markdown`, `remark-gfm`.
- Enable `build.cssCodeSplit: true` (default true, confirm) and `build.modulePreload.polyfill: false` (saves ~2 KB; all our target browsers support it natively).
- Add `vite-plugin-compression` to emit precompressed `.br` and `.gz` alongside JS/CSS for hosts that serve them directly.

## 4. Eager imports on landing page

`src/pages/Index.tsx` imports `CATALOG` from `src/data/catalog.ts` (2,788 lines) eagerly just to render `SectorGrid`. Refactor:

- Split `catalog.ts` into `catalog/sectors.ts` (just sector list — small) + `catalog/templates.ts` (heavy).
- `SectorGrid` imports only sectors; the full catalog is loaded lazily when `/catalog`, `/sektor/*`, `/kategoria/*` mount.

## 5. Verify heavy libs are lazy-only

Grep already shows `jspdf`/`docx`/`pdfjs`/`mammoth`/`recharts` only in `src/lib/exporters.ts`, `templateExporter.ts`, `ui/chart.tsx`. Convert any top-level `import` of these into dynamic `await import(...)` inside the function that actually uses them so they never enter the initial route chunk — verify after split.

## 6. Hover/intent prefetch for routes

`PrefetchLink` exists but isn't used everywhere. Wire `<Link>`s in `Header`, `Hero`, `SectorGrid`, `TopDocuments` to `PrefetchLink` so the route chunk + its data start downloading on `mouseenter`/`focus`. Adds zero load to first paint, makes subsequent navigation near-instant.

## 7. Repeat-visit caching (PWA / service worker)

Add **`vite-plugin-pwa`** with Workbox in `injectManifest`-lite mode:

- Precache the app shell (hashed JS/CSS, fonts, logo).
- Runtime cache for `templateContent/*` chunks (StaleWhileRevalidate, 30 days).
- Runtime cache for Supabase `GET` calls that are non-personalized (blog meta, catalog).
- Network-first fallback for HTML so updates ship immediately.
- Auto-update on new deploys with `registerType: 'autoUpdate'` (skipWaiting + clientsClaim).

Result: a second visit to any corporate user loads the shell from disk (<50 ms) and only fetches the delta.

## 8. React/runtime micro-wins

- Move `initSentry()` behind `requestIdleCallback` so it doesn't compete with hydration.
- Defer `CookieBanner` mount with `requestIdleCallback` (it's render-blocking the first frame for no good reason).
- Pass `future={{ v7_startTransition: true }}` is already on; also wrap heavy state updates (search, filters) in `useTransition` for INP wins.
- Add `content-visibility: auto; contain-intrinsic-size: <h>` to long template lists in `Catalog`, `Sector`, `Blog` — saves render/layout cost for off-screen content.

## 9. Network hints

`index.html` already preconnects Supabase + Plausible. Add:

- `preconnect` to Stripe (`https://js.stripe.com`) only on routes that need it (inject in `StripeEmbeddedCheckout`, not globally).
- `preload` of the main JS entry is automatic; preload the **route chunk** for `/build` and `/catalog` from the landing page once idle (these are the primary CTAs).

## 10. Measurement

Add a `scripts/perf-report.ts` that builds, then prints chunk sizes and gzipped sizes per route — surfaced in CI so future regressions are obvious. (Lightweight; doesn't require Lighthouse infra.)

---

## What I will NOT touch

- Visual design, typography choices, colors, copy.
- Backend / Supabase functions, RLS, business logic.
- Routing structure or feature behavior.
- Anything currently working in tests.

## Order of execution (single PR, grouped commits)

1. Re-encode `public/` icons + hero logo (vite-imagetools).
2. `vite.config.ts` chunking + compression plugin.
3. Split `catalog.ts`; trim font weights; add preloads.
4. Lazy-verify pdf/docx/recharts imports.
5. Wire `PrefetchLink` + idle defers for Sentry/CookieBanner.
6. Add `vite-plugin-pwa` and Workbox runtime caches.
7. Add perf-report script.

After step 6 I'll run `browser--performance_profile` and a CPU profile on `/`, `/catalog`, `/build` so we have before/after numbers to confirm the wins.

## Technical notes

- New deps: `vite-imagetools`, `vite-plugin-compression`, `vite-plugin-pwa`, `workbox-window`. All build-time; no runtime size cost except Workbox SW (~8 KB gz).
- No breaking changes to `src/integrations/supabase/client.ts` or `types.ts`.
- PWA can be feature-flagged via env so it's easy to disable if it surprises anyone.
