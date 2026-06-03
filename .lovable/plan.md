## Какво има днес и защо изглежда различно

Открих **четири** различни уизарда, всеки със собствен изглед и навигация:

| Уизард | Файл | Стил на стъпките |
|---|---|---|
| Legacy per-sector | `src/pages/Wizard.tsx` (895 реда) | **Един въпрос на страница** ("Въпрос X / N"), без секции |
| Bilingual | `src/pages/WizardBilingual.tsx` | preset / отделен поток |
| "Изготви документ" (custom) | `src/pages/BuildContract.tsx` | **Многостъпков stepper по секции** (Режим → Основни → …), показва _всички полета_ от секцията наведнъж |
| Graph (нов, динамичен) | `src/pages/WizardGraph.tsx` → `SplitWizard.tsx` | **Един въпрос на страница** (както legacy) |

Освен това всеки уизард рендира собствен page-chrome (заглавия, breadcrumbs, лента "Изтегли бланка"), което създава визуални различия дори когато съдържанието е същото.

Графовете (`src/data/questionGraphs/*.ts`) вече имат `sections: [{id,title,description?}]` и всеки въпрос си знае `section`-а — т.е. структурата за групиране **вече съществува**, просто не се ползва в UI-я.

## Цел

1. **Един общ компонент** за всички уизарди (graph и legacy).
2. **Стъпка = секция**, не въпрос. Всички видими въпроси от секцията се показват едновременно (като BuildContract).
3. **Динамична логика остава непокътната** — `visible_when`/`required_when` се ре-оценяват при всяка промяна; празни секции автоматично се прескачат; "Напред" блокирано докато има непопълнено required в текущата секция.
4. **Един визуален език** — stepper отгоре, серифен live preview отдясно, златни акценти. Page-chrome (breadcrumbs, "Изтегли бланка", RiskMeter) се рендира еднократно от страницата-обвивка.

## План за изпълнение

### 1. Refactor `SplitWizard.tsx` — секция-базиран stepper
- Заместване на `stepIdx` върху `resolved.active` (per question) с `stepIdx` върху `resolved.sections` (per section).
- Добавяне на хоризонтален stepper в стил BuildContract: `Стъпка X от N` + progress + клик-в-таб (само за вече валидирани секции).
- Рендериране на **всички** въпроси от текущата секция в `space-y-5`, всеки през `GraphQuestionField`.
- `canAdvance` = няма `missingRequired` ID, който е във въпросите на текущата секция.
- На последна секция → `Финализирай документа` (както сега).
- Live preview (дясна колона) — без промени.

### 2. `WizardGraph.tsx` chrome — без промяна на логиката
- Запазва sticky breadcrumb + "Изтегли празна бланка" + RiskMeter.
- `onProgress` callback от `SplitWizard` връща `{sectionIdx, totalSections, percent}` вместо per-question — лентата отгоре остава, но броячът става "Секция X / N".

### 3. Унификация на legacy `Wizard.tsx`
- Когато sector-ът има migrated graph (`getQuestionGraph(slug)`) — вече се редиректва към `/wizard-graph/:slug`. Това остава.
- За немигрираните: групиране на `flattenQuestions(sector)` по `question.section` (полето вече съществува в `Question`). Същият секция-stepper UI се изнася в споделен helper `<SectionedQuestionList>` под `src/components/wizard/`, за да го ползват и двата уизарда.
- Ако даден стар sector няма секции — fallback: целият списък като една секция "Въпроси".

### 4. Unified visual tokens
- Извличане на shared "wizard chrome" в малък компонент `WizardShell` (breadcrumb + blank-download bar + RiskMeter slot + children), използван от `Wizard.tsx`, `WizardGraph.tsx` и `WizardBilingual.tsx`. Това гарантира еднакъв изглед независимо от кой route влиза потребителят.

### 5. Не пипаме
- `BuildContract.tsx` — той има напълно различни стъпки (Режим, Двуезичен, Тип документ…), които не са въпроси от каталог. Запазва се както е, но визуално вече ще е консистентен с останалите (същите токени).
- Логика на графа, clauseEngine, clause definitions, експорти, AI поток.

## Технически детайли

- Нов helper в `src/lib/questionGraph.ts`: `getSectionStatus(graph, answers)` връща `[{id,title,filled,total,missing,visible}]` — използва се и за stepper, и за "section complete" чек.
- `SplitWizard` props разширяват с `mode?: "section" | "question"` (default `"section"`) за обратна съвместимост, но всички routes ще ползват `section`.
- За плавно превключване между секции — `requestAnimationFrame` scroll-to-top на лявата колона (вече има).
- Persist: `localStorage` запазва `answers` + `currentSectionId` (по id, не по индекс, за да оцелее при промяна на видими секции).

## Файлове за промяна

- `src/components/wizard/SplitWizard.tsx` — section stepper rewrite
- `src/components/wizard/SectionedQuestionList.tsx` — нов, споделен
- `src/components/wizard/WizardShell.tsx` — нов, споделен chrome
- `src/lib/questionGraph.ts` — добавя `getSectionStatus`
- `src/pages/WizardGraph.tsx` — ползва `WizardShell` + per-section progress
- `src/pages/Wizard.tsx` — ползва `WizardShell` + `SectionedQuestionList` за немигрирани шаблони
- `src/pages/WizardBilingual.tsx` — обвива в `WizardShell`

## Резултат за потребителя

- Един и същ изглед навсякъде (graph, legacy, bilingual).
- Всяка стъпка = логическа секция с няколко въпроса наведнъж — както в "Изготви документ".
- Динамичното дърво си работи: невидими въпроси не се броят, "Напред" чака само това, което реално е задължително _в момента_.
