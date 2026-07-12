# Performance & Accessibility Standards

Global, non-negotiable rules for every new feature, integration, page, or
component. Reviewers should reject PRs that violate these without a written
exception in the PR description.

## 1. Rendering & bundle

- **Lazy-load routes** with `React.lazy` in `src/App.tsx`. Never import a
  page module eagerly.
- **Prefetch on hover/focus** for internal navigation — use `PrefetchLink`
  from `src/components/PrefetchLink.tsx` instead of `react-router-dom`
  `Link` in marketing/UI paths.
- **Below-the-fold sections** must be wrapped in `LazyOnVisible`
  (`src/components/LazyOnVisible.tsx`) with a realistic `minHeight` to
  avoid CLS.
- **Heavy vendor deps** (pdf, docx, recharts, framer-motion, stripe) must
  stay behind lazy routes; do not import them at the app entry.
- **No new global CSS-in-JS libraries.** Tailwind + shadcn only.
- **Icons**: import per-icon from `@/icons` (tree-shaken). Never
  `import * as Icons from "lucide-react"`.

## 2. Images & media

- All `<img>` must have:
  - `alt` (empty `alt=""` for decorative).
  - `loading="lazy"` unless the image is the LCP element.
  - `decoding="async"`.
  - Explicit `width` and `height` (or `aspect-*` wrapper) to prevent CLS.
- LCP hero image: `fetchpriority="high"` + `<link rel="preload">` in
  `index.html`, and **only one per page**.
- Prefer `.webp` / `.avif` for photos; SVG for logos/icons.
- Never load remote images without a known allow-list host.

## 3. Data & network

- Reuse the singleton `queryClient` (`src/lib/queryClient.ts`). Default
  `staleTime: 60_000`, no `refetchOnWindowFocus`.
- Batch reads. Avoid N+1 queries in loops — use `in()` filters or RPC.
- Client bundle must never contain service-role keys or private secrets.
- Edge functions must set proper CORS headers from `_shared/cors.ts` and
  apply rate limits (`_shared/rate-limit.ts`) on all public endpoints.

## 4. Database

- Every new `public` table: `GRANT`s + RLS enabled + policies in the SAME
  migration. Roles live in `user_roles` — never on `profiles`.
- Add indexes for every column used in `WHERE`, `ORDER BY`, or `JOIN`
  on user-facing queries. Verify with `EXPLAIN ANALYZE` before shipping.
- Long-running writes / analytics jobs go through edge functions or cron,
  never inline on a user request.

## 5. Accessibility (WCAG 2.1 AA)

- Semantic HTML: exactly one `<h1>` per page, one `<main>` per route
  (in the layout that renders `<Outlet />`).
- Use design tokens (`text-foreground`, `bg-background`,
  `text-muted-foreground`). **Never** hardcode `text-white`, `bg-black`,
  `text-gray-300`, or arbitrary hex — they break dark mode and contrast.
- Icon-only buttons **require** `aria-label`. Prefer shadcn `Button`
  with visible text where possible.
- Interactive elements must be real `<button>` / `<a>`, not `<div
  onClick>`. Use shadcn/Radix primitives — they ship correct ARIA.
- Tap targets ≥ 44×44px on mobile. Full-height layouts use `h-dvh` /
  `min-h-dvh`, not `h-screen` (avoids mobile URL-bar clipping).
- Forms: every input has an associated `<Label>` (or `aria-label`).
  Errors announced via `aria-invalid` + `aria-describedby`.
- Focus must be visible. Never remove focus rings without replacement.

## 6. SEO

- `<title>` < 60 chars, `<meta name="description">` < 160 chars, single
  `<h1>`, canonical tag, JSON-LD when applicable.
- No duplicate JSON-LD (the prerendered strip in `src/main.tsx` handles
  SSG copies — do not re-add).

## 7. Client performance monitoring

- Web Vitals are auto-collected via `initWebVitalsReporter()`. Do not
  duplicate. Targets: LCP < 2.5s, INP < 200ms, CLS < 0.1.
- Analytics batched through `pageviewTracker` — never send per-event
  fetches from components.

## 8. Security

- Store roles in `user_roles` only. Never in `profiles` / localStorage.
- Never place `<noscript><img></noscript>` inside `<head>`.
- Publishable / anon keys OK in code; all others via `add_secret`.

## Definition of done for a new integration

- [ ] Route lazy-loaded, prefetched on hover.
- [ ] Below-fold sections in `LazyOnVisible`.
- [ ] All images: alt, `loading="lazy"`, `decoding="async"`, dimensions.
- [ ] All colors via design tokens.
- [ ] All icon-only buttons have `aria-label`.
- [ ] Single `<h1>`, semantic landmarks.
- [ ] Uses `h-dvh` where full-height is needed.
- [ ] New tables: GRANTs + RLS + policies + indexes.
- [ ] `bun run typecheck` clean; build succeeds.
- [ ] Manual check: keyboard-only navigation reaches every action.
