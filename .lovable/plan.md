# План: Отделен двуезичен wizard

## Проблем
Когато потребителят натисне „Изготви" върху двуезичен шаблон от каталога/страницата на документа, той се изпраща към `/build` („Изготви документ" — общия AI билдер). Това се случва защото в `Template.tsx`, `Catalog.tsx` и защитата в `Wizard.tsx` всички документи с `bilingual: true` се пренасочват към `/build`. Историческата причина е, че само `/build` умее да генерира BG + EN изход — wizard-ът не поддържа двуезичност.

## Цел
Нов, специализиран wizard за двуезични документи, който:
- ползва конкретния шаблон от каталога (име, категория, документен тип),
- води същия структуриран въпросник като обикновения wizard,
- генерира двуезичен (BG + EN) изход чрез съществуващата edge функция `build-custom-contract`,
- не пипа поведението на `/build` за потребителите, които идват директно за изцяло персонализиран договор.

## Какво ще се промени

### 1. Нов маршрут и страница
- Нов файл: `src/pages/WizardBilingual.tsx`
- Нов път в `src/App.tsx`: `/wizard-bilingual/:sectorId?doc=<name>` (lazy import, идентичен pattern с `Wizard`).
- Страницата:
  - Зарежда документа от `CATALOG` по `sectorId` + `doc` query param; ако липсва/не е bilingual → редирект към `/catalog`.
  - Използва същата структура на въпросите като `Wizard` (внасяме `buildQuestions`, `getSubWizard`, `getSector` от съществуващите модули).
  - Заглавие, breadcrumbs и SEO отразяват конкретния шаблон (напр. „Двуезичен трудов договор (BG/EN)"), а не общото „Изготви документ".
  - Pro/Team gating: ако `canBilingual` (от `useIsPro`) е false → показва същия paywall/CTA, който е в `BuildContract.tsx`, без да чупи UI.
  - LocalStorage ключ: `wizard-bilingual:<sectorId>:<doc>` за персистентност.

### 2. Двуезична генерация (без дублиране на бекенд)
- Изнасяме чистата заявка към `supabase.functions.invoke("build-custom-contract", { … bilingual: true })` в малък helper:
  `src/lib/buildBilingualContract.ts` — приема `{ name, sectorId, documentType, parties, answers }`, връща `GeneratedContract`.
- `BuildContract.tsx` и новата страница ползват същия helper. Това гарантира, че exporter-ите (`exporters.ts` вече поддържат `bilingual`) работят без промени.

### 3. Преглед и експорт
- Прегледът ползва съществуващия `LiveDraft` (вече има bilingual клонове на ред 798/816/851/884).
- Експортът минава през `templateExporter` / `exporters.ts` с `bilingual: true` — без промени.
- Подпис/споделяне: преизползваме компонентите `SignaturePad`, `ShareForSignDialog` без промени.

### 4. Пренасочване от каталога
- `src/pages/Template.tsx` (ред 53–58): `wizardHref` за bilingual документи става
  `/wizard-bilingual/${category.sectorId}?doc=${encodeURIComponent(doc.name)}`.
- `src/pages/Catalog.tsx` (ред 566–567): същата подмяна.
- `src/pages/Wizard.tsx` (ред 56–69): защитата вече не препраща към `/build`, а към `/wizard-bilingual/...` със същите параметри.
- `resolveBuildSectorId` остава за легитимни /build потоци (когато потребителят сам включи bilingual в общия билдер).

### 5. Защита на съществуващото
- `/build` остава непокътнат: ако някой влезе с `?bilingual=1`, потокът работи както сега.
- Хедър линкът „Изготви документ" → `/build` остава.
- Sitemap-и и SEO канонически URL-и: новите `/wizard-bilingual/*` страници не са канонически (те са инструмент, не съдържание) — `noindex` чрез `<Seo>` за да не дублират съдържанието на `/shablon/<slug>`.

## Файлове, които ще се пипнат
- Нови: `src/pages/WizardBilingual.tsx`, `src/lib/buildBilingualContract.ts`
- Редактирани: `src/App.tsx`, `src/pages/Template.tsx`, `src/pages/Catalog.tsx`, `src/pages/Wizard.tsx`

## Какво НЕ се пипа
- Edge функция `build-custom-contract` (преизползва се).
- `exporters.ts`, `LiveDraft`, signature/share компоненти.
- `BuildContract.tsx` UI и собствените му bilingual състояния (само внасяме helper-а, без промяна на поведение).
- База данни, RLS, payments.

## Валидация след имплементация
1. От `/shablon/<bilingual-slug>` бутонът отвежда до новия wizard, не до /build.
2. От `/catalog` бутоните за bilingual документи водят до новия wizard.
3. Директно посещение на `/wizard/<sector>?doc=<bilingual-doc>` пренасочва към новия wizard (не към /build).
4. `/build` продължава да работи както досега за персонализирани двуезични договори.
5. Експорт на PDF/DOCX от новия wizard съдържа BG и EN секции.
6. Non-Pro потребители виждат paywall на новия wizard.
