# Решение срещу халюцинации в риск-анализа

## Проблем
Текущият `analyze-contract` използва `google/gemini-2.5-flash-lite` като основен модел (ескалира до `flash` само ако върне 0 issues при дълъг текст). Това е твърде слаб модел за правен анализ и няма механизъм, който да задължи AI да цитира дословно от договора. Резултат: AI измисля клаузи, които ги няма в текста.

## Стратегия (4 защитни слоя)

### 1. По-силен модел по подразбиране
Сменяме основния модел от `gemini-2.5-flash-lite` → `google/gemini-2.5-pro` за реалния правен анализ. Lite остава само за бърза класификация на тип договор (по избор, за пестене на токени). Pro е значително по-точен на български правен текст и много по-малко халюцинира.

### 2. Задължително дословно цитиране (grounding)
Променяме system prompt-а и схемата така, че всеки `issue` ТРЯБВА да съдържа поле `clause_quote` — точен цитат (verbatim) от договора. Ако AI не може да цитира дословно, не може да повдига issue. Това е стандартната anti-hallucination техника за RAG/document QA.

### 3. Server-side валидация на цитатите
След като AI върне JSON, на сървъра проверяваме за всеки issue дали `clause_quote` (нормализиран — collapse whitespace, lowercase) се съдържа в `extracted_text`. Issues, които не минат проверката, се:
- маркират с `unverified: true` и сваляне на severity, или
- директно филтрират (по-строгият вариант, който препоръчвам)

Същото за `missing_clauses` — добавяме евристика: ако AI казва "липсва Форсмажор", но в текста се среща думата "форсмажор/непреодолима сила", не го връщаме.

### 4. Прозрачност към потребителя
- В UI добавяме малък индикатор "✓ Цитат потвърден от текста" до всяко issue
- Score не пада под определен праг ако всички issues са unverified
- Дисклеймър: "AI може да греши — винаги преглеждайте оригинала"

## Технически промени

**`supabase/functions/analyze-contract/index.ts`:**
- `model = "google/gemini-2.5-pro"` (от `flash-lite`)
- Нов SYSTEM_PROMPT с изрично изискване за `clause_quote` (verbatim, до 300 знака, на кирилица както е в договора)
- Schema за issue: `{severity, title, clause_quote, explanation, suggestion}`
- Нова функция `verifyIssues(issues, sourceText)` — нормализира whitespace+case и проверява substring; връща `{verified, filtered}`
- За `missing_clauses` — keyword check срещу нормализирания текст преди да ги върне
- Записваме `verified_count` / `filtered_count` в `risk_analyses` (опционално нова колона за метрики)
- Кеш ключът остава същия (normalized hash), но invalidate-ваме стария cache чрез добавяне на версия на промпта в hash-а — иначе старите халюцинации ще се връщат от cache

**Frontend (`src/components/wizard/RiskReport.tsx` и UploadedContract страницата):**
- Изобразяване на `clause_quote` в всеки issue card (като blockquote)
- Badge "Потвърден цитат" когато е verified

## Цена и латентност
- Gemini 2.5 Pro е ~5-10x по-скъп от flash-lite, но един договор струва центове
- Латентност: +3-8 секунди — приемливо за критична правна функция
- Кеширането остава (normalized hash), така че повторни анализи са безплатни и моментални

## План за изпълнение
1. Update edge function (промпт + модел + валидация)
2. Migration: добавяме `verified_issues_count`, `filtered_issues_count` в `risk_analyses` (за наблюдение на качеството)
3. Update frontend компонентите да показват цитата и verified badge
4. Deploy и тест с проблемния договор от потребителя

Искате ли да продължа с имплементацията?