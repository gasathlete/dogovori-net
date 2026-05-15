
# AI Чат Асистент за PRO + Team

24/7 чист AI бот (Lovable AI / Gemini), достъпен само за PRO и Team абонати, вграден в `/account` и при работа с документ. Помага с навигация, документи, правни въпроси и техническа поддръжка.

## Backend

**Нова edge функция:** `supabase/functions/assistant-chat/index.ts`
- Streaming чат през AI SDK + Lovable AI Gateway, модел `google/gemini-3-flash-preview`.
- JWT валидация; проверка че user е PRO (`download_quota.plan='pro'` или активен `pro_until`) или член на активен Team.
- Връща 402/403 ако не е PRO/Team — клиентът показва upgrade покана.
- Брои операциите през `consume_quota('analysis')` или `consume_team_quota` (1 операция на изпратено съобщение), за да не се изхарчат кредити безконтролно.
- Системен промпт на български с цялата контекстна база за Dogovori.net (виж по-долу).

**База данни (нова миграция):**
- `assistant_threads` — `id`, `user_id`, `title`, `created_at`, `updated_at`
- `assistant_messages` — `id`, `thread_id`, `role` (`user|assistant`), `content`, `created_at`
- RLS: само собственикът чете/пише; cascade delete с user
- Едно активно (последно) thread per user в `/account`; бутон "Нов разговор"

## Системен промпт (4 области)

Ботът е "Правен асистент Dogovori.net" — ясно дефинирани компетенции:

1. **Навигация** — знае структурата: `/catalog`, `/build`, `/sektor/{business|real-estate|employment|it}`, `/shablon/{slug}`, `/account`, `/team`, блог. Връща markdown линкове.
2. **Помощ с документи** — обяснява клаузи, какво да въведе в полета на wizard-а, как работи risk-анализа, как се подписва електронно, експорт PDF/DOCX.
3. **Правни въпроси** — общи насоки по ЗЗД, ТЗ, КТ, СК, ЗУТ, GDPR с **задължителен дисклеймър**: "Това не е правен съвет; за конкретен казус — консултирайте адвокат."
4. **Техническа поддръжка** — quota, плащане, Stripe checkout, грешки при export, споделяне за подпис, team seats.

Промптът включва: списък шаблони (от `CATALOG`), обяснение на quota системата, текущ потребителски контекст (PRO/Team статус, оставащи операции — подавани при всяко съобщение).

## Frontend

**Нов компонент:** `src/components/AssistantChat.tsx`
- AI Elements (`bun x ai-elements@latest add conversation message prompt-input shimmer`)
- `useChat` от AI SDK с `DefaultChatTransport` сочещ към edge функцията (с JWT header)
- Render на `message.parts` + markdown (`react-markdown` вече се използва в проекта)
- Loading indicator "Мисля..." докато статус е `submitted`
- Empty state: 4 quick-action чипа ("Намери шаблон", "Обясни клауза", "Проблем с плащане", "Как се подписва")
- Auto-focus на textarea
- Запис на assistant съобщение в `onFinish`

**Hook:** `src/hooks/useIsPro.tsx`
- Връща `{ isPro, isTeam, loading }` — чете `download_quota` + `useTeam()`

**Интеграция:**
1. `src/pages/Account.tsx` — нов таб "AI Асистент" (или секция най-отгоре) с `<AssistantChat />`. За не-PRO/Team — paywall карта с upgrade CTA.
2. `src/pages/Document.tsx` — добавя collapsible панел/dialog "Помощ от AI" с `<AssistantChat documentContext={...}>`, който подава id/тип на текущия документ в системния промпт.

**Достъп:** само PRO + Team. Free потребители виждат заключен изглед с обяснение и линк към upgrade.

## Файлове

```
supabase/functions/assistant-chat/index.ts          (нов)
supabase/functions/_shared/ai-gateway.ts            (нов helper)
supabase/migrations/<ts>_assistant_threads.sql      (нов)
src/components/AssistantChat.tsx                    (нов)
src/components/AssistantPaywall.tsx                 (нов)
src/components/ai-elements/*                        (нов чрез ai-elements CLI)
src/hooks/useIsPro.tsx                              (нов)
src/pages/Account.tsx                               (редакция — нов таб)
src/pages/Document.tsx                              (редакция — помощен панел)
```

## Технически детайли

- **AI SDK пакети:** `ai`, `@ai-sdk/openai-compatible`, `@ai-sdk/react`, `zod`, `react-markdown` (вече има)
- **Streaming:** `toUIMessageStreamResponse({ originalMessages, onFinish })` — assistant message се записва в `assistant_messages` в `onFinish`
- **Контекст:** при всяко обаждане сървърът добавя в system prompt: PRO статус, оставащи операции, текуща страница (подавана от клиента), ID на документ ако е приложимо
- **Quota:** 1 съобщение = 1 операция към `pro_monthly_used` (PRO 100/мес) или `team_usage` (seats × 100)
- **Сигурност:** JWT verify в код, `verify_jwt = false` в config.toml, RLS на новите таблици, никакви API ключове на клиента
- **Дисклеймър:** UI бадж "AI асистент — общи насоки, не правен съвет"

## Какво НЕ влиза в този план
- Ескалация към човек/имейл (избрано: чист AI)
- Floating bubble на всички страници (избрано: само в профила)
- Достъп за Free (избрано: само PRO/Team — paywall)
- RAG/vector search върху всички шаблони (системният промпт е достатъчен за v1; може после)
