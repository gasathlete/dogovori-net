## Цел

Добавям **20 нови динамични уизарда** (QuestionGraph + clause definitions) към съществуващата система, без да чупя нищо. След това каталогът ще има **46 динамични уизарда** (4 ръчни + 22 в bulk1/bulk2 + 20 нови).

## Защо безопасно

- Цялата нова логика се изолира в **нов файл** `src/data/questionGraphs/_bulk20_part3.ts`, по същия pattern като `_bulk20.ts` и `_bulk20_part2.ts`.
- В регистъра в `dogovor-za-naem-na-zhilishte.ts` добавям един import + един `...spread`. Нула промени в `questionGraph.ts`, `clauseEngine.ts`, `WizardGraph.tsx`, downloads, метеринг.
- Всеки graph е напълно независим — счупване на един = счупване само на този slug, fallback маршрутът към стария `Wizard.tsx` остава непокътнат.
- Slug-овете трябва да съществуват като реални шаблони в каталога (catalog.ts / templateIndex), за да резолне роутингът. Преди commit ще ги сверя 1:1.

## Обхват (20 шаблона)

**Featured Blanks (5)** — пряко обвързани с homepage „Избрани от Договори нет":
1. `molba-za-napuskane-chl-326-kt`
2. `molba-za-platen-godishen-otpusk`
3. `zapis-na-zapoved`
4. `notarialno-pulnomoshtno-universalno`
5. `razpiska-za-poluchena-suma`

**HR / Кодекс на труда (8)**:
6. `molba-za-otpusk-po-maychinstvo`
7. `molba-za-neplaten-otpusk-chl-160-kt`
8. `zapoved-za-komandirovka`
9. `zapoved-za-otpusk`
10. `molba-za-promyana-na-rabotno-vreme`
11. `predizvestie-ot-rabotodatel-chl-328-kt`
12. `sluzhebna-belezhka-za-dohod`
13. `trudova-harakteristika`

**Граждански / финансови (7)**:
14. `pulnomoshtno-obshto`
15. `deklaratsiya-po-chl-313-nk`
16. `priemo-predavatelen-protokol-imot`
17. `priemo-predavatelen-protokol-vesht`
18. `anex-kum-dogovor-za-naem`
19. `dogovor-za-poruchitelstvo`
20. `raznoska-za-vrushtane-na-zaem`

> Списъкът ще се потвърди срещу catalog.ts/templateIndex преди build — ако някой slug липсва, се заменя с най-близкия съществуващ топ-търсен (slug мисмач = няма роутинг, затова е важно).

## Структура на всеки уизард

Спазвам същия DSL от bulk файловете:
- `sections` — Страни, Предмет, Условия, Подписи.
- `questions` — `field_type`: text/longtext/number/money/date/boolean/select/party_list, с `visible_when` / `required_when` / `affects_clauses`.
- `clauses` — `clause_id`, `order`, `title`, `body_md` с `{{var}}` плейсхолдъри, `include_when`, `severity` (required/recommended/optional).
- `signQuestions()` helper за стандартните подписи.

Сложност: 6–14 въпроса и 5–10 клаузи на шаблон (молбите по-малко, имотните протоколи и анексите по-сложни).

## Промени по файлове

```text
NEW   src/data/questionGraphs/_bulk20_part3.ts        // 20 graph + clause specs
EDIT  src/data/questionGraphs/dogovor-za-naem-na-zhilishte.ts
      // +1 import { BULK_GRAPHS_PART3 }
      // +1 spread в QUESTION_GRAPHS registry
```

Нищо друго не се пипа.

## Валидация преди завършване

1. `grep template_slug` срещу catalog.ts → 20/20 съвпадения.
2. `bun run test` — `questionGraph.test.ts` и `clauseEngine.test.ts` минават.
3. `bun run typecheck` / build — без TS грешки.
4. Smoke на 3 от новите slug-ове в WizardGraph (по 1 от всяка група).

## Извън обхват (за следващ спринт)

- Промяна на TOP_DOCUMENTS подредбата.
- Backfill в `template_clauses` Supabase таблицата (clause engine чете и от код, и от DB — кодовият път работи без миграция).
- Превод на graph-овете на английски / билингвал.
- Допълнителни 20+ шаблона — мога да добавя `_part4` по същия pattern, ако след прегледа решим, че капацитетът е достатъчен.

## Технически детайли

- `WizardGraph.tsx` вече използва `getQuestionGraph(slug)` от единствения registry — новите 20 автоматично стават достъпни на `/wizard/<slug>` без route промени.
- `Wizard.tsx` legacy fallback остава за всички шаблони без graph — обратна съвместимост 100%.
- `download-document` edge function и брояч на операции не се променят: новите шаблони използват същия `template`/`contract` kind.
