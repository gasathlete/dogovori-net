# Pre-Launch одит и оптимизация

Сайтът вече има солидна архитектура (lazy routes, manualChunks, отложен Sentry, self-hosted fonts, preconnect, prerender при build). Планът покрива конкретни оптимизации + системни проверки преди старт.

## Фаза 1 — Оптимизация на скоростта

**Bundle / зареждане**
- `catalog.ts` (166KB) и `templateContentMeta.ts` (191KB) се импортират статично от 8+ места. Изваждам ги в отделен async chunk и/или ги разделям на по-малки части по сектор/категория, така че Index/Hero да не носят пълния каталог.
- Проверявам първоначалния chunk на `/` (Hero, Header, SectorGrid) с `vite build --report` и режа всичко излишно (lucide иконки да са по една, без barrel re-exports).
- Добавям `fetchpriority="high"` и `<link rel="preload" as="image">` за LCP изображението на Hero (ако има).
- Plausible script: `async` → `defer` (по-добро за parse), валидирам че не блокира.
- Оптимизирам `public/icon-512.png` (223KB → ~30KB чрез squoosh/sharp) и `og-image.jpg` (66KB → WebP, ~25KB).
- Включвам Brotli/gzip проверка след build; добавям `<link rel="modulepreload">` за критичните route chunks (catalog, template).

**React / Data layer**
- `Account.tsx` пуска ~10 паралелни Supabase queries при mount. Групирам в 1–2 RPC функции (`get_account_overview`) и/или комбинирам с React Query `useQueries`, за да намаля round-trips.
- Преглеждам `useEffect` хуковете в Wizard/Template за ненужни re-fetch-ове; където е възможно — `useMemo`/`useCallback`.
- Виртуализация на дълги списъци (Catalog, SiteMap, Downloads) при >100 елемента.

**Backend / DB**
- Пускам `supabase--linter` + `supabase--db_health` за индекси, slow queries, RLS warnings.
- Проверявам че всички `*_at` колони и често филтрирани полета (`user_id`, `team_id`, `folder_id`, `deleted_at`) имат индекси.
- Преглед на edge function cold-start логове (create-checkout, AI генерации).

## Фаза 2 — Качество и UX

- Поправка на console warnings: `DialogContent requires a DialogTitle` (AIDisclaimerModal или CookieBanner) — добавям `VisuallyHidden` Title + Description.
- Преглед на всички dialogs/sheets за accessibility (aria-describedby, focus trap).
- Mobile audit на 393px (текущ viewport): Header burger menu, Wizard стъпки, Popover dropdowns (новите doc-type), формуляри.
- Проверка на всички CTAs и празни състояния (empty states) — без счупени линкове.
- Грешки 404 в console (`/ac`, `/sitemap`) → редирект или премахване на грешни линкове.

## Фаза 3 — SEO и съдържание

- Пускам `seo_chat--trigger_scan` за пълен преглед.
- Валидирам sitemap.xml + sitemap-templates.xml са пълни и валидни след новите ~200 бланки.
- Проверявам canonical/hreflang/OG на всички динамични страници (Template, Category, Sector, BlogPost).
- JSON-LD структуриран `BreadcrumbList` + `Article`/`HowTo` където е уместно.
- robots.txt с правилен `Sitemap:` директив.

## Фаза 4 — Сигурност и съответствие

- `security--run_security_scan` + `supabase--linter` за RLS дупки.
- Преглед на всички edge functions за input валидация и rate limiting (create-checkout, AI endpoints).
- Stripe: проверка че production keys ще се ползват автоматично; webhook secret конфигуриран.
- GDPR/правни: всички dialogs за съгласие имат audit trail; cookie banner работи преди всеки tracker.
- Валидация на disclaimer'ите (вече оптимизирани) — последен преглед.

## Фаза 5 — Стабилност и наблюдаемост

- Sentry: проверявам че `initSentry` се изпълнява и че sample rate е разумен (10–20% за production).
- Error boundaries около всеки route + fallback UI.
- `verify-build.ts` + `verify-seo-urls.ts` минават без warnings.
- Тест на критичните потоци: signup → Google OAuth → create template → download PDF/DOCX → Stripe checkout → team invite.

## Резултат

Конкретен списък с приложени fix-ове + before/after метрики (bundle sizes, Lighthouse score, брой DB queries на ключови страници). След това сме готови да градим маркетинговия prompt върху стабилна база.

---

**Започвам с Фаза 1 (най-голям impact върху user-perceived speed). Одобряваш ли плана, или искаш да преподредим приоритетите?**
