
## 1. Преименуване: DogovAI → DogovaryAI

Глобална замяна на видимото име на бота навсякъде, където потребителят го вижда. Технически идентификатори (имена на edge функции `assistant-chat` / `assistant-chat-anon`, компонент `DogovAIBubble`) **остават същите**, за да не чупим импорти, кеш на supabase, аналитика и DB. Сменяме само лейбъли/копирайт.

Файлове за update:
- `src/components/DogovAIBubble.tsx` — всички видими стрингове: "DogovAI" → "DogovaryAI" (заглавие, alt, placeholder, aria-label, "Здравейте, аз съм…", CTA в края).
- `src/components/FloatingAssistant.tsx` — "Чат поддръжка" → "DogovaryAI" (header + aria).
- `src/pages/Account.tsx` — "Чат поддръжка 24/7" → "DogovaryAI 24/7".
- `supabase/functions/assistant-chat/index.ts` — `SYSTEM_PROMPT`: името "Dogovori AI" → "DogovaryAI".
- `supabase/functions/assistant-chat-anon/index.ts` — същото + CTA "пълен достъп до Dogovori AI" → "до DogovaryAI".
- `index.html` — title/meta ако споменават старото име (проверка).

## 2. Оптимизация — конкурентно ниво (pravenintelekt.com)

Pravenintelekt бие с три неща: **(а) отговори от официални източници с линкове към член/параграф**, **(б) ясни модули за различни задачи**, **(в) прозрачност за данни и модели**. В нашия проект вече има инфраструктура за това — `supabase/functions/_shared/legal-rag.ts` + `legal-chunker.ts` + админ панела за индексирани източници. Използваме я докрай.

### 2.1 Grounded отговори с цитати (и в анонимния бот)

Сега `assistant-chat-anon` НЕ вика `retrieveLegalContext()` — заради което отговорите са "плоски" и без линкове. Добавяме:
- В `assistant-chat-anon` извикваме `retrieveLegalContext(userQuery)` преди gateway-кол, инжектираме `promptBlock` в system prompt.
- Връщаме `citations: LegalCitation[]` в JSON отговора (top 3, дедуплицирани).
- `assistant-chat` (PRO) — вече ползва RAG; добавяме същата форма на цитати в стрийма (стандартен `<sources>…</sources>` маркер преди `<followups>`).

### 2.2 Рендериране на цитати в UI

В `DogovAIBubble.tsx` под всеки assistant message:
- Малък разделител "Източници" + chip-ове с `citation_label` (напр. "ЗЗД, чл. 79, ал. 1"), линкващи към `official_url` (target=\_blank, rel=noopener).
- Ако `hasMatches=false`, надпис "Общ отговор — не е намерен пряк нормативен източник" (честност вместо халюцинация).

### 2.3 Режими (модули) в системния промпт

Подобно на конкурента ("Правни проучвания", "Чернови", "Анализ"), но в нашия скоуп (договори). В пълния `assistant-chat` въвеждаме 3 явни режима, които моделът сам разпознава от въпроса:
1. **Намери документ** — насочване към `/catalog`, `/build`, `/shablon/SLUG`.
2. **Обясни клауза/термин** — кратко определение + relevant ЗЗД/ТЗ/КТ/СК + линк.
3. **Помощ при попълване** — изброява нужните данни (страни, ЕГН/ЕИК, предмет, цена, срокове, неустойки).

### 2.4 Подобрения на промптите (и двата файла)

- Forbid "не знам как се казва законът" → ако няма цитат, кажи го честно ("Не открих пряк източник в базата на DogovaryAI").
- Дисклеймърът — кратък еднократен tag `_(Обща информация, не правен съвет.)_` накрая, не повтаряме във всеки отговор.
- Markdown форматиране: списъци с тире, **bold** за акценти, линкове като `[чл. 79 ЗЗД](URL)`.
- Запазваме `<followups>q1||q2||q3</followups>` блока в двата режима.
- CTA в анонимния остава ("Регистрирайте се за пълен достъп до DogovaryAI").

### 2.5 UX подобрения на чат балончето

В `DogovAIBubble.tsx`:
- **Suggested starters** (4 чипа над input при празен чат): "Изготви договор за наем", "Какво е неустойка?", "Какви документи трябват за NDA?", "Как се прекратява трудов договор?".
- **Copy** бутон под всеки assistant message.
- **Stop generating** бутон по време на изчакване (`AbortController`).
- **Auto-scroll** при нов token.
- Markdown рендериране през съществуващия `react-markdown` (ако липсва, добавяме).
- Followups като кликаеми бутони (вече има — проверяваме).

### 2.6 Edge functions: deployment

След промените деплойваме `assistant-chat` и `assistant-chat-anon`.

## 3. Какво НЕ правим в тази стъпка

- Не разширяваме индекса с нова съдебна практика (ВКС/ВАС) — това е отделна задача с pipeline за индексация.
- Не добавяме нови AI модели/плащания.
- Не пипаме pricing/quota.

## Файлове за промяна

- `src/components/DogovAIBubble.tsx` — нова визуализация (citations, copy, stop, starters), нов alt/title.
- `src/components/FloatingAssistant.tsx` — лейбъли.
- `src/pages/Account.tsx` — лейбъли.
- `supabase/functions/assistant-chat-anon/index.ts` — RAG groundnig + цитати в response + ново име + режими.
- `supabase/functions/assistant-chat/index.ts` — режими, формализиран `<sources>` блок, ново име.
- (опц.) `package.json` — `react-markdown` ако липсва.

И двете edge функции ще бъдат деплойнати.
