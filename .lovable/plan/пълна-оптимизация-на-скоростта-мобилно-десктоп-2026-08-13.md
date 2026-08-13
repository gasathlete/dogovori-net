# Пълна оптимизация на скоростта (мобилно + десктоп)

Проверих реалното състояние на кода. Голяма част от базовата оптимизация вече е налична (lazy routes, vendor chunking, self-hosted fonts, immutable cache headers, lazy-per-slug template данни). Останаха няколко конкретни, измерими проблема — най-важният е, че началната страница зарежда ~1 MB JSON, преди да покаже нещо.

## Какво реално тежи днес (потвърдено с четене на кода)

1. **~1 MB JSON в entry-а на началната страница.**
   `Index.tsx` импортва `SocialProofStrip` статично; той тегли `CATALOG` (`catalog.categories.json`, 167 KB) и `SECTORS` (`sectors.ts`, 150 KB), а `sectors.ts` от своя страна тегли `subWizardsGenerated` → `subWizards.generated.json` (752 KB). Всичко това се сваля, парсва и блокира главната нишка — само за да се покажат два броя ("правни сектора", "документа").
2. **Hero видео на мобилни устройства.** `HeroVideoBackdrop` пуска `autoPlay` видео на всяка ширина; на телефон това е излишен трафик, декодиране и батерия точно докато се мери LCP/INP.
3. **Preload сочи към нещо, което не е LCP.** `index.html` preload-ва `logo-dogovori-hero.webp` (60 KB) с `fetchpriority="high"`, но реалният LCP на hero е видео/постер + текст — preload-ът се конкурира с критичния път.
4. **Шрифтове: 10 отделни CSS файла** (`src/fonts.ts`) с чакащи `@font-face` заявки; част от тегла/subsets не са критични за първия екран.
5. **Тежки страници (`Catalog`, `Wizard`, `BuildContract`) импортват `questionGraphs` и `sectors` статично** — chunk-овете им са по-големи от нужното за първия render.

## Какво ще направя

### Фаза 1 — Начална страница (най-голям ефект)
- Изнасям броячите на `SocialProofStrip` в лек генериран модул с числа/константи (без `CATALOG`/`SECTORS` импорти), или ги зареждам лениво след първия paint.
- Правя `SocialProofStrip` lazy (`LazyOnVisible`), за да не е в entry chunk-а.
- Проверявам всички останали eager импорти на `Index.tsx` за скрити тежки зависимости.

### Фаза 2 — Медия и критичен път
- Видеото се пуска само от `md` нагоре и само при `connection` без `saveData`; на мобилно се показва постерът (по-малък, оптимизиран).
- Постерът минава през по-агресивна компресия + `width/height` за нулев CLS.
- Оправям `preload` в `index.html`, за да сочи реалния LCP елемент.

### Фаза 3 — Шрифтове и CSS
- Свеждам font CSS импортите до критичните тегла/subsets, останалите се зареждат отложено; `font-display: swap` навсякъде.
- Преглед на `index.css` (976 реда) за неизползвани блокове и дублирани tokens.

### Фаза 4 — Тежки маршрути
- Ленив достъп до `questionGraphs`/`sectors` в `Catalog`, `Wizard`, `BuildContract` (динамичен `import()` при нужда, не при mount на модула).
- Prefetch на най-вероятния следващ маршрут при idle (catalog → template → wizard).

### Фаза 5 — Проверка
- Преди/след сравнение на размерите на chunk-овете от production build.
- Web Vitals през вече наличния `webVitalsReporter` + `/admin/perf`, за мобилен и десктоп профил.
- Никаква промяна в бизнес логиката — само зареждане, разделяне и медия.

## Технически детайли
- Няма промени в схемата на базата, edge функции или платежна логика.
- Файлове, които ще бъдат засегнати: `src/pages/Index.tsx`, `src/components/SocialProofStrip.tsx`, `src/components/HeroVideoBackdrop.tsx`, `src/fonts.ts`, `index.html`, `src/index.css`, `src/pages/Catalog.tsx`, `src/pages/Wizard.tsx`, `src/pages/BuildContract.tsx`, `vite.config.ts` (при нужда), плюс евентуален нов лек `src/data/counts.generated.ts`.
- Резултатът се документира в `docs/PERFORMANCE_A11Y_STANDARDS.md`.
