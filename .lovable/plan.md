
# Pre-launch одит и фиксове на dogovori.net

Стекът е React + Vite + Lovable Cloud (не WordPress), затова PHP/htaccess/SMTP частта от чеклиста се транслира в съответните React/Edge-функции/Supabase еквиваленти.

## 1. UX и Responsive QA (393px + 1280px)

Преминаване през всички ключови страници в двата viewport-а с browser tool:
- `/` (Hero, TopDocuments, Process, Sectors, Footer)
- `/catalog` + един sector (`/sektor/employment`)
- `/template/:slug` (примерна страница)
- `/build` (Wizard стъпки 1–3, корекции, риск)
- `/auth` (login + register + Google)
- `/account`, `/downloads`, `/team` (logged-in)
- `/checkout` flow до return page (Stripe sandbox)
- `/blog`, `/blog/:slug`, статични legal страници, `/404`

За всеки намерен проблем (overflow, скрит CTA, счупен tap target, нечетлив контраст, CLS) — директен фикс в съответния компонент.

## 2. Производителност и скорост

- Lighthouse през `browser--performance_profile` на `/`, `/catalog`, `/build`, `/template/:slug` (mobile)
- Анализ на bundle: преглед на `vite.config.ts` manualChunks, проверка дали Wizard/exporters/Stripe наистина са lazy
- LCP: preload на hero изображението с `fetchpriority="high"`, `<link rel="preconnect">` за Supabase + Stripe
- Премахване на render-blocking shrift-ове (font-display: swap, preload само критичните)
- Проверка на route-level code splitting и `LazyOnVisible` използване
- INP: debounce на търсачката в `/catalog`, проверка за дълги задачи в Wizard

## 3. Оптимизация на изображения (AVIF/WebP)

- Инвентар на `src/assets/**` и `public/**` за `.png/.jpg`
- Инсталиране и конфигуриране на `vite-imagetools` за build-time конверсия към AVIF + WebP с fallback
- Преобразуване на статични `public/` асети чрез `sharp` (committed)
- Заместване на `<img>` с `<picture><source type="image/avif"><source type="image/webp"><img></picture>` за hero, sector grid, top documents, partner logos
- Добавяне на `width`, `height`, `loading="lazy"` (без hero), `decoding="async"` навсякъде за нулев CLS

## 4. Плащания end-to-end (Stripe)

- Sandbox checkout flow: Pro месечен, Team (3 seats), one-off doc
- Проверка на `create-checkout`, `payments-webhook`, `customer-portal` edge functions + логове
- Verify `consume_quota` / `consume_team_quota` се извикват коректно
- Return page → отключване на download/квота
- `PaymentTestModeBanner` се показва само в sandbox

## 5. Имейли (auth + transactional)

- Проверка на email queue (`process-email-queue`, `email_send_log`)
- Тест сигнали: signup welcome, password reset, payment receipt, pro-expiring, team invitation, illegal-content alert
- Проверка че `auth-email-hook` ползва `enqueue_email` (не директно изпращане)
- Проверка че няма счупени template-и след валутната смяна към EUR

## 6. Сигурност

- `security--run_security_scan` + преглед на findings
- `supabase--linter` за DB warnings
- RLS проверка на всички таблици (особено `user_roles`, `download_quota`, `teams`)
- Anti-spam: rate limiting / honeypot на публични форми (PartnerSubmitDialog, share-for-sign, blog ratings, user articles)
- Edge functions: всички публични с `verify_jwt = false` имат собствена валидация на вход (zod), CORS allowlist
- Admin panel: проверка че всички admin routes са зад `has_role('admin')` + `ProtectedRoute`
- HIBP leaked password protection: enable през `configure_auth`
- Проверка за hardcoded keys в кода

## 7. SEO

- `seo_chat--trigger_scan` + фиксване на findings
- Verify sitemap.xml, robots.txt, canonical, JSON-LD (Article, Product, FAQ where applicable)
- Open Graph + Twitter cards на ключови страници
- Уникални title (<60) / description (<160) per route чрез `<Seo>` компонент
- Проверка на `hreflang` (ако има EN/BG — иначе пропускане)
- Premium PageSpeed scores: цел ≥80 mobile perf, ≥95 SEO

## 8. Български език и копирайтинг

- Grep за hardcoded английски стрингове в UI компоненти
- Проверка на системни съобщения: toast-ове, грешки от Supabase (auth errors), Stripe error messages в Bulgarian
- Имейл темплейти на BG
- Празни/error states, 404, форма validation messages
- Проверка за остатъци от "лв"/BGN (по memory правилото — само EUR)

## 9. Финален smoke test

Минаване през критичния flow от user perspective: landing → catalog → template → wizard → download (free quota) → upgrade to Pro → checkout → return → отключен download.

---

## Out of scope
- Промени в бизнес логика, ценообразуване, нови фичи
- Backend архитектурни промени
- Промяна на дизайн direction (текущият premium look се запазва)

## Подход
Изпълнение на партиди по секции (1→9), след всяка партида кратък статус. При намерен blocker — спирам и питам преди да продължа. Очаквана продължителност: няколко итерации, всяка с конкретни фиксове и QA доказателства (screenshots / logs).
