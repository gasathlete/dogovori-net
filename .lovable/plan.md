## Цел

Да оправим всички пречки за индексиране в Google Search Console — започвайки с активното предупреждение „Дублиращо се поле FAQPage", плюс несвежи/дублирани структурни данни, които ще задействат нови предупреждения.

## Какво намерих след преглед на кода

**1. Все още има дублиран FAQPage на началната страница `/`** — въпреки fix-а от предишния ход.

Причина: на `/` се рендират ДВА `FAQPage` JSON-LD блока, и двата клиентски (т.е. fix-ът с `data-prerendered` не ги хваща):
- `src/components/ComplianceSection.tsx` — inline `<script type="application/ld+json">` с 4 FAQ за съответствие (ЗЗД/ТЗ/eIDAS).
- `src/components/FAQ.tsx` → `buildFaqJsonLd()` → подаден като `jsonLd` в `Seo` → Helmet добавя втори `<script type="application/ld+json">` с 6 общи FAQ.

Това е точно това, което GSC съобщава.

**2. Несвежи цени в статичен `SoftwareApplication` JSON-LD** в `index.html` (редове 120–124):
```
"Pro" 9.90 EUR, "Team (per seat)" 7.90 EUR, "Pay-as-you-go pack (5 ops)" 1.90 EUR
```
Това противоречи на текущото ценообразуване (Предприемач 12.90, Екип 10.90, пакет 1.90). Google вижда несъответствие между schema и видимото съдържание на страницата → риск за rich result и доверие.

**3. Дублирани статични meta тагове** в `index.html` (редове 145–148): `og:title`, `og:description`, `twitter:title`, `twitter:description` са декларирани втори път (с дефис вместо тире), което се префиксира преди `</head>`. Helmet после ги дублира трети път.

**4. Минорно**: SPA fallback връща HTTP 200 за непознати URL-и (виж `reports/seo-monitor.json`). Не е блокер за индексиране и не може да се поправи без хостинг-ниво 404 — оставяме го.

## Какво ще променя

### A. Един FAQPage на `/`

В `src/components/ComplianceSection.tsx`:
- Премахвам inline `<script type="application/ld+json">` с FAQPage.
- Compliance секцията остава визуално без промяна (acordion, badges).

В `src/components/FAQ.tsx` (`FAQ_ITEMS`):
- Сливам 4-те compliance въпроса (ЗЗД/ТЗ, защитни клаузи, заместване на адвокат, eIDAS) към съществуващия списък — без визуални дубликати, защото компонентът ComplianceSection продължава да показва същите въпроси в своя accordion (но schema-та идва само от едно място).
- Алтернатива (ако предпочитате): оставям ComplianceSection FAQ-те само в JSON-LD, а в `FAQ.tsx` буилдъра — само 6-те бизнес FAQ. По-чисто, но удвоява общия брой `mainEntity` в SERP — затова препоръчвам сливане.

В Index.tsx нищо — продължава да подава един обединен `buildFaqJsonLd()` през Helmet.

### B. Опресняване на статичен schema в `index.html`

`SoftwareApplication.offers`:
```
{ "@type": "Offer", "name": "Предприемач", "price": "12.90", "priceCurrency": "EUR" }
{ "@type": "Offer", "name": "Екип (на място)", "price": "10.90", "priceCurrency": "EUR" }
{ "@type": "Offer", "name": "Пакет 5 операции", "price": "1.90", "priceCurrency": "EUR" }
```

### C. Премахване на дублирани meta тагове

Изтривам редове 145–148 от `index.html` — Helmet поема `og:title`/`og:description`/`twitter:*` per route. Статичните остават само като fallback и не трябва да са декларирани двукратно.

### D. Проверка

- Чете се `Index.tsx`, `Seo.tsx`, `FAQ.tsx`, `ComplianceSection.tsx` за да потвърдя, че след промените на `/` има **точно един** `<script type="application/ld+json">` от тип `FAQPage`.
- Останалите страници (`/shablon/*`, `/kategoria/*`, `/ai`, `/karta`, `/blog/*`, `/tools/*`) вече са защитени от prerender-fix-а от предишния ход (`data-prerendered="true"` се премахва в `main.tsx` преди Helmet да монтира своя).

## Файлове, които ще се променят

- `index.html` — стара цена → нова, премахване на дублирани og/twitter meta.
- `src/components/ComplianceSection.tsx` — премахване на inline FAQPage JSON-LD.
- `src/components/FAQ.tsx` — сливане на 4 compliance FAQ в `FAQ_ITEMS`, за да остане единствен FAQPage с пълно покритие.

## Извън обхват

- Промяна на видимото съдържание/дизайна на Compliance или FAQ секциите.
- Премахване на FAQPage schema изобщо (Google ще го дeprecate-не, но междувременно остава legitimate signal). Ако искате пълно премахване — кажете.
- Промени по sitemap, robots, hreflang — те са в ред.
