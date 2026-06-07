# План: По-малко текст + Сценарии "Какво искате да постигнете?"

Две паралелни промени, които работят заедно: визуално олекотяване на началната страница чрез `ExpandableCard` и нов вход към платформата чрез житейски/бизнес сценарии (вдъхновен от LawDepot, но в нашата естетика — navy + gold, не зелено).

## 1. Опростяване на текста на началната страница

Прилагаме съществуващия `ExpandableCard` ("Виж повече") към най-плътните секции — никакво ново съдържание, само скриваме излишното при първо зареждане.

- **Hero** (`Hero.tsx`)
  - Параграфът „Освен шаблони и бланки…" се скъсява до 1 изречение: *„Индивидуални договори, съобразени със ЗЗД, ТЗ и ЗУТ — с пълен правен риск-анализ."* Останалото (стратегически въпроси, AI подкрепа) → зад `Виж повече`.
  - Безплатно-редът се компресира: показваме само *„5 безплатни операции · Pro 9.90 €/мес · Промокод FIRST100 → −30%"*. Детайлите (2/мес, авто-корекция) → зад `Виж повече`.

- **Process** (`Process.tsx`), **ComplianceSection**, **Testimonials**, **PlatformShowcase**
  - Дълги описания под заглавия → първите 1–2 изречения остават, останалото в `ExpandableCard`.
  - Където има списъци с предимства (>4 точки) — показваме 3, останалите зад тогъл.

- **TopDocuments** — описанията на картите остават както са (вече кратки), но добавяме `line-clamp-2` за гарантирана едновисочина.

Принцип: **никакво ново копи**, само пренареждане. Запазваме SEO съдържанието — текстът присъства в DOM-а (просто скрит чрез `grid-template-rows`), значи crawler-ите го виждат.

## 2. Нова секция: „Какво искате да постигнете?" (Real-life scenarios)

Нов компонент `LifeScenarios.tsx`, поставен на началната страница **между Hero и PlatformShowcase** — точката, в която LawDepot хваща потребителя.

### Локализация на сценариите към български пазар

Не копираме директно LawDepot. Подбираме сценарии, които съответстват на нашите 21 сектора и реалния български контекст:

| Сценарий | Икона | Води до |
|---|---|---|
| Отдавам имот под наем | Home | `/sektor/real-estate` (наем-под-наем филтър) |
| Купувам или продавам имот | ArrowRightLeft | `/sektor/real-estate` |
| Започвам бизнес (ООД/ЕООД) | Store | `/sektor/corporate` |
| Наемам служител | Briefcase | `/sektor/employment` |
| Възлагам услуга / freelance | Code2 | `/sektor/services` |
| Купувам или продавам автомобил | Car | `/sektor/vehicles` |
| Упълномощавам някого | FileSignature | `/sektor/power-of-attorney` |
| Защитавам идея / NDA | ShieldCheck | `/shablon/nda-dogovor-za-konfidentsialnost` |
| Развод или семейно дело | Users | `/sektor/family` |
| Заемам / връщам пари | HandCoins | `/sektor/finance` |
| Изготвям декларация | FileCheck | `/sektor/family` |
| Не съм сигурен какво ми трябва | Search | `/catalog` |

12 сценария, layout: **mobile = 2-кол. grid с икона+текст**, **desktop = 3 или 4 кол.** Преобладаващо иконичен, скромен текст — обратното на нашите тежки описания.

### Визуален дизайн

Не зелен LawDepot стил. Нашият стил:
- Navy фон с gold accent border + hover lift
- Иконата вляво в gold кръг (`border border-gold/30 bg-gold/10`)
- Кратък etikет (1 ред) — без описание
- Хover: `border-gold/45`, лек translate
- Eyebrow „00 · Започнете оттук" (преномериране на следващите секции с +1 не е нужно — те остават 01, 02… защото тази секция е „вход", не номериран раздел)

### Поведение

- Click → директно `navigate(path)` чрез `PrefetchLink`
- Под grid-а: централен CTA „Не намирате? Разгледайте всички 600+ шаблона" → `/catalog`
- 12-те сценария живеят в `src/data/lifeScenarios.ts` (id, label, icon name, href, priority)

## Файлове

**Нови:**
- `src/components/LifeScenarios.tsx`
- `src/data/lifeScenarios.ts`

**Редактирани:**
- `src/pages/Index.tsx` — lazy import + LifeScenarios между Hero и PlatformShowcase, увит в `LazyOnVisible` + `Reveal`
- `src/components/Hero.tsx` — скъсяване на параграф и quota реда + `ExpandableCard` за останалото
- `src/components/Process.tsx` — `ExpandableCard` около дълги описания на стъпки
- `src/components/ComplianceSection.tsx` — кратко интро + `ExpandableCard`
- `src/components/Testimonials.tsx` — само ако има тежък текст
- `src/components/PlatformShowcase.tsx` — компресия на интро текст

## Извън обхвата

- Без backend/database промени
- Без промени по `/plans`, auth, Stripe
- Без редизайн на secondary страници
- Без нови преводи — само BG копи (UI е BG, sealed by memory)
- Без промени на номерацията на eyebrow-овете на съществуващите секции
