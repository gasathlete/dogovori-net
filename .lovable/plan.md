# Защо се разминават

На страницата на шаблона (напр. „Декларация при ПТП за Каско/ГО") имаме **два напълно различни източника** за текста:

1. **Превю в /shablon/…**
   Идва от ръчно поддържания файл `src/data/templateDrafts/deklaratsiya-pri-ptp-za-kasko-go.ts` (пълна, вече написана бланка с `[ПЛЕЙСХОЛДЪРИ]`), плюс описателния „companion" контент от `src/data/templateContent/…` (интро, кога се използва, реквизити, FAQ).

2. **Сваляне след клик „Свали само бланка"**
   Отваря `/wizard/…?blank=1`, което вика edge функцията `supabase/functions/download-blank/index.ts`. Тя **генерира бланката наново с AI** (Lovable AI Gateway, системен промпт в самата функция) и я пакетира в DOCX — напълно игнорира ръчно написания draft.

Затова номерацията на членовете, заглавията и клаузите излизат различни от превюто — всяко сваляне минава през различен AI резултат.

## Какво ще променя

Единствен източник на истината: ако имаме ръчен draft за slug‑а, свалянето да го използва; AI генерирането остава само като fallback за slug‑ове без готова бланка.

### Промени

1. **`supabase/functions/download-blank/index.ts`**
   - Преди да извикам AI Gateway, да проверя дали за `document_name` има готова бланка (по slug).
   - Ако има → парсвам pre-authored текста в същата `BlankPayload` структура (`title`, `preamble`, `clauses[]`, `closing`) и продължавам с текущия `buildDocx(...)` → качване в bucket → signed URL. Кешът в `document_blanks` остава.
   - Ако няма → текущият AI path без промяна.
   - Ръчните драфтове ще ги вкарам като JSON манифест в `supabase/functions/_shared/blank-drafts/` (генериран еднократно от `src/data/templateDrafts/`) — edge функциите нямат достъп до `src/`. Ще добавя малък build‑скрипт `scripts/gen-shared-blank-drafts.ts`, който да го поддържа синхронно.
   - Парсър `parseDraftToBlankPayload(text)`: разцепва по редове, разпознава `Чл. N.` / римски раздели / `(N)` алинеи, за да напълни `clauses[]`; всичко преди първия член → `preamble`; всичко след последния саморъчен подпис маркер → `closing`.

2. **`src/pages/Template.tsx`**
   - Показвам малка секция „Преглед на бланката" с първите ~15 реда от `draftText` (когато има), за да е ясно на потребителя точно какво ще получи. Извън обхвата на основния fix, но добавям, защото сега `draftText` се зарежда, но никъде не се вижда — засилва усещането, че превюто и свалянето са различни неща.

3. **`src/data/templateDrafts/index.ts` + нов `scripts/gen-shared-blank-drafts.ts`**
   - Скриптът чете всички `src/data/templateDrafts/*.ts` и записва `supabase/functions/_shared/blank-drafts.json` ({ slug: text }).
   - Добавям `npm run gen:blank-drafts` (без да го закачам за build — ръчно се пуска при нови драфтове, за да не забавям деплоите).

### Извън обхвата
- Не пипам AI промпта, ratelimit-а, quota-та и storage bucket‑а.
- Не пипам wizard preview (`LiveDraft`) — той е за друг flow (генериране на попълнен документ, не на празна бланка).

## Технически детайли

- Slug резолюция в edge функцията: използвам същия алгоритъм като `src/lib/templateDraftResolver.ts` (точен slug → token overlap). За да не дублирам кода, ще извадя чистата резолюция в `supabase/functions/_shared/draft-resolver.ts` и ще я импортирам и от клиента.
- `parseDraftToBlankPayload` регекси:
  - `^\s*(Чл\.?\s*\d+)\.?\s*` → нов член;
  - `^\s*([IVX]+)\.\s+([А-Я].*)$` → нов раздел (`clauses[].number` + `title`);
  - редове преди първия член/раздел → `preamble`;
  - редове след маркер „Настоящата ... се състави в ... екземпляра" ИЛИ първи празен ред след последен `Чл.` → `closing`.
- Тестове: `supabase/functions/_shared/draft-resolver.test.ts` (има съседни `.test.ts` файлове, значи е конвенция) + бърз unit тест за парсера върху ПТП декларацията.
