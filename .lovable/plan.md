## Защо адвокатът изглежда по-силен

Три причини, не една:

1. **Различен модел.** DogovaryAI работи с модела, записан в `ai_prompts.model` за `assistant-chat` — на практика `google/gemini-3-flash-preview` (бърз/евтин, default). Адвокатът в симулацията върви на `google/gemini-2.5-pro` (или друг premium от dropdown-а). Pro модел срещу flash — разликата е огромна точно в нюанси на ЗЗД/ТЗ/КТ.
2. **По-лесна задача.** Адвокатът само **чете** отговора и **съди** срещу системния промпт, който му е подаден като reference. DogovaryAI трябва да **генерира** отговор, да спазва канона (без индивидуален съвет, без чуждо право), да вика правилните tools и да цитира норми. Judge >> Generator при еднакъв модел.
3. **Без tool overhead.** Адвокатът няма tool calls, JSON-only output, ниска температура → стабилен. DogovaryAI има 5+ tools, multi-iteration loop, по-висока темп.

## Можем ли да го направим бот? Да — на два слоя

### Слой 1 (симулация): избор на DogovaryAI модел

В `RunTab` на `/admin/ai-simulation` вече има `dogovaryModel` в body-то на edge функцията, но UI липсва. Добавяме:

- Dropdown **"Модел на DogovaryAI"** със същия списък като адвоката (`google/gemini-2.5-pro`, `gemini-3.1-pro-preview`, `openai/gpt-5.4-pro`, и т.н.).
- Default = текущо активният модел от `ai_prompts` (зареден чрез нов light RPC/select при mount).
- Чек-бокс **"Същият модел и за двамата"** — бързо A/B: ако адвокатът е pro, нека и ботът е pro; ще покаже дали слабостта е от модел или от промпт.

Така админът може **в рамките на 1 симулация** да види дали същият въпрос с Gemini 2.5 Pro / GPT-5.4 дава по-добър отговор.

### Слой 2 (продукция): повишаване на модела

Ако симулацията потвърди, че по-силен модел оправя нещата, нужен е едноклик за **прехвърляне в продукция**:

- В `HistoryTab` за всяка завършена сесия — бутон **"Направи това модел на продукцията"** (показва се само ако `dogovaryModel ≠ активния модел`).
- Действие: `UPDATE ai_prompts SET model = <sessionDogovaryModel> WHERE function_name = 'assistant-chat' AND is_active = true`. Без нова версия — само смяна на модела (запазваме промпта непроменен).
- Confirm dialog с warning за цена/латентност + audit log запис (`logAiAudit`-стил, ако е достъпно от клиента; иначе нова мини edge функция `set-active-prompt-model` с `is_staff` guard).
- Toast + рефреш.

Бонус (по желание, маркирано в плана като optional): добавяме колонка `premium_model` use — ако вече има `premium_model` поле в `ai_prompts`, можем да го попълним и да маршрутизираме pro потребители към по-силен модел, а free към flash. Това НЕ влиза в този PR — само споменато.

## Засегнати файлове

- `src/pages/AdminAiSimulation.tsx` — нов dropdown + checkbox в RunTab; бутон "Направи продукционен" в HistoryTab; lookup на активния модел при mount.
- `supabase/functions/simulation-run/index.ts` — записваме `dogovary_model` в `ai_simulation_sessions` (вече има го като поле? проверка; ако не — нова колонка чрез migration или reuse на `lawyer_model` стил).
- Нова migration: `ALTER TABLE ai_simulation_sessions ADD COLUMN dogovary_model text;` (за да го показваме в историята и да го промотираме).
- Нова edge функция `set-active-prompt-model` (~30 реда, `is_staff` guard) или inline supabase update от клиента, ако RLS позволи staff write върху `ai_prompts.model`.

## Какво НЕ правим

- Не сменяме модела на продукцията автоматично.
- Не пипаме промпта/секциите — това е работа на patcher-а от предишната стъпка.
- Не въвеждаме нов pricing tier / premium routing — само инфраструктура за ръчно повишаване.

## Резултат

След плана админът може да:
1. Стартира симулация с произволен модел за DogovaryAI (или едновременно за двамата).
2. Сравни avg score между моделите в History.
3. С един клик да направи победителя продукционен модел.
