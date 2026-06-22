## План: „Лек и смазан" UX — performance pass

Приложението вече има солидна основа (lazy routes, manual chunks, `LazyOnVisible`, React Query staleTime, modulePreload без polyfill, drop console в prod). Затова планът цели **точково измерими подобрения** без рискови преработки.

### 1. По-бърз първи екран (LCP/INP на `/`)

- В `index.html`: `<link rel="preload" as="image" fetchpriority="high">` за hero фон/изображение и `<link rel="preconnect">` към Supabase host + Google Fonts (ако се ползват).
- `Hero.tsx`: маркиране на основния визуален елемент с `fetchpriority="high"` и `decoding="async"`; премахване на анимации блокиращи първия paint (`HeroBackdrop` зад `requestIdleCallback`).
- `Header.tsx`: икони от `lucide-react` се внасят директно — да се остави tree-shake (вече ОК), но да се мемоизира навигационното меню.
- Шрифтове: добавяне на `font-display: swap` и preload само за един weight (400 + 600).

### 2. По-малък JS на началната страница

- `src/lib/templateIndex.ts` се eager-import-ва в `Index.tsx` само за map от име→slug. Да се замени с lightweight `featuredBlanksSlugs.ts` (само нужните 5–10 записа), за да не влиза целият каталог в първия chunk.
- `Reveal` + `LazyOnVisible` обвивката добавя layer на всяка секция — да се обедини в един компонент `<LazyReveal>` (по-малко React work, по-малко IntersectionObserver-и).
- Premium тежки секции (`ComparisonTable`, `PlatformShowcase`, `FAQ`) — да се проверят за `framer-motion` import-и и да се сведат до `motion/react` подсет, където е възможно.

### 3. Бързи навигации (perceived speed)

- Hover/touch **prefetch** на route chunks за линкове в Header и Hero (`onMouseEnter` → `import()` на съответния lazy модул). Незабавно усещане „instant".
- `ScrollToTop` — да използва `requestAnimationFrame` вместо синхронен scroll, за да не блокира route transition.
- React Router `<Link>` с `viewTransition` (поддържано в съвременните браузъри) за плавни преходи без flash.

### 4. По-олекотени admin страници

- `AdminAiSimulation.tsx` (1074 реда) — да се раздели на 3 lazy tab-а (`SimulationTab`, `SettingsTab`, `UsageTab`), всеки като отделен chunk, зареждан при кликване на таба. Намалява admin bundle и render cost.
- `Catalog.tsx` (908) и `Wizard.tsx` (964) — виртуализация на дългите списъци с `@tanstack/react-virtual` (вече в depend tree през query).

### 5. Мрежа и данни

- Supabase: на често достъпваните таблици да се добави `select("колона1, колона2")` вместо `*` (одит на топ 10 заявки).
- React Query: глобален `staleTime` вече е 60 s — за статични справки (планове, категории) да се вдигне на 10 мин + `placeholderData: keepPreviousData` за pagination.
- Edge функции: добавяне на `Cache-Control: public, max-age=60, stale-while-revalidate=600` за GET-only функции (catalog, plans).
- Realtime канали: одит дали се unsubscribe-ват при unmount (изтичането им товари main thread).

### 6. Изображения

- 11 от 14 `<img>` тага нямат `loading="lazy"` — добавяне навсякъде освен LCP изображението.
- Конвертиране на JPG/PNG в `public/` към WebP/AVIF с `squoosh-cli` (еднократен скрипт), запазвайки оригинала като fallback през `<picture>`.

### 7. Измерване (без него няма как да докажем „смазано")

- Нова страница `/admin/perf` (вече съществува като файл) — да показва **Web Vitals** в реално време: LCP, INP, CLS, TTFB, FCP от `web-vitals` пакета, изпратени към `ai_usage`-подобна таблица `web_vitals`.
- Lighthouse CI script в `scripts/lighthouse.mjs` за бенчмарк преди/след.

### Извън обхвата

- Преминаване към SSR/Next — извън стека.
- Service Worker / offline — отделна задача, носи рискове за auth state.
- Промени по бизнес логиката, AI routing или цените.

### Технически детайли

| Файл | Действие |
|---|---|
| `index.html` | preload hero, preconnect Supabase, font-display swap |
| `src/components/Hero.tsx` | `fetchpriority`, idle backdrop |
| `src/pages/Index.tsx` | замяна `allTemplates()` с лек слайс, обединяване Reveal+LazyOnVisible |
| `src/components/Header.tsx` + `Hero.tsx` | hover-prefetch на ключови routes |
| `src/App.tsx` | viewTransition на `<Link>`, RAF в ScrollToTop |
| `src/pages/AdminAiSimulation.tsx` | split на 3 lazy таба |
| `src/pages/Catalog.tsx`, `Wizard.tsx` | виртуализация на списъци |
| `src/lib/webVitals.ts` (нов) | репорт към `public.web_vitals` |
| `supabase/migrations/*` | таблица `web_vitals` с RLS + GRANT |

Очакван ефект: LCP `/` под 1.2 s на 4G, INP < 100 ms, admin tab switch без забележимо забавяне, route preview chunks от ~80 KB на ~40 KB.

Кажи **„Implement plan"**, ако да започвам — или посочи кои точки да пропусна / приоритизирам.