
# Финален launch polish

Запазваме сегашния "Soft Editorial Light" стил с emerald акценти. Само полиране, без редизайн. Целта: production-ready версия преди 01.09.2026.

## 1. Конверсия (Hero, CTA, AuthGate, Plans)

- **Hero (Index)**: единствен primary CTA "Започни безплатно" + secondary "Виж пример" (вместо текущите 3+ бутона които разсейват). Добавяме микро-trust ред под CTA: "Без карта · 10 операции · GDPR".
- **Sticky mobile CTA**: показва се само след scroll извън hero, скрива се в Wizard/Console където пречи.
- **AuthGateModal**: добавяме countdown "10/10 безплатни операции остават" + auto-focus на Magic link email след 200ms (без iOS zoom).
- **Plans**: най-горе badge "Най-избиран" над Предприемач, "ROI за 1 договор" inline до цената. Yearly toggle с "-2 месеца безплатно" вместо процент.
- **Empty states**: всеки празен екран (saved_documents, notifications, kits) получава 1 ясен CTA вместо текст.

## 2. Визуална консистентност

- **Token audit**: scan за hardcoded `text-white`, `bg-black`, `#hex` в `src/components` и `src/pages`. Заменяме със semantic токени.
- **Spacing scale**: уеднаквяваме секционни padding-и (mobile `py-12`, desktop `py-20`) и card radius (`rounded-2xl` навсякъде освен бутони `rounded-xl`).
- **Typography**: единен H1/H2/H3 ритъм през `prose-legal` utility клас. Поправяме line-height в Hero на мобилно (сегашният е твърде стегнат на 393px).
- **Icon weight**: всички lucide иконки на `strokeWidth={1.5}` за по-editorial усещане.
- **Dark mode**: контраст-одит на emerald акцентите върху тъмен фон (сегашният `emerald-500` пада до 3.8:1 — вдигаме до 4.5:1).

## 3. Скорост и SEO (Core Web Vitals)

- **LCP image preload** на hero illustration + `fetchpriority="high"`.
- **Route-level code splitting**: `React.lazy` за `/console/*`, `/admin/*`, `/kits/*` (не се ползват преди вход).
- **Image conversion**: `vite-imagetools` за hero и blog covers → AVIF/WebP с fallback.
- **Font subset**: премахваме неизползваните weights от self-hosted шрифтовете (400/600 само).
- **Per-route Helmet**: проверяваме че всяка от ключовите страници (`/`, `/plans`, `/analiz`, `/auth`, `/catalog`, `/blog/*`) има уникален title + meta description + canonical self-reference + JSON-LD където е приложимо.
- **Sitemap sanity**: премахваме draft/private routes, добавяме `lastmod` за blog.
- SEO scan след промените.

## 4. Бекенд hardening

- **Edge functions retry/timeout**: добавяме `AbortController` с 25s timeout и unified error envelope `{ error: { code, message, retry_after } }` в AI функциите (generate, analyze, assistant).
- **Rate limiting**: ползваме съществуващия `rate_limit_buckets` за `/auth` magic link (5/15min/IP) и AI generate (20/min/user).
- **Error toast unification**: един `useApiError` хук който мапва Supabase + edge function грешки към български съобщения.
- **RLS spot-check**: scan + fix на findings от security scanner; всички нови tables да имат GRANT блокове.
- **Sentry-lite**: лек `errorReporter` който логва client грешки в `audit_log` без PII (само route, error type, user_id).

## Технически детайли

- Файлове за основни промени: `src/pages/Index.tsx`, `src/pages/Plans.tsx`, `src/components/AuthGateModal.tsx`, `src/components/MobileStickyCta.tsx`, `src/hooks/useApiError.ts` (нов), `src/lib/errorReporter.ts` (нов), `vite.config.ts` (imagetools), `index.html` (preload + fonts), `supabase/functions/_shared/withTimeout.ts` (нов).
- Нови миграции: `rate_limit_buckets` записи за magic-link и AI generate (само ако липсват ключове).
- Без промяна на pricing, plan категории, funnel логика.

## Извън обхват

- Нови функционалности (само полиране).
- Промяна на брандинга, fonts, color palette.
- Промяна на схемата на съществуващи таблици.

## Финална проверка

- `bunx tsgo` clean
- Lighthouse mobile ≥ 90 за Index/Plans
- SEO scan: 0 failing
- Security scan: 0 нови критични
- Manual smoke: signup → magic link → analyze → paywall → checkout (sandbox)
