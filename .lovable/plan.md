
# Custom Contract Builder ("Изготви договор")

Нова функционалност за свободно изготвяне на договор без предварителен шаблон — потребителят описва каквото иска, AI попълва празните полета и изгражда пълен договор с правен анализ.

## 1. Hero (начална страница)

- Нов CTA бутон **„Изготви договор"** до съществуващия „Намери договор" (`src/components/Hero.tsx`).
- „Как работи процесът" остава, премества се под двата CTA бутона (вече е там като линк).
- „Изготви договор" → `/build` (нова страница).

## 2. Нова страница `/build` — BuildContract

Маршрут добавен в `src/App.tsx`. Страница с **двуколонен layout** като Wizard:
- **Ляво:** компактна форма с полета:
  - **Име на договора** (text, required)
  - **Категория** — Select от съществуващите сектори от `src/data/sectors.ts` + опция „Друго" (free text)
  - **Възложител/и** (textarea, по 1 на ред — име, тип ЮЛ/ФЛ/ЕТ)
  - **Изпълнител/и** (textarea, по 1 на ред)
  - **Предмет** (textarea) — *празно → AI предлага*
  - **Срок** (text) — *празно → AI предлага*
  - **Цени и плащане** (textarea) — *празно → AI предлага*
  - **Задължения** (textarea) — *празно → AI предлага*
  - **Други клаузи / специфики** (textarea) — *празно → AI предлага стандартни*
- Бутон **„Изгради договор (≤ 2 мин.)"**.
- **Дясно:** `LiveDraft` — същия компонент като в Wizard, показва документа в реално време след генерация.

## 3. AI поток

Нова Edge Function `supabase/functions/build-custom-contract/index.ts`:
- Приема: `{ name, category, partiesA[], partiesB[], subject?, term?, prices?, obligations?, other? }`.
- System prompt: професионален български правен архитект (същия стил като `generate-contract`), задача — попълни липсващите секции с пазарно-стандартни формулировки за избраната категория, върни СТРОГО JSON `{ risk, contract }` (същата схема като `generate-contract`).
- Същите rate-limits (5/24h за free, login required), кеширане, и AI gateway модел (`google/gemini-2.5-flash-lite`).
- Връща същия формат → reuse-ва `LiveDraft`, `RiskMeter`, `RiskReport`, `SignatureBlock`, `CorrectionsPanel`.

## 4. Същите функционалности като Wizard

В резултатния изглед на `/build`:
- PDF/DOCX експорт (reuse `downloadDocument`).
- Подпис (reuse `SignatureBlock`).
- Запис в профила (reuse `saved_documents` с `kind = 'custom'` или 'contract', `source_id = null`).
- Споделяне за подпис (reuse `ShareForSignDialog`).
- Корекции (reuse `CorrectionsPanel` + `apply-corrections`).

## 5. Извличане на бланка → admin кеш

След успешна генерация:
- Edge Function извлича автоматично „бланка" — replace-ва конкретните данни (имена на страни, суми, дати, специфики) с плейсхолдъри `[…]`.
- Записва в нова таблица `custom_contract_blanks`:
  - `id`, `created_at`, `category` (sector_id или free text), `name` (име на договора), `text_hash` (за dedupe), `blank_payload` (JSONB с GeneratedContract без данни), `source_user_id`, `published` (boolean default false), `published_sector_id`, `published_document_name`.
- RLS: само service_role insert/select; staff може select/update.
- Dedupe по `text_hash` — ако вече съществува идентична бланка, само increment counter.

## 6. Admin панел

В `src/pages/Admin.tsx` нов tab **„Бланки от потребители"**:
- Списък на чакащи бланки (sortable по дата, категория, брой повторения).
- Preview на бланката (използва `LiveDraft` read-only).
- Действия: **Публикувай в каталога** (попълва `published_sector_id` + `published_document_name`, копира в `document_blanks` storage), **Отхвърли** (delete), **Редактирай име/категория**.

## 7. Технически детайли

- Reuse 100% от съществуващите wizard компоненти — без дублиране.
- Анонимизацията на бланката — отделна AI заявка с малък prompt: „Замени конкретни данни с плейсхолдъри". Изпълнява се асинхронно след основната генерация (background, не блокира UX).
- Quota: всеки build брои като 1 contract download (consume_quota('contract')).
- Аналитика: `trackEvent('build_contract_started')`, `build_contract_generated`, `build_contract_saved`.

## Files

**New:**
- `src/pages/BuildContract.tsx`
- `src/components/build/CustomContractForm.tsx`
- `supabase/functions/build-custom-contract/index.ts`
- `supabase/functions/extract-blank/index.ts` (background анонимизация)
- DB migration: `custom_contract_blanks` таблица + RLS

**Modified:**
- `src/components/Hero.tsx` — добавя „Изготви договор" CTA
- `src/App.tsx` — нов маршрут `/build`
- `src/components/Header.tsx` — добавя линк към „Изготви договор"
- `src/pages/Admin.tsx` — нов tab „Бланки от потребители"
