# Project Memory

## Core
Currency is EUR only. BGN/лв/lev no longer used anywhere — pricing, UI copy, Stripe products, scenarios, invoices, exports.
Pricing (current 4-tier, source of truth = `plans` table): Free (5 ops on signup + 2/mo). Професионалист 12.90 €/mo or 129 €/yr (~10.75 €/mo, 50 ops/mo). Предприемач 19.90 €/mo or 199 €/yr (~16.60 €/mo, 100 ops/mo, GPT-5, Premium 24/7, badge "Premium"). Екип 109 €/seat/year, yearly only (min 3 seats = 327 €/yr, 100 ops/seat/mo). VAT 20% inclusive. Old names Pro/Team and old prices (9.90, 7.90, 23.70, 12.90-for-Предприемач, 10.90 €/seat/mo, 32.70 €/mo, 1.90 one-off), old "Предприемач 120 ops" and old free cap (3/mo or 10/mo) are deprecated — never use them.
All UI pricing copy MUST come from `src/lib/pricing.ts` (PRICING_PLANS, TOPUP_PACK_CONFIG, fmtEur/planSummary/opsLabel...). Никакви литерални цени в src/components и src/pages — guard: `src/test/pricingNoHardcode.test.ts`, стойности: `src/test/pricingConfig.test.ts`, екрани: `src/test/pricingScreens.test.tsx`.
Free plan scope: каталог + wizard/build (свободно разглеждане, финализирането = 1 op) + upload+analyze (score + max 2 корекции). Assistant, пълен Risk Analysis, двуезични, e-Подпис, Комплекти = paid-only (blurred preview + PaidOnlyOverlay). Component: `src/components/paywall/PaidOnlyOverlay.tsx`, `SoftCapPanel.tsx`. Free opsCap derived client-side from signup_at in useIsPro.
Top-up packs (subscribers only): topup_5 2.90 €, topup_20 5.40 €, topup_50 12.90 € (Най-избиран), topup_100 23.90 € (Най-изгоден). Legacy topup_10 is deprecated — removed from UI.
Operation metering: 1 op = (download contract) | (download template) | (upload+analyze incl. auto-corrections wave). Same (session_id, doc_key) reused in tab = free. Each new corrections wave (new batch_id) = 1 op.
Engagement loop v1 (client-side, localStorage): `useEngagement` hook + `bumpEngagement()` on every successful op. `StreakBadge` (header/mobile), `ActionCelebrationHost` mounted in App.tsx listens for `dogovari:op-completed` CustomEvent, `SmartSuggestions` for empty states.
Every new feature MUST follow `docs/PERFORMANCE_A11Y_STANDARDS.md`: lazy routes + PrefetchLink + LazyOnVisible, `<img>` with alt+loading=lazy+decoding=async+dimensions, design tokens only (no text-white/bg-black/text-gray-*/hardcoded hex), aria-label on icon buttons, `h-dvh` not `h-screen`, singleton queryClient, RLS+GRANTs+indexes per migration.

## Memories
- [Performance & A11y standards](mem://performance-a11y-standards) — Global rules for every integration; full doc at docs/PERFORMANCE_A11Y_STANDARDS.md
