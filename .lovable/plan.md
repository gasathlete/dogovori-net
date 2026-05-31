# План: Двуезични документи (BG + EN)

## 1. Нова категория в каталога
В `src/data/catalog.ts` добавям нова категория:
- `id: "bilingual"`, номер `"24"`, заглавие „Двуезични документи (BG/EN)", икона `Languages`, `sectorId: "services"`.
- Всеки документ маркиран с нов флаг `bilingual: true` (добавям полето в `CatalogDocument` интерфейса).

20-те най-често ползвани двуезични документа в България:
1. Двуезичен трудов договор (BG/EN)
2. Двуезичен граждански договор / договор за услуги
3. Двуезичен NDA (Non-Disclosure Agreement)
4. Двуезичен договор за наем на жилище
5. Двуезичен договор за наем на офис/търговски обект
6. Двуезичен договор за изработка (Service / Works Agreement)
7. Двуезичен договор за консултантски услуги
8. Двуезичен SaaS / Software License Agreement
9. Двуезичен договор за разработка на софтуер (Master Services + SOW)
10. Двуезичен дистрибуторски договор
11. Двуезичен агентски договор (Commercial Agency)
12. Двуезичен договор за покупко-продажба на стоки (международен, по CISG)
13. Двуезичен договор за заем (Loan Agreement)
14. Двуезичен Term Sheet за инвестиция
15. Двуезичен SPA — Share Purchase Agreement
16. Двуезичен SHA — Shareholders' Agreement
17. Двуезичен Employment Offer Letter
18. Двуезичен Pro Forma Invoice (BG/EN)
19. Двуезично пълномощно (Power of Attorney)
20. Двуезична Data Processing Agreement (DPA, GDPR)

Всеки запис включва `name`, `purpose`, `keyClause`, `documentType` (contract/agreement/invoice/power_of_attorney и т.н.) и `bilingual: true`.

## 2. Нов филтър „Двуезичен документ" в /catalog
В `src/pages/Catalog.tsx`:
- Добавям втори chip-филтър до „Вид документ" — превключвател „Двуезичен документ" (on/off).
- Състоянието се пази в URL като `?bilingual=1`.
- Логиката във `filtered` отхвърля документи без `bilingual === true` когато филтърът е активен.
- Брояч „N от Total" + бутон „Изчисти" по същия pattern като текущия Vid филтър.

## 3. Двуезично генериране за Предприемач (Pro) и Екип (Team)
В `src/pages/BuildContract.tsx`:
- Добавям toggle „🌐 Двуезичен (BG + EN)" в горната лента до избора на режим.
- Видим за всички, но активен само ако `useIsPro()` връща `isPro || isTeam`. За free план — катинар и tooltip „Достъпно за Предприемач и Екип" с CTA към `/account?tab=subscription`.
- Стойността се изпраща към edge функцията като `bilingual: true`.

В `supabase/functions/build-custom-contract/index.ts`:
- Приемам `bilingual` от body.
- Когато е `true`, разширявам system prompt-а да върне всяка клауза в две колони / две последователни версии: български оригинал и официален английски превод, с еднаква номерация (напр. „Чл. 1 / Art. 1"). Заглавие, преамбюл и подписи също двуезично.
- В `GeneratedContract` метаданните маркирам `language: "bg-en"`, така че `LiveDraft` и експортът да го показват коректно (двете версии се рендират в реда от модела — без промени в exporter-а).

Когато потребител отвори двуезичен документ от каталога през Wizard-а или директно през „Изградете нов" с `?bilingual=1`, toggle-ът се отмята автоматично.

## 4. Достъпен запис за Team
Никакви DB промени — Team вече минава през `isTeam` в `useIsPro`, който отключва същия toggle.

## Технически детайли
- Файлове: `src/data/catalog.ts`, `src/pages/Catalog.tsx`, `src/pages/BuildContract.tsx`, `supabase/functions/build-custom-contract/index.ts`.
- Без миграции в базата.
- Иконата `Languages` от lucide-react е вече налична.
- Брояч в каталога ще покаже автоматично 20 двуезични документа.
