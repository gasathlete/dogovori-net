---
name: Performance & A11y Standards
description: Global non-negotiable rules for every new feature — lazy routes, PrefetchLink, LazyOnVisible, image loading attrs, h-dvh not h-screen, design tokens (no text-white/gray), aria-label on icon buttons, WCAG AA, batched queries, RLS+GRANTs, indexes
type: preference
---

Full document: `docs/PERFORMANCE_A11Y_STANDARDS.md`.

Apply to EVERY new page/component/integration:

**Rendering**: React.lazy in App.tsx, PrefetchLink for internal nav, LazyOnVisible for below-fold, per-icon imports from `@/icons`, no eager import of pdf/docx/recharts/framer-motion.

**Images**: alt + loading="lazy" + decoding="async" + width/height on every `<img>`. LCP image = fetchpriority="high" + preload, one per page.

**Data**: reuse singleton `queryClient` from `src/lib/queryClient.ts`. No refetchOnWindowFocus. Batch queries, no N+1.

**DB**: GRANTs + RLS + policies + indexes in the SAME migration. Roles in `user_roles` only.

**A11y (WCAG AA)**: semantic HTML, one `<h1>` + one `<main>` per route, design tokens only (no text-white/bg-black/text-gray-*/arbitrary hex), `aria-label` on icon-only buttons, real `<button>`/`<a>` (not div onClick), 44×44 tap targets, `h-dvh` not `h-screen`, visible focus.

**SEO**: title <60, desc <160, canonical, JSON-LD, no duplicates.
