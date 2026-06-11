
# Цел

DogovaryAI да работи като Правен Интелект за договори, но върху нашия каталог 290+ шаблона: разбира на разговорен език какъв документ искаме, задава целеви въпроси, показва структура за потвърждение, и едва тогава генерира/попълва. Без откази без търсене, без "няма шаблон" преди опит.

# Какво прави Pravenintelekt по-добре от нас сега

1. **Не зависи от ключови думи.** "Искам трудов договор за счетоводител" → разпознава типа без slug.
2. **Целеви въпроси.** Поредица от 3–5 въпроса (срок, заплащане, прекратяване) преди генерация.
3. **Преглед на структура.** План на клаузите → потвърждение → генерация параграф по параграф.
4. **Източници.** Линкове към закони/практика при всеки отговор.
5. **Нула откази.** Винаги има следваща стъпка.

# Какво ще изградим

## 1. Intent expansion + по-умно търсене (`search_templates`)

- Преди FTS заявката, пускаме евтин LLM call (`gemini-3-flash-preview`) с фиксиран JSON output: `{ documentTypes: string[], synonyms: string[], category: "employment"|"real-estate"|"business"|"it"|"other" }`. Пример: вход *"договор за счетоводител"* → `{ documentTypes: ["трудов договор","договор за услуги"], synonyms: ["счетоводител","счетоводни услуги"], category: "employment" }`.
- Изпълняваме FTS върху обединения query, плюс ilike fallback по всеки токен (вече добавено), плюс директен филтър по `document_type` ако е в expansion.
- Връщаме до 5 резултата + `confidence` ("high"/"medium"/"low").
- Бонус: малък ръчно поддържан речник `bg-doc-intents.json` (~60 фрази) за топ интенти — изпълнява се преди LLM expansion (instant, нула tokens).

## 2. Нов client tool: `ask_clarification`

- Schema: `{ questions: Array<{ id, label, type: "text"|"choice"|"number"|"date", options?, placeholder? }>, contextSummary: string }`.
- UI: render в чата като компактна форма-карта (max 5 полета). Submit изпраща обратно структуриран answer като user message: `[CLARIFICATION] field=value; ...`.
- Promptът задължава: ако липсват критични полета (страни, предмет, срок) → ВИНАГИ `ask_clarification` преди `prefill_build_contract`.

## 3. Нов client tool: `propose_contract_outline`

- Schema: `{ title, clauses: Array<{ heading, summary }>, basedOnTemplateSlug?, estimatedFields: string[] }`.
- UI: карта със списък клаузи + бутони "Потвърди и попълни" (→ prefill_build_contract), "Промени структурата" (отваря текстово поле за корекции), "Покажи шаблона" (→ open_template).
- Промптът: след clarification → винаги outline preview преди prefill.

## 4. Гарантирани followup чипове (server-side safety net)

Сега моделът понякога пропуска `<followups>`. Ще:
- Парсираме на сървъра. Ако липсват → auto-generate 3 чипа въз основа на последно изпълнен tool (search → "Отвори първия", "Покажи още", "Попълни нов"; outline → "Потвърди", "Промени клаузите", "Покажи шаблона"; нищо → "Намери шаблон", "Качи договор за анализ", "Попълни нов договор").
- Изпращаме като отделен SSE event `followups` вместо inline tag — клиентът ги рендира независимо. Това премахва риска от грозен tag в текста при streaming.

## 5. Инлайн източници (legal citations) — по-настоятелно

- Вече имаме `legal.hasMatches` от RAG. Засилваме prompt: когато категория = employment/real-estate/business → отговорът ТРЯБВА да включва поне 1 markdown цитат в позволения формат `[чл. X ЗЗД](URL)`. Без цитат → followup "Покажи правното основание" се forc-ва.
- LegalCitations компонентът вече рендира chips отдолу — оставяме.

## 6. По-добри модели

- Standard: `google/gemini-2.5-flash` → `google/gemini-3-flash-preview` (новият default, по-добър tool calling).
- Premium (Предприемач/Екип): `openai/gpt-5` → `openai/gpt-5.2` (по-силно разсъждение, тестваме срещу gemini-3-pro-preview).
- Intent expansion: `google/gemini-3-flash-preview` (евтин, бърз).

