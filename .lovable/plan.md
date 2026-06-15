# DogovaryAI Workspace — пълноекранен режим

Цел: кликът върху бранд бутона **DogovaryAI** да отваря отделен пълноекранен AI-workspace (по модела на praven-intelekt.com), използвайки съществуващата ни логика (`AssistantChat`, `assistant-chat` / `assistant-chat-anon` edge функции, RAG с цитати, build/upload/sign flow). Минимално натрупване — без нов backend, без нова auth.

## 1. Нов маршрут и точки на влизане

- Нов route: **`/assistant`** (вече е „скрит prefix" в DogovAIBubble; ще го материализираме като реален пълноекранен layout) и **`/assistant/:threadId`** за индивидуален разговор.
- Кликът върху „DogovaryAI" (Header CTA, hero бутон, floating bubble FAB) → `navigate("/assistant")`. Старият popover bubble остава достъпен само на marketing страници като бърз shortcut; в `/assistant` той се скрива (вече е в `HIDDEN_PREFIXES`).
- `Header` получава нов CTA „Отвори DogovaryAI" (gold-accent), видим на десктоп и мобилно.

## 2. Layout на workspace-а (`src/pages/Assistant.tsx`)

Three-pane shell, full-height без footer, тъмен/светъл режим спазва текущата тема:

```text
┌────────────┬─────────────────────────────────┬──────────────┐
│ Threads    │ Conversation / Quick actions    │ Sources      │
│ sidebar    │ + composer                      │ (collapsible)│
└────────────┴─────────────────────────────────┴──────────────┘
```

- **Ляв панел (`AssistantThreadsSidebar`)** — „+ Нов разговор", търсачка, групиране по „Днес / Тази седмица / По-стари". Колапсва се чрез `shadcn-sidebar` (`collapsible="icon"`).
- **Център** — при празен thread: 4 големи action карти (вече ги имаме в `QUICK_ACTIONS` — обогатяваме до 6):
  1. **Правни проучвания** → RAG search в `legal_chunks`.
  2. **Проучване по съдебна практика** → филтрира RAG към `source_type=case_law`.
  3. **Анализ на документи** → отваря `UploadAnalyze` inline (drop-zone).
  4. **Създаване на документ** → отваря wizard избор (`/build`, `/wizard/:sector`).
  5. **Преговорен режим** → активира prompt от стъпка 2 (`ПРЕГОВОРЕН РЕЖИМ`).
  6. **Комплекти документи** → линк към `/komplekti`.
  Под картите: composer (текстарея + attach + send), starter chips, „AI избира модел" indicator.
- **Десен панел (`AssistantSourcesPanel`)** — auto-показва списък цитати от текущия разговор (от `LegalCitations`), с брояч (напр. „Източници 12"), линкове към официални публикации. Скрива се ако няма цитати.

Композиция: преизползваме `AssistantChat` като core; новата страница само го обвива в shell с трите панела. Никаква дублирана логика за streaming/threads.

## 3. Anonymous (нерегистриран) flow

- Кликът върху DogovaryAI винаги отваря `/assistant`, **дори без auth**.
- В anon режим:
  - Threads sidebar е скрит/disabled (single-session conversation, localStorage `dogovai_anon_chat_v2`, вече има).
  - Лимит **5 безплатни съобщения** (повишаваме от текущите 3) преди soft paywall — съответства на „encourage to try free".
  - Banner отгоре: „Безплатна проба · X / 5 съобщения · [Регистрирайте се за 15 безплатни]".
  - След лимита: блокира composer + показва inline регистрационна карта (email + Google), а не редирект.
- Бекенд: продължава да удря `assistant-chat-anon` edge функцията (rate-limit по IP + session е активен).

## 4. Registered (регистриран) flow

- 15 безплатни съобщения на месец **в DogovaryAI** като отделен квота-counter, **независимо** от съществуващите op-метрики (download/upload). „Други безплатни се запазват" → не пипаме `download_quota`.
- Реализация: нова колона `assistant_free_messages_used` (int, default 0) + `assistant_quota_reset_at` (date) в `profiles`, или нова `assistant_quota` table. Edge функция `assistant-chat` инкрементира при всеки **user**-message и връща 402 със ясен код когато се изчерпи.
- UI: вечен brand-pill долу-ляво (по подобие на конкурента): „Безплатен · 11/15 съобщения · [Надгради плана]".
- При изчерпване: модал с `PlanSelector` (вече съществува) — Предприемач 12.90 €/мес или single-op pack 1.90 € (5 op). Plan upgrade премахва counter (unlimited assistant messages = features.assistant_unlimited).

## 5. Streaming, threads, persistence

- Спазваме `chat-agent-ui-contract`: **threads + database persistence** за регистрирани.
- Вече има тaблици `assistant_threads` и `assistant_messages` (виж `<supabase-tables>`). Използваме ги — нищо ново.
- URL = source of truth: `/assistant/:threadId`. New chat → INSERT thread → navigate. Refresh на `/assistant/abc123` зарежда този thread. Chat компонентът се ремоунтва по `key={threadId}`.
- За anon: single conversation, без route param.

## 6. „Над конкурента" — какво добавяме над praven-intelekt.com

Дребни функционалности, които вече имаме и просто ги изваждаме във workspace-а:

- **Drag-drop анализ направо в чата** → reuse `UploadAnalyze` като inline tool card (`AssistantToolCard` вече рендерира tool events).
- **Build-to-chat hand-off** — от съобщение „Създай ми трудов договор за…" → бутон „Отвори в Builder" (preserves draft в `assistantDraftStore`).
- **Преговорен режим toggle** в composer (chip "🤝 Преговори") — задава режима от стъпка 2.
- **Структурирани цитати** в десния панел с badges (ЗЗП/ЗЕТ/GDPR/ЕС) — реализирано в стъпка 3.
- **Поделяне на разговор** — генерира shared link (вече имаме `shared_links` инфраструктура) → read-only публичен URL.
- **Експорт на разговор** в PDF/DOCX (reuse on-the-fly DOCX генератора).
- **Pin / favourite threads** (`pinned` boolean колона) — UX подобрение над конкурента.

## 7. Технически детайли

- Нов `src/pages/Assistant.tsx` + `src/components/assistant/AssistantThreadsSidebar.tsx` + `AssistantSourcesPanel.tsx` + `AssistantQuotaBadge.tsx`.
- `AssistantChat.tsx` рефакторираме на „dumb" body (приема `threadId` от prop вместо да го пази в local storage) — backwards compatible.
- Routes: `/assistant`, `/assistant/:threadId` (публични — guard само за thread-ownership; anon → fallback single-session).
- Quota: миграция → нови колони + UPDATE-trigger в `assistant-chat` edge функцията (атомарен инкремент). Връща `429 quota_exceeded`. Pricing-plan check преди инкремент (Pro = bypass).
- `Header` нов CTA + `Hero` бутон „Отвори DogovaryAI workspace" заменя/допълва съществуващите.
- AI Elements: проверяваме инсталирани компоненти (`Conversation`, `Message`, `PromptInput`, `Tool`, `Shimmer`). Ако липсват — `bunx ai-elements@latest add conversation message prompt-input tool shimmer`. Преизползваме съществуващите `LegalCitations` и `AssistantToolCard` за вложеното рендериране.
- Спазваме design системата: gold accent за CTA, без custom colors, semantic tokens, responsive.

## 8. Извън scope (умишлено)

- Без нова backend AI логика — същият prompt от стъпки 1–3.
- Без промяна на pricing/op-метриките (memory: 12.90 € / 10.90 € seat / 1.90 € pack).
- Без преписване на `assistant-chat` или `assistant-chat-anon` функциите.
- Без локализация в момента (UI остава български, спазвайки текущата практика).

## 9. Приемни критерии

1. Клик върху „DogovaryAI" (Header/Hero/Bubble) отваря `/assistant` пълноекранно.
2. Anon с 0 съобщения вижда 6 action карти + composer + banner „5 безплатни".
3. Anon след 5-тото съобщение е блокиран със soft paywall (регистрация).
4. Регистриран user вижда thread sidebar, може да създава/изтрива/превключва threads, рефрешът на `/assistant/:id` възстановява разговора.
5. След 15-тото съобщение в месеца — модал за upgrade, без да чупи download/upload квотата.
6. Drop на PDF/DOCX в композера стартира анализ inline; clicking „Създай документ" в стартовите карти отваря wizard избор.
7. Десният панел показва цитати със source_id/article/version_date чипове (стъпка 3).
8. Build / typecheck минават; съществуващите страници и flow-ове не са счупени.

При одобрение пускам в build с тази последователност: миграция за quota → routes/page shell → threads sidebar → sources panel → quota badge & paywall → header/hero CTA → QA.