# Поправка на имената на страните в подписни блокове

## Проблем

В подписния блок на договори страните се появяват с грешни роли (напр. „НАЕМОДАТЕЛ/НАЕМАТЕЛ" при договор за покупко-продажба). Това е критичен правен дефект.

## Първопричина

В `src/pages/Wizard.tsx` (ред 80):

```ts
parties: subWizard?.parties || baseSector.parties,
```

Подписният блок се изгражда в `Wizard.tsx` (редове 299–303) от `sector.parties.a/b`. Когато:

- документът се отваря под сектор „Недвижими имоти и наеми" (`baseSector.parties = { a: "Наемодателя", b: "Наемателя" }`), И
- няма явен `subWizard` в `sector.subWizards[]` с `parties` override, И
- няма запис в `REGISTRY` на `subWizardsGenerated.ts` с правилни `parties`,

тогава ролите се наследяват от секторния default → продавачът става „Наемодател", купувачът – „Наемател".

Допълнително открих:

1. **Обърнат ред A/B** – „Окончателен договор за покупко-продажба на имот (проект на нотариален акт)" в `subWizardsGenerated.ts` (ред 14049) има `a: "Купувач", b: "Продавач"` – трябва да е обратно (по правна конвенция Продавачът е Страна А).
2. **Помощникът `sub()`** в `sectors.ts` приема `parties` като опционален параметър, но почти никое извикване не го подава – всички subWizards в даден сектор наследяват секторните параметри, включително неподходящите такива (напр. „Приемо-предавателен протокол", „Анекс", „Споразумение за прекратяване" – някои може да са OK, други не).
3. **Generic fallback** в `buildGenericSubWizard` ползва правилна keyword-логика, но е последна opция.

## Обхват на одита

Файлове за систематичен преглед:

```text
src/data/sectors.ts                       (22 сектора, ~30 explicit sub())
src/data/subWizardsGenerated.ts           (~318 шаблона в REGISTRY)
src/data/questionGraphs/*.ts              (graph-driven wizards)
src/data/templateDrafts/*.ts              (live preview drafts)
src/data/companionTemplates.ts
src/data/newTemplates.ts
src/data/catalog.ts
src/pages/Wizard.tsx                      (партии конструктор, ред 299–303)
src/components/wizard/LiveDraft.tsx       (preview ползва sector.parties)
src/lib/exporters.pdf.ts / .docx.ts       (рендер на подписния блок)
supabase/functions/generate-contract/     (AI prompt — получава parties)
```

## План за изпълнение

### Стъпка 1 — Автоматизиран одит-скрипт

Създавам `scripts/audit-party-roles.ts` който:

1. За всеки запис в `REGISTRY` (`subWizardsGenerated.ts`) и всеки `sub()` в `sectors.ts`, изчислява **очаквани роли** по keyword regex върху `documentName` (същата логика като `buildGenericSubWizard`, разширена):
   - продаж|покуп|кп → Продавач / Купувач
   - наем|аренд → Наемодател / Наемател (аренд → Арендодател / Арендатор)
   - дарен → Дарител / Надарен
   - заем|кредит → Заемодател / Заемател
   - труд|работ → Работодател / Служител
   - изработ|услуг|поръчк|консулт|поддръжк|сервиз → Възложител / Изпълнител
   - превоз|спедиц|логист|куриер → Възложител / Превозвач
   - комисион|посредни|брокер|агент → Доверител / Посредник
   - лиценз|франчайз → Лицензодател / Лицензополучател
   - nda|поверит|конфиденциал → Разкриваща страна / Получаваща страна
   - застрахов → Застраховател / Застрахован
   - пълномощ → Упълномощител / Пълномощник
   - залог → Залогодател / Залогоприемател
   - поръчителств → Кредитор / Поръчител
   - спонсор → Спонсор / Спонсориран
   - и т.н.
2. Сравнява с реално зададените `parties.a/b` (и с наследения секторен default, когато няма override).
3. Маркира два класа грешки:
   - **MISMATCH** – съществуваща роля не съвпада с очакваната (напр. „Наемодател" при покупко-продажба).
   - **REVERSED** – двойката е обърната (Купувач/Продавач вместо Продавач/Купувач).
4. Печата CSV отчет в `reports/party-roles-audit.csv` с колони: documentName, sectorId, source (explicit/generated/inherited/generic), currentA, currentB, expectedA, expectedB, issue.

### Стъпка 2 — Поправка на данните

На базата на отчета:

- В `subWizardsGenerated.ts` – обновявам `parties` за всеки MISMATCH/REVERSED шаблон. Конкретно знам, че:
  - „Окончателен договор за покупко-продажба на имот (проект на нотариален акт)" → `{ a: "Продавач", b: "Купувач" }` (понастоящем обратно).
  - „Нотариална покана … покупко-продажба на недвижим имот" – ще се прецени според контекста (страна на купувача срещу неизпълнил продавач или обратно).
- В `sectors.ts` – добавям `parties` override на всеки `sub(...)` чийто документ не съвпада със секторния default (напр. продажни/анекс/протокол документи в real-estate сектора).
- За документи без явна категория – оставям generic fallback, но укрепвам regex-а в `buildGenericSubWizard`.

### Стъпка 3 — Защита от регресии

1. Преместване на keyword-картата от `buildGenericSubWizard` в нов модул `src/data/partyRoles.ts` с pure функция `inferPartyRoles(documentName) → { a, b } | null`.
2. В `Wizard.tsx` (редове 299–303): преди да се сглоби `partiesArr`, ако `sector.parties` изглежда несъвместим с името на документа (т.е. `inferPartyRoles(docName)` връща различни роли), да се ползват inferred роли – защитен мрежест слой при липсващо override.
3. Vitest тест `src/test/party-roles.test.ts` – зарежда всички documentNames от `CATALOG`, `REGISTRY` и `SECTORS` и проверява, че `subWizard.parties || sector.parties` минава `inferPartyRoles` валидация (без MISMATCH). Тестът се регистрира в CI workflow `tests.yml` – ще failва бъдещи регресии.

### Стъпка 4 — Подписен блок exporters

В `src/lib/exporters.pdf.ts` (ред 208) и `exporters.docx.ts`:
- Ако `p.role` е празен или съдържа placeholder „Страна А/Б", използваме `inferPartyRoles` върху заглавието на договора. Така дори AI отговор без `parties` метаданни ще получи правилни роли в подписната секция.

### Стъпка 5 — Ръчна проверка

След автоматичните поправки – генерирам по 1 документ от всеки сектор (3–5 ключови: покупко-продажба имот, покупко-продажба МПС, наем жилище, договор за изработка, NDA, договор за заем, дарение, договор за труд) и визуално проверявам подписния блок в DOCX/PDF, че ролите са правилни. Резултатите се прилагат към PR като скрийншоти.

## Файлове за промяна

- `scripts/audit-party-roles.ts` (нов)
- `src/data/partyRoles.ts` (нов – централен keyword мап)
- `src/data/sectors.ts` (parties overrides на explicit sub() + рефакторинг на `buildGenericSubWizard` да ползва `partyRoles.ts`)
- `src/data/subWizardsGenerated.ts` (поправени `parties` за маркираните шаблони)
- `src/pages/Wizard.tsx` (защитен слой с `inferPartyRoles` преди сглобяването на `partiesArr`)
- `src/lib/exporters.pdf.ts`, `src/lib/exporters.docx.ts` (fallback на role)
- `src/test/party-roles.test.ts` (нов тест)
- `reports/party-roles-audit.csv` (генериран отчет за ревю)

## Извън обхват

- Промени в Stripe/billing/auth.
- Преводи EN на ролите (вече има `translatePartyRole` в `LiveDraft.tsx` – ще се ползва наготово).
- AI prompt пренаписване в `generate-contract` – функцията вече получава `parties` от клиента, така че корекциите на данните автоматично разрешават и AI-генерираните клаузи.