## 7. Регресионен тест harness

Нов файл `supabase/functions/assistant-chat/__tests__/regression.ts` + npm script `bun run test:assistant`. Изпълнява 20 представителни заявки срещу deployed функцията и проверява:
- Tool-call rate ≥ 90% (никога не отказва без поне 1 tool).
- За документи: ≥ 1 от `{search_templates, open_template, prefill_build_contract, ask_clarification}`.
- Followups: 2–4 чипа във всеки отговор.
- Без забранени фрази ("за съжаление нямам", "не разполагам с").

Заявки (20):
```text
"искам трудов договор за счетоводител", "договор за наем на офис в София 800 EUR",
"NDA на двата езика", "пълномощно за продажба на кола",
"жалба срещу КАТ за глоба", "молба за отпуск", "договор за изработка на сайт",
"споразумение за раздяла на семейна вещ", "договор за заем между приятели 5000",
"анекс към трудов договор за повишение", "договор за франчайз на кафене",
"протокол от общо събрание на ООД", "оферта за СМР строителство",
"договор за поръчителство", "договор за дистрибуция в ЕС",
"спогодба за издръжка", "договор за консултантски услуги IT",
"трудов договор с изпитателен срок 6 месеца", "договор за наем на жилище с депозит",
"пълномощно за банкови операции"
```

Изход: markdown report в `/mnt/documents/assistant-regression.md` с pass/fail per case + латентност.

## 8. UI/UX подобрения в `AssistantChat.tsx`

- Нови карти: `ClarificationCard`, `OutlineCard`, `TemplateResultsCard` (replace generic AssistantToolCard за `search_templates`).
- Followup чиповете: премахваме inline parsing, четем от SSE `followups` event.
- При `search_templates` с 0 резултата → показваме CTA "Създай от нула" (prefill) вместо текст.

## Технически детайли

**Файлове за промяна:**
- `supabase/functions/assistant-chat/index.ts` — SSE followups event, server-side followup fallback, regression-friendly logging.
- `supabase/functions/_shared/assistant-tools.ts` — добавяме `ask_clarification`, `propose_contract_outline` schemas; intent expansion helper `expandIntent(query)`.
- `supabase/functions/_shared/bg-doc-intents.json` (нов) — ~60 phrase→intent mappings.
- `src/components/assistant/tools/ClarificationCard.tsx` (нов).
- `src/components/assistant/tools/OutlineCard.tsx` (нов).
- `src/components/assistant/tools/TemplateResultsCard.tsx` (нов).
- `src/components/AssistantChat.tsx` — нов SSE event handler, нови tool cards, рендер на clarification answer като user message.
- `supabase/functions/assistant-chat/__tests__/regression.ts` (нов).
- `package.json` — script `test:assistant`.

**Поведение на агента (final state machine):**

```text
user message
  ↓
intent expansion (dictionary → LLM fallback)
  ↓
search_templates (винаги, ако споменат документ)
  ↓
има резултат? ── да → ask_clarification (липсващи полета)
  │                       ↓
  │                  propose_contract_outline
  │                       ↓
  │                  prefill_build_contract → navigate /build
  │
  └── не → ask_clarification (общи полета)
              ↓
         propose_contract_outline (generic от нула)
              ↓
         prefill_build_contract
```

**Извън скоупа (отделен ход):**
- Параграф-по-параграф генерация на пълен договор директно в чата (Pravenintelekt-style финален документ). За сега prefill отваря wizard-а — там вече има пълна генерация.
- Caselaw/съдебна практика (Pravenintelekt я има, ние не — извън нашия offering).

## Резултат

След прилагане потребителят пише "искам трудов договор за счетоводител" и получава:
1. Кратко "Ще намеря подходящ шаблон…" + търсене.
2. Намерен шаблон + 4-полна форма (срок, заплата, изпитателен срок, дата на започване).
3. След submit → outline preview с клаузите.
4. След потвърждение → wizard prefilled, навигация автоматична.
5. Винаги 3 followup чипа на дъното.
