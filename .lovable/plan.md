# Финални стъпки преди публикуване

Две паралелни задачи: (1) одит и леки оптимизации на скоростта без компромис с качеството, (2) финансов модел с EUR цени и реалистично потребление.

---

## 1. Тест и оптимизация на скоростта

### Одит (browser performance tools на ключови маршрути)
Профилиране в реална среда на: `/`, `/catalog`, `/komplekti`, `/shablon/:slug`, `/wizard-graph/:slug`, `/blog`, `/account`, `/auth`.

За всяка страница записваме:
- LCP, CLS, INP, TBT, общ JS, transfer size
- Long tasks > 50ms (CPU profile)
- Network waterfall — блокиращи ресурси, late-discovered requests
- Console грешки/warnings, неуспешни заявки

### Леки оптимизации (без промяна на функционалност или визия)
Прилагаме само мерки със сигурна полза:

1. **Hero изображение** — `logo-dogovori-hero.webp` се preload-ва от `index.html` с абсолютен Vite path `/src/assets/...`, който в production се rename-ва (хеш) → preload-ът не пасва. Заменяме с правилен preload през динамичен `<link>` инжектиран от React/Helmet, или import-ваме hero логото и поставяме preload в `<head>` чрез `Helmet`. Добавяме `width/height` атрибути където липсват за нулев CLS.
2. **Шрифтове** — проверка дали `@fontsource` варианти, които използваме, са с `font-display: swap` и дали не зареждаме излишни тегла/латински+кирилица отделно. Премахваме неизползвани файлове.
3. **Code-splitting проверка** — анализ на `dist/` chunk-овете, проверка че тежките библиотеки (`jspdf`, `docx`, `pdfjs-dist`, `mammoth`, `recharts`, `@stripe`) не влизат в entry. Ако влизат — изолираме чрез dynamic import на ниво компонент.
4. **Lazy-load на под-страничен UI** — `CookieBanner`, `AIDisclaimerModal`, `UsernamePrompt`, `PaymentTestModeBanner` се рендират на всяка страница. Превръщаме ги в `React.lazy` + `Suspense`, така че да не влизат в initial bundle.
5. **Изображения в каталога/секторите** — добавяме `loading="lazy"` и `decoding="async"` където липсват, фиксиран `width/height`, и `fetchpriority="low"` за below-the-fold.
6. **Prefetch на най-вероятния следващ маршрут** — при hover/touchstart върху основни CTA-та (към `/catalog`, `/komplekti`) тригерираме съответния `import()` за warm chunk.
7. **React Query** — там където резултатът е статичен (категории, сектори, шаблон meta) вдигаме `staleTime` до 10 мин, за да спрем повторни заявки при навигация.
8. **Supabase първа заявка** — обединяваме „на старт" викания (session + profile + role) в `Promise.all` ако в момента са секвенциални.
9. **Console grooming** — изчистваме `console.log` от production билда (Vite `esbuild.drop: ['console','debugger']` само в production).

Извън скоупа: пренаписване на компоненти, смяна на дизайн, премахване на функции, смяна на анимации.

### Регресионен тест след оптимизациите
- Повторен performance run на същите 8 маршрута, сравнение преди/след
- Smoke clicks: каталог → шаблон → wizard → download; качване на договор; вход; checkout return; admin
- Console + network: нула нови грешки/4xx/5xx

**Резултат:** кратък markdown отчет с преди/след цифри и списък на приложените промени.

---

## 2. Калкулация на сценарии за приходи и разходи

Тарифи (от Core memory, EUR, VAT 20% inclusive):
- **Pro:** 9.90 €/мес, 100 операции/мес
- **Team:** 7.90 €/seat/мес, мин. 3 seats = 23.70 €/мес, 100 ops/seat/мес
- **One-off pack:** 1.90 € за 5 ops

1 операция = download contract | download template | upload+analyze (вкл. auto-corrections wave). Същата `(session_id, doc_key)` в таб = безплатно. Нова corrections wave (нов `batch_id`) = 1 op.

### Структура на Excel модела (`/mnt/documents/dogovori-net-scenarios.xlsx`)

Sheet 1 — **Assumptions** (сини hardcoded клетки)
- Цени, лимити, VAT %
- Cost per op (Lovable AI tokens средно + edge функции + storage + bandwidth)
- Stripe такси (1.5% + 0.25 € за EU карти)
- Месечни фиксирани разходи: Lovable Cloud upgrade, domain, email, support време
- Churn % месечно, free→paid conversion %, ARPU mix

Sheet 2 — **Cost per op** (формули)
- Средни tokens вход/изход × Lovable AI цена → AI разход/op
- Edge function invocations + DB reads/writes → infra разход/op
- Сумарен `cost_per_op` (използван в sheet 3)

Sheet 3 — **Scenarios** (4 колони)
| | Conservative | Base | Optimistic | Stress |
|---|---|---|---|---|
| Активни безплатни потребители | 200 | 1 000 | 5 000 | 20 000 |
| Pro абонати | 10 | 60 | 300 | 1 200 |
| Team организации (×3.5 seats средно) | 1 | 8 | 40 | 150 |
| One-off pack продажби/мес | 20 | 150 | 800 | 3 000 |
| Средно използване Pro (ops/мес) | 35 | 55 | 80 | 95 |
| Средно използване Team (ops/seat/мес) | 25 | 45 | 70 | 90 |

Изчислява за всеки сценарий:
- MRR (Pro + Team + one-off)
- Net revenue след Stripe такси и VAT (нетно за компанията)
- Общи операции/месец и съответен AI/infra COGS
- Gross margin % и абсолютен
- Фиксирани разходи и **месечен P&L**
- Break-even брой Pro еквиваленти

Sheet 4 — **Sensitivity**
- Двупосочна таблица: брой Pro (rows) × средни ops/Pro (cols) → нетна печалба
- Таблица: cost_per_op (rows) × брой активни Pro (cols) → margin %

Sheet 5 — **Annual projection**
- 12-месечна прогноза по Base scenario с growth % и churn, кумулативен ARR и cash

### Кратък markdown summary
Заедно с .xlsx — резюме с ключовите числа за всеки сценарий, точката на рентабилност и препоръки за ценови корекции (ако моделът покаже тесни места).

**Артефакт:** `dogovori-net-scenarios.xlsx` в `/mnt/documents/`.

---

## Технически детайли

- Performance audit: `browser--view_preview` + `browser--performance_profile` + `browser--start/stop_profiling` за всеки маршрут.
- Bundle analysis: четене на `dist/assets/*.js` размери след автоматичен билд.
- Excel: openpyxl + recalculate_formulas.py от xlsx skill, всички стойности като формули (без хардкод), синьо за inputs, черно за формули, зелено за cross-sheet links, EUR формат `€#,##0.00;(€#,##0.00);-`.
- Преди финално: QA на всяко sheet чрез конверсия в изображение и визуална проверка.

## Какво НЕ правя
- Не пипам бизнес логика, дизайн система, текстове, цени.
- Не сменям library/framework версии.
- Не добавям нови функции.
- Не пускам публикуване — то остава ръчно за теб.
