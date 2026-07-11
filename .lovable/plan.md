## Цел
1. Изчистване на грешката "Edge Function returned a non-2xx status code" (най-често прикрит 429 rate-limit — `supabase.functions.invoke` хвърля преди да прочетем `data.error`).
2. Пълно премахване на разделянето между обикновен уизард (`/wizard/*`) и динамичен graph уизард (`/wizard-graph/*`). Оригиналният UI на `Wizard.tsx` става единственият.
3. Динамичните `QuestionGraph` дефиниции стават източник на **разширени + условни под-въпроси** за конкретния документ, но се сервират през същия wizard интерфейс, същия `generate-contract`, същия `apply-corrections` flow.

---

## Част 1 — Fix на генерирането (веднага, преди рефактора)

**Проблем:** `WizardReview.tsx` (и Wizard.tsx) правят `supabase.functions.invoke(...)`. Когато функцията върне 4xx/5xx (напр. 429 при hit на 5/24h лимита), клиентът получава `FunctionsHttpError: Edge Function returned a non-2xx status code` **преди** да прочете `data.error`. Toast-ът показва generic съобщение, а не полезното "Достигнахте дневния лимит…".

**Fix:**
- Универсален helper `invokeWithError()` в `src/lib/invokeEdgeFunction.ts` който:
  1. При `FunctionsHttpError` вади response body (`await err.context.json()`), връща `{ data, error }` в познатия формат.
  2. Разпознава `code: "rate_limited"`, `"quota_exceeded"`, `"needs_confirmation"` и връща структурно.
- Замяна на `supabase.functions.invoke("generate-contract"...)` и `"apply-corrections"` call-сайтовете в `WizardReview.tsx` и `Wizard.tsx` с новия helper.
- Toast-овете вече ще показват реалната причина ("Достигнахте дневния лимит от 5 генерации. Опитайте утре или вземете Pro").

---

## Част 2 — Разширение на обикновения Wizard с условни под-въпроси

`Wizard.tsx` работи с `SectorConfig.questions: WizardQuestion[]` (плосък списък). Ще добавим опционално поле `showIf?: (answers) => boolean` (или JSON правило `{ dependsOn, equals }`) на съществуващия `WizardQuestion` тип.

**Промени:**
- `src/types/wizard.ts` (или където е `WizardQuestion`): добавяме `showIf?: { dependsOn: string; equals?: string | string[]; notEmpty?: boolean }`.
- `Wizard.tsx` `buildQuestions()`: филтрира въпросите преди рендера през текущите `answers`. Скритите въпроси не участват във валидацията и в брояча за прогреса.
- Progress bar и "Стъпка X от Y" се преизчисляват динамично от **видимите** въпроси.

Това е точно "динамични под-въпроси според отговор" — реализирано в оригиналния UI, без нов routing/компонент.

---

## Част 3 — Миграция на `QuestionGraph` към същия wizard

Съществуващите 5 файла в `src/data/questionGraphs/` (`dogovor-za-izrabotka.ts`, `dogovor-za-naem-na-zhilishte.ts`, `grazhdanski-dogovor-dogovor-za-uslugi.ts`, `nda-dogovor-za-konfidentsialnost.ts` + `_bulk20*`) съдържат по-задълбочени въпроси. Ще ги превърнем в `SubWizardConfig` overrides.

**Стъпки:**
- Нов адаптер `src/data/questionGraphs/adapter.ts`: `graphToSubWizardQuestions(graph)` → плосък списък `WizardQuestion[]` с `showIf` правила изведени от `graph.branches` / `graph.nextIf`.
- В `getSubWizard(sector, docName)` (или на подобно място): ако има graph за този slug, използвай неговите въпроси вместо/като добавка към базовите. **Едно правило**: graph = разширен набор за конкретен документ, не отделен flow.
- `WizardReview.tsx` логиката (analysis + corrections) вече ще идва от единия wizard — тя вече вика `generate-contract` и `apply-corrections`, същите функции които обикновеният ползва. Няма разделение.

---

## Част 4 — Премахване на `/wizard-graph` route

- В `Wizard.tsx` вече има redirect към `/wizard-graph` (ред 66-69) — **обръщаме го**: `/wizard-graph/:slug` → `Navigate` към `/wizard/:sectorId?doc=...` (с mapping през `CATALOG`).
- Изтриваме компонентите `src/pages/WizardGraph.tsx`, `src/pages/WizardReview.tsx` (graph-версията) — тяхната логика вече живее в `Wizard.tsx`.
- `SplitWizard.tsx`, `GraphQuestionField.tsx` — маркирани за изтриване, ако няма други референции извън тях самите.
- Route дефиницията в `App.tsx` за `/wizard-graph/*` става `<Navigate to="/wizard/..." replace />` за backward compat на споделени линкове.
- Корекциите **вече** ще минават през същия `apply-corrections` от единия wizard — разделение отпада автоматично.

---

## Технически детайли (за реф.)

Файлове за промяна:
- **Нов:** `src/lib/invokeEdgeFunction.ts`, `src/data/questionGraphs/adapter.ts`
- **Промени:** `src/pages/Wizard.tsx`, `src/pages/WizardReview.tsx` (legacy graph-version изтрит), `src/App.tsx` (route redirect), `src/types/wizard.ts` (или еквивалент — `showIf`), `src/data/sectors.ts` / catalog за mapping slug↔sector.
- **Изтрити:** `src/pages/WizardGraph.tsx`, `src/pages/WizardReview.tsx` (ако е само за graph — иначе се преправя).
- **Запазени:** `src/data/questionGraphs/*.ts` (превърнати през адаптера — без пренаписване на съдържанието).

Backend: **никакви промени** в edge функциите — цялата унификация е клиентска. `generate-contract`, `apply-corrections`, `download-blank` вече работят с единия payload формат.

Тестов план:
1. Отваряме документ **с** graph (напр. "Договор за наем на жилище") — виждаме условните под-въпроси в оригиналния UI, генерирането минава.
2. Отваряме документ **без** graph (напр. "Разписка за получена сума") — работи както преди.
3. Правим корекция → пуска се `apply-corrections` → нова версия идва (същият flow за двата типа).
4. Отваряме стар линк `/wizard-graph/dogovor-za-naem-na-zhilishte` → redirect към новия route без загуба на прогрес.

---

## Обхват
~6-8 файла променени, ~2 изтрити, 2 нови. Няма database миграции, няма нови edge функции, няма нови зависимости. Backward compat за стари линкове чрез redirect.