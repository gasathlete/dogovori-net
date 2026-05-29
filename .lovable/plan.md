# План: финализиране преди пускане

Продължаваме от Phase 1 нататък. Тестване — накрая, наведнъж.

## Phase 1.5 — Допълнителни speed оптимизации
- `Account.tsx`: консолидиране на ~10 паралелни Supabase заявки в 1–2 RPC функции (нова `get_account_overview` SQL функция, която връща profile + subscription + usage + team в един round-trip).
- Lazy-load на тежките data модули (`templateContent/index.ts` 3MB, `templateDrafts/index.ts` 1MB) — динамичен `import()` само при отваряне на Wizard/Template, не в bundle-а на началната страница.
- `catalog.ts` (166KB) и `templateContentMeta.ts` (191KB): сплит на metadata vs пълно съдържание, ленив достъп при нужда.
- Route-level code splitting проверка (`React.lazy` за всички страници извън Index).
- `fetchpriority="high"` + `<link rel="preload">` за LCP изображението на Hero.
- `modulepreload` за критичните chunks.

## Phase 2 — Качество и a11y
- Скан за всички останали `DialogContent` без `DialogTitle` warnings.
- Mobile audit @ 393px (текущ viewport): touch targets ≥44px, overflow, sticky елементи.
- Empty states, loading states, error states на всички ключови екрани.
- Проверка за 404 / counter линкове, dead routes.

## Phase 3 — SEO
- `seo_chat--trigger_scan` (изисква одобрение).
- Валидация sitemap: ~200 нови sector blocks включени, lastmod актуален.
- Canonical, hreflang (bg), OG/Twitter на динамични страници (Sector, Template, Build).
- JSON-LD: `BreadcrumbList` на категории/sector страници, `Article` за блог (ако има), `HowTo` за wizard страници, `Organization` глобално.
- robots.txt + sitemap.xml validation.

## Phase 4 — Security
- `security--run_security_scan` (Supabase backend).
- Edge functions: input validation, rate limiting, auth checks на всеки endpoint (`create-checkout`, `webhook`, и т.н.).
- Stripe: live vs test keys, webhook signature verification.
- GDPR/consent: audit trail за `consents` записи, disclaimer показвания.
- RLS policies smoke test (роли: anon, authenticated, owner, team member).

## Phase 5 — Стабилност
- Sentry / error tracking конфигурация (ако липсва — добавяме).
- React Error Boundaries около всеки route + критични компоненти (Wizard, Stripe checkout).
- Build verification: `bun run build` + bundle size report.
- Type check: 0 грешки.
- Console clean: 0 warnings/errors в production build.

## Тестване (накрая)
End-to-end критични user flows в браузъра:
1. Anon → Catalog → Sector → Template preview.
2. Signup (email + Google OAuth) → email verify.
3. Login → Create document (Wizard) → Download PDF/DOCX.
4. Stripe checkout (Pro plan, test mode) → subscription активна.
5. Team invite → приемане → споделен достъп.
6. Disclaimer/consent flow във Wizard и Template.
7. Mobile flow целия път @ 393px.

## Технически детайли
- RPC функцията `get_account_overview` — SECURITY DEFINER, връща JSON; миграция + GRANT EXECUTE TO authenticated.
- Lazy data модули: `const mod = await import('@/data/templateContent')` в Wizard/Template loader, с Suspense fallback.
- Sentry: само ако потребителят одобри допълнителен пакет (`@sentry/react`); алтернатива — лек custom error logger към Supabase table `error_logs`.
- Всички промени пазят съществуващото поведение; refactor-само-където-носи-стойност принцип.

Започвам веднага щом одобриш плана.