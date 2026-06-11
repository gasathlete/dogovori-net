# Пълен синхрон чат ↔ платформа (DogovaryAI агент)

Чатът ще стане истински агент, който чрез **tool calling** навигира, търси шаблони, стартира BuildContract с pre-fill и инициира анализ на качен договор. Премахваме ръчното SSE парсване и преминаваме към **AI SDK** (`streamText` + `tool` + `toUIMessageStreamResponse`).

## Архитектура

```text
┌────────────────────────────────────────────────────────┐
│ AssistantChat (useChat от @ai-sdk/react)               │
│  └─ message.parts → render text + tool UI cards        │
│  └─ client tool handlers (navigate, prefill_build,     │
│     open_upload, open_template) изпълняват действия    │
└─────────────┬──────────────────────────────────────────┘
              │ POST /functions/v1/assistant-chat
              ▼
┌────────────────────────────────────────────────────────┐
│ Edge function assistant-chat                            │
│  - Auth, PRO/Team gate, RAG, illegal-content guard      │
│  - streamText({ model, tools, stopWhen: stepCountIs(8) })│
│  - Server-side tools:                                   │
│      • search_templates(query)  → template_search_index │
│      • get_template(slug)       → template_clauses      │
│      • list_user_documents()    → saved_documents       │
│  - Client-side tools (без execute, ползват confirm):   │
│      • navigate(path)                                   │
│      • prefill_build_contract({ templateSlug, fields }) │
│      • open_upload_analyzer()                           │
│      • open_template(slug)                              │
│  - toUIMessageStreamResponse({ originalMessages,        │
│      onFinish: persist в assistant_messages })          │
└────────────────────────────────────────────────────────┘
```

## Стъпки

### 1. Edge function `assistant-chat` — миграция към AI SDK
- Заменям raw `fetch` към gateway-а с `createLovableAiGatewayProvider` + `streamText` от `npm:ai`.
- Дефинирам `tools` с `inputSchema` (Zod) и описания на български.
- Server-side `execute`: `search_templates`, `get_template`, `list_user_documents` — четат от вече съществуващите таблици.
- Client-side tools (без `execute`) за UI действия — те се изпълняват в браузъра.
- `stopWhen: stepCountIs(8)` за multi-step разсъждение.
- Запазвам `convertToModelMessages(messages)`, `originalMessages`, и `onFinish` за persist на `UIMessage` в `assistant_messages` (нова колона `parts jsonb`, fallback на `content`).
- Запазваме RAG/illegal guard/PRO gate както са.

### 2. Системен prompt — обновяване
Кратък нов раздел "ИНСТРУМЕНТИ" с правила:
- Преди да дадеш линк за каталог/шаблон — извикай `search_templates`.
- Когато потребителят иска "направи договор за X" — извикай `prefill_build_contract`.
- Когато иска "анализирай моя договор" — извикай `open_upload_analyzer`.
- При навигация — `navigate` вместо markdown линк.

### 3. Frontend `AssistantChat.tsx` — пренаписване с AI SDK
- `useChat` + `DefaultChatTransport({ api: <edge function URL>, headers: { Authorization, apikey } })`.
- `id = activeThreadId` (за thread сегрегация и remount).
- Зареждаме история от `assistant_messages` като `UIMessage[]` (parts) при смяна на thread.
- Рендер през `message.parts`:
  - `type === "text"` → ReactMarkdown.
  - `type === "tool-<name>"` → специализиран card (виж 4).
- Composer запазва `status === "submitted" | "streaming"` за loading.
- Persist на `activeThreadId` в localStorage остава.

### 4. Tool UI карти (in-chat)
Малки компоненти в `src/components/assistant/tools/`:
- **TemplateResultsCard** — резултат от `search_templates`: списък с шаблони, бутон "Отвори" → `navigate(/shablon/...)`.
- **NavigateCard** — "Отивам към ...", auto-confirm + бутон Отмени.
- **PrefillBuildCard** — резюме на полета + бутон "Стартирай wizard-а" (отваря `/build?prefill=<id>`).
- **UploadAnalyzerCard** — бутон "Отвори анализатор".
Всеки card има `defaultOpen={false}` accordion за raw input/output.

### 5. Client tool изпълнение
В `AssistantChat` дефинирам `onToolCall` handler:
```ts
case "navigate": navigate(args.path); return { ok: true };
case "prefill_build_contract":
  sessionStorage.setItem("dogovaryai_prefill", JSON.stringify(args));
  navigate("/build?prefill=dogovaryai"); return { ok: true };
case "open_upload_analyzer":
  navigate("/analyze"); return { ok: true };
case "open_template":
  navigate(`/shablon/${args.slug}`); return { ok: true };
```

### 6. BuildContract pre-fill съвместимост
- В `src/pages/BuildContract.tsx` чета `sessionStorage["dogovaryai_prefill"]` при mount и попълвам полетата (минимална промяна — само ако вече има state shape).
- Toast: "DogovaryAI предложи стойности — прегледай и редактирай".

### 7. Persistence schema
- Миграция: `ALTER TABLE assistant_messages ADD COLUMN parts jsonb` (nullable, fallback към `content`).
- При зареждане на thread: ако `parts` е null → конструирай `UIMessage` от `content`.

### 8. assistant-chat-anon
- Анонимната версия получава SAMO `search_templates` + `navigate` + `open_template` (без user-specific tools).

## Извън скоупа (потвърди, ако трябва)
- Реално качване на файл от чата (drag-drop в композера) — за сега отваряме страницата `/analyze`.
- Създаване на kits/папки през чат — оставяме за следваща итерация.
- Автономно изпращане за подпис — изисква отделен approval flow.

## Технически бележки
- Използваме `google/gemini-2.5-flash` за обикновени потребители, `openai/gpt-5` за Предприемач (както сега).
- Tool calls се броят като 1 операция от месечната AI квота само на финалния assistant message (не на всяка стъпка).
- CORS, auth, RAG, illegal-content guard — без промяна.

## Файлове за промяна
- `supabase/functions/assistant-chat/index.ts` — пълно пренаписване с AI SDK + tools
- `supabase/functions/assistant-chat-anon/index.ts` — същата миграция, ограничен tool set
- `supabase/functions/_shared/ai-gateway.ts` — нов (provider helper)
- `supabase/functions/_shared/assistant-tools.ts` — нов (server tool definitions)
- `src/components/AssistantChat.tsx` — миграция към `useChat` + parts rendering + tool handlers
- `src/components/assistant/tools/*.tsx` — нови UI карти (4 файла)
- `src/pages/BuildContract.tsx` — четене на prefill от sessionStorage
- Migration: `parts jsonb` колона в `assistant_messages`
