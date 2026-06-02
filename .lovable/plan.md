
## 1. Какво се точкува = 1 операция

| Действие | Операция |
|---|---|
| Генериране и сваляне на договор (PDF/DOCX) | **1** (`contract`) |
| Сваляне на бланка | **1** (`template`), **безплатно** ако в същата сесия вече е таксуван `contract`/`template` за същия документ |
| Качване на документ за интелигентен анализ | **1** (`analysis`) |
| Партида автоматични корекции след анализ/създаване | **1** (`analysis`) |
| Следваща партида остатъчни корекции | **1** (`analysis`) |
| Преглед на живо, Wizard стъпки, чат, повторно сваляне на запазен документ, двуезична колона | **0** |

Hint под брояча в Dashboard tile:
> „Документ · Бланка · Качване на документ за Анализ – автоматични корекции = 1 операция“

## 2. Промени в бекенда

### 2a. Гратис при вече платен в същата сесия
- Нова таблица `quota_session_charges(user_id, session_id uuid, doc_key text, kind text, created_at)` с UNIQUE `(user_id, session_id, doc_key)` и RLS (`auth.uid()=user_id`) + GRANTs.
- Нова RPC `consume_quota_session(_kind, _doc_key, _session_id)`:
  - Ако вече има запис за `(uid, session_id, doc_key)` → връща `{ok:true, charged:false, is_pro:…}`.
  - Иначе извиква текущата логика на `consume_quota(_kind)`. При `ok:true` вписва ред в таблицата.
- `download-document`, `download-blank`, `analyze-contract` приемат `session_id` + `doc_key` от клиента и викат новата RPC.

### 2b. Батч-таксуване на корекции
- Нова таблица `corrections_batch_charges(user_id, session_id uuid, batch_id uuid, created_at)` с UNIQUE `(user_id, session_id, batch_id)`.
- Нова RPC `consume_corrections_batch(_session_id, _batch_id)`: ако партидата вече е таксувана — връща `{ok:true, charged:false}`; иначе `consume_quota('analysis')` и записва партидата.
- `apply-corrections/index.ts` приема `session_id` + `batch_id` и вика тази RPC веднъж за цялата партида.

### 2c. Документация на точкуването
Миграция със `COMMENT ON FUNCTION public.consume_quota` и `COMMENT ON COLUMN download_quota.*` на български.

## 3. Промени във фронтенда

- `src/lib/opSession.ts` (нов) — генерира/чете `op_session_id` (UUID) от `sessionStorage`, плюс хелпер `getOpDocKey(slug)`.
- `Wizard.tsx`, `BuildContract.tsx`, `Document.tsx` — подават `session_id` + `doc_key` при download/analyze.
- `CorrectionsPanel.tsx` — генерира нов `batch_id` (UUID) на отваряне на пакет корекции; нов UUID за всяка следваща партида.

### 3a. Единична цена като bullet в плановете (Account.tsx → SubscriptionTab)

Цени (от кода, EUR, ДДС вкл.):

| План | Цена | Включени операции | **Цена/операция** |
|---|---|---|---|
| Предприемач — месечен | 9.90 €/мес | 100/мес | **0.099 €** |
| Предприемач — годишен | 99 €/год | 1 200/год | **0.0825 €** |
| Екип — месечен | 7.90 €/място/мес | 100/място/мес | **0.079 €** |
| Екип — годишен | 79 €/място/год | 1 200/място/год | **0.066 €** |
| Пакет 5 операции | 1.90 € | 5 | **0.38 €** |

Имплементация: във всяка карта добавям **първи** bullet локално в JSX (не в споделените `proFeatures`/`teamFeatures` масиви, за да са числата точни и за месечен, и за годишен):
> „**0.099 € на операция** · 9.90 € ÷ 100 оп./мес“

С `Coins` икона от lucide-react (gold tone).

### 3b. Малки UI поправки
- Текст за безплатния план: „2 операции на всеки 30 дни“ вместо „на месец“ (отразява rolling reset).
- Tooltip „Какво е операция?“ до брояча в Dashboard — отваря popover с правилата от таблицата в т.1.
- Hint текст под Dashboard tile (т.1).

## 4. Memory обновяване (след одобрение)

Текущата memory казва Pro 19 €/мес и one-off ~6 €. Реалните цени в кода: Pro 9.90 €/мес, Pro годишен 99 €, Team 7.90 €/място, пакет 5 операции 1.90 €. Ще обновя `mem://index.md` Core с верните стойности.

## 5. Файлове, които ще пипна

**Миграции (2):**
- `comment_consume_quota.sql` — само `COMMENT ON`.
- `quota_session_batching.sql` — двете нови таблици + 2 нови RPC + RLS + GRANTs.

**Едж функции (4):**
- `supabase/functions/download-document/index.ts`
- `supabase/functions/download-blank/index.ts`
- `supabase/functions/analyze-contract/index.ts`
- `supabase/functions/apply-corrections/index.ts`

**Фронтенд:**
- `src/lib/opSession.ts` (нов)
- `src/pages/Wizard.tsx`, `src/pages/BuildContract.tsx`, `src/pages/Document.tsx`
- `src/components/wizard/CorrectionsPanel.tsx`
- `src/pages/Account.tsx` — bullets с цена/операция, hint, tooltip, „на всеки 30 дни“

**Тестове:**
- `src/test/quota.test.ts` — нов кейс: blank-after-contract = free; 2 партиди корекции = 2 операции; повторен apply на същата партида = 0.

## 6. Поведенчески промени за потребителя
- Сваляне на бланка след вече платен договор в същата browser таб = безплатно.
- Корекции от един анализ, дори да са приложени многократно (до изпращане), се таксуват като **1 анализ-операция**; всяка нова „вълна“ корекции = още 1.
- Никакви промени за вече запазени документи (повторно сваляне остава безплатно).
