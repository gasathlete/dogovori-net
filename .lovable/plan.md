## Performance преглед — Dogovori.net

Анализирах bundle, началната страница, скрол поведение, шрифтове и тежки зависимости. По-долу е състоянието и какво да оптимизираме.

---

### Какво вече работи добре

- Всички маршрути освен `/` са `React.lazy` + Suspense fallback.
- Vite `manualChunks` отделя `vendor-react`, `vendor-supabase`, `vendor-query`, `vendor-radix`, `vendor-pdf`, `vendor-docx`, `vendor-sentry`, `vendor-stripe`.
- Heavy libs (jspdf, pdfjs, docx, mammoth, pdf-lib) се зареждат само при export.
- Sentry и Plausible — отложени до `requestIdleCallback`.
- Шрифтове self-hosted, само нужните weights (400/500/600/700), Cyrillic + Latin subset.
- LCP лого с `<link rel="preload" fetchpriority="high">`.
- Preconnect към Supabase, Stripe, Plausible.
- React Query с разумни `staleTime`/`gcTime`, без refetch on focus.
- `LazyOnVisible` + `content-visibility: auto` (от последния fix) убива off-screen рендер.

---

### Проблеми и какво да направим

#### 1. Index bundle тежи повече от нужното (висок приоритет)

**Намерих:**
- `src/components/Hero.tsx:5` импортва `BlogRotator` **без да го използва** → мъртъв код влиза в entry chunk-а.
- `src/pages/Index.tsx:11` импортва `BlogRotator` директно (не през `lazy`), въпреки че е под `LazyOnVisible`. Това дърпа `blogTopics.ts` (22K) + autoLinkBlog в entry-то.
- `BusinessQuotes` (`businessQuotes.ts`) се зарежда веднага за hero hover tooltip.
- `featuredBlanks` се чете и от Index.tsx (JSON-LD), и от `FeaturedBlanks` компонент → ОК, но `allTemplates()` мап е скъп — изпълнява се на всеки рендер. Кешираме с `useMemo` извън компонента.

**План:**
- Премахваме unused `BlogRotator` import от Hero.
- Превръщаме `BlogRotator` в `React.lazy` в Index.
- `businessQuotes` → `import()` динамично при първи hover на медальона.
- Memoize `slugByName` map в module scope, не per-render.

#### 2. Header preload и scroll listener

**Намерих:** `useScrolled` сетва state без `requestAnimationFrame`, `Header` ре-рендерира при скрол (само 1 пъти, защото state е boolean — но event handler-ът се изпълнява на всеки scroll event).

**План:** Добавяме `rAF` throttle в `useScrolled`. Махаме `backdrop-blur-xl` от мобилното меню (скъп paint), заменяме с плътен фон.

#### 3. Изображения и партньорски лога

**Намерих:** `PartnersBoard` зарежда лога от Supabase storage. Няма `preconnect` за storage CDN, няма `loading="lazy"`, няма `decoding="async"` на всички `<img>`.

**План:**
- Аудит на всички `<img>` в публичните страници → задължително `loading="lazy"`, `decoding="async"`, `width`/`height` за CLS=0.
- Supabase Storage URL вече е под същия preconnect, но добавяме `fetchpriority="low"` за below-the-fold лога.

#### 4. i18n bootstrap

**Намерих:** `src/i18n/index.ts` се импортва в `main.tsx` и дърпа `i18next` (~45KB) + `i18next-browser-languagedetector` + `react-i18next` синхронно. За българския сайт (default), `en` resources се товарят излишно при всяко зареждане.

**План:** Lazy-load `en/common.json` само ако URL започва с `/en`. Запазва се синхронен init на `bg`.

#### 5. Тежки data файлове в `/src/data` (5.3M templateDrafts, 3M templateContent)

**Намерих:** Чрез `rg` имам само 1.8M в публични страници от тях. Това е по подразбиране tree-shaken, защото всеки template е отделен модул и се import-ва само от съответната lazy страница. Не пипаме.

**Проверка:** В плана включваме `bunx vite-bundle-visualizer` като one-off диагностика, за да потвърдим, че няма data файл, който случайно е bundle-нат в entry-то.

#### 6. Mobile scroll — оставащи дребни шумове

- `Hero.tsx`: вграден SVG `<svg>` × 4 за corner filigree + 4 `<span>` за tick marks → 8 излишни DOM възли. Слепваме в един SVG sprite.
- `Hero.tsx`: `anim-rise` keyframe анимации стартират почти едновременно при load — кратък CPU пик. Запазваме delays, но добавяме `will-change: transform` само на анимираните елементи (по време на анимацията).
- `LifeScenarios`: 12 ListItem с hover ефекти. Добавяме `contain: layout paint` за всяка карта.

#### 7. Network waterfall

- 2 идентични `/partners?...` заявки в логовете (виж network log в 21:07:00 и 21:07:04). React Query трябва да дедуплицира — да проверим дали `PartnersBoard` се рендерира 2 пъти (вероятно auto-rotation hook го реизпълнява). Поправяме `queryKey` стабилност.

---

### Очаквани резултати

| Метрика | Текущо | След |
| --- | --- | --- |
| Initial JS (entry + Index chunk) | ~неизвестно (трябва measure) | **−15–25%** след премахване на BlogRotator/businessQuotes от entry |
| LCP (mobile) | няма скорошен PSI запис (HTTP 429) | да достигне ≤2.5s |
| INP (scroll) | оплаквания от насичане | плавен, след fix-овете в Header/Hero |
| CLS | потенциално >0 (липсват width/height на img) | <0.05 |

---

### План за изпълнение (по стъпки)

1. **Bundle hygiene** — премахваме мъртви/eager импорти от Index/Hero (`BlogRotator`, `businessQuotes` → lazy), memoize JSON-LD map.
2. **Scroll cost** — `rAF` throttle в `useScrolled`; махаме `backdrop-blur-xl` от мобилно меню.
3. **Image audit** — script който намира всички `<img>` без `loading`/`decoding`/`width`/`height` и ги поправяме.
4. **i18n** — lazy-load `en` resources.
5. **Query stability** — fix двойната `partners` заявка.
6. **DOM trim в Hero** — slim corner filigree.
7. **Verify** — `bunx vite-bundle-visualizer` snapshot преди/след; `code--read_network_requests` + console; ръчно scroll тест на mobile вюпорт.

---

### Технически детайли (за разработчик)

```text
src/components/Hero.tsx
  - REMOVE: import { BlogRotator } ...      // unused
  - CHANGE: businessQuotes -> dynamic import on first hover
  - CHANGE: 4×SVG + 4×span -> single inline <svg> with <use>

src/pages/Index.tsx
  - CHANGE: import { BlogRotator } -> const BlogRotator = lazy(...)
  - CHANGE: featured JSON-LD slugByName map -> module-scope const

src/hooks/useScrolled.tsx
  - CHANGE: throttle handler via requestAnimationFrame + passive listener

src/components/Header.tsx
  - CHANGE: mobile nav 'backdrop-blur-xl bg-navy/95' -> 'bg-navy'

src/i18n/index.ts
  - CHANGE: import enCommon -> dynamic when locale === 'en'

src/components/PartnersBoard.tsx
  - VERIFY: useQuery key stability; remove duplicate fetch source
```

Скоупът е чисто performance — без визуални или функционални промени. Готов съм да премина в build mode и да приложа стъпките една по една, или да започна с най-високия приоритет (точки 1+2).
