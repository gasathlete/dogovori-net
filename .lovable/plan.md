# План: 11 правни и UX подобрения след консултация с адвокат

Една обща фаза, разделена на 5 логически блока. КЕП оставяме като отделна Фаза 2 (research-heavy).

---

## Блок A — Дискретни disclaimers (т. 2, 4, 7, 11)

Общ компонент `LegalDisclaimer` (`variant: subtle | warning | danger`) — малък банер с икона `Info`/`AlertTriangle`, dismissible с `localStorage` ключ.

- **т.2 — Подпис без КЕП**: В `SignatureBlock.tsx` под полето за рисуване → "Дигиталният подпис без КЕП няма доказателствена сила пред съд. За правно обвързване използвайте КЕП (виж секция КЕП)."
- **т.4 — Плащане в брой**: В `Wizard` стъпката за цена/плащане, ако стойността > 10 000 EUR или метод = "брой" → "Плащания над 10 000 лв. в брой между лица са ограничени по ЗОПБ. Препоръчваме банков превод."
- **т.7 — Изтриване на акаунт**: В `Account.tsx` секцията Danger Zone → confirm dialog с пълен списък ("ще бъдат изтрити: договори, бланки, контакти, абонамент, аудит лог, подпис"). Изисква въвеждане на "ИЗТРИЙ" за потвърждение.
- **т.11 — PDF upload**: В `UploadContractDialog` след OCR → "Извлеченият текст от PDF може да съдържа неточности. Прегледайте внимателно преди подпис."

## Блок B — Арбитражна клауза (т. 5)

- Нова data структура `src/data/arbitrationCourts.ts` с топ 5 БГ арбитражни съдилища (БТПП, ВАС при БСК, Арбитражен съд при ПАЕБ и др.) + официална клауза-шаблон + линк.
- В `Wizard` при избор "Арбитраж" вместо обикновен toggle — нов компонент `ArbitrationSelector`:
  - Tooltip/Popover с дефиниция: какво е арбитраж, кога се ползва, разлики със съдебно производство.
  - Dropdown за избор на конкретен арбитражен съд.
  - Auto-fill на специфичната клауза изисквана от съответния съд.
  - Поле "Линк към съда" (попълва се автоматично).
- В системния prompt на `generate-contract` → ако `arbitration: true`, използва точната клауза от избрания съд, а не генерична.

## Блок C — Авто-секция "Контакти т.12" (т. 8)

- В `generate-contract` system prompt: всеки договор задължително завършва с раздел **"XII. КОНТАКТИ ЗА КОРЕСПОНДЕНЦИЯ"** с имена, адрес, имейл, телефон на двете страни.
- В `templateExporter.ts` и `LiveDraft.tsx`: ако AI пропусне раздела (fallback), добавяме го програмно от данните на страните.
- Снаждане в съществуващи договори при regenerate — без миграция на стари.

## Блок D — Live preview бланка (т. 10)

В `LiveDraft.tsx` и `BuildContract.tsx`:

- Текущо при тип "физическо/юридическо" в preview-а пише етикетът.
- Промяна: ако `type='individual'` → показва `ЕГН: __________`; ако `type='legal'` → `ЕИК/Булстат: __________`, `ДДС №: __________`, `МОЛ: __________`.
- Същият подход в `SignatureBlock` за полето "Имена/наименование".

## Блок E — Анонимизация в админ панел (т. 6)

Решение: **само метаданни** (по избор на потребителя).

- **Migration**: нова view `admin_blanks_safe` и `admin_articles_safe` без `submitted_by`/`user_id` raw — заменени с `user_hash` (SHA-256 на user_id + project salt).
- В `AdminBlanksPanel.tsx`, `AdminUserArticlesPanel.tsx`, `AdminPartnersPanel.tsx`:
  - Никога не зареждаме `display_name`, `email`, `signature_name` за модерируеми ресурси.
  - Показваме: тип, сектор, дата, статус, hash идентификатор (за reference при support).
  - При преглед на договор/бланка за одобрение — `blank_payload` се pre-processva от нова edge функция `admin-redact-payload`, която маскира всички имена/ЕГН/ЕИК/имейли с `[ИМЕ-A]`, `[ЕГН-1]`, `[EMAIL-1]` и т.н. (regex + AI втора проверка с `gemini-2.5-flash-lite`).
- Нови общи условия / privacy section: добавяме раздел "Достъп на модератори" в `Privacy.tsx` обясняващ какво виждат админите (= нищо лично).

## Блок F — AI обучителен панел (т. 1, 3, 9)

Нова страница в админ: `/admin/ai-training` с 3 sub-таба.

### F.1 System Prompts мениджмънт
- Нова таблица `ai_prompts`: `id, function_name, version, content, is_active, created_by, created_at, notes`.
- За всяка AI edge функция (`generate-contract`, `analyze-contract`, `assistant-chat`, `apply-corrections`, `build-custom-contract`, `correct-uploaded`, `ocr-contract`, `admin-generate-article`) — извличаме текущия hardcoded prompt в БД като v1.
- Функциите четат активна версия от `ai_prompts` (с in-memory cache 5 мин).
- UI: списък функции → preview текущ prompt → редактор (Monaco/textarea с syntax hint) → "Запази нова версия" + "Активирай". История на версии с rollback.

### F.2 Few-shot примери и правила
- Нова таблица `ai_training_examples`: `id, function_name, category (sector/contract_type), input_context, expected_output, weight, active`.
- Нова таблица `ai_rules`: `id, function_name, rule_text, severity (must/should), active`.
- При AI извикване — top-K релевантни примери (по category match) се добавят към prompt-а; всички активни rules също.

### F.3 Динамични уточняващи въпроси (т. 3)
- Нова таблица `contract_question_bank`: `id, sector_id, contract_type, trigger_conditions (jsonb), question_text, field_type, importance`.
- В Wizard преди генериране → нова edge функция `suggest-followup-questions` (Lovable AI) преглежда контекста и избира 2-5 най-важни въпроса от банката + може да добави AI-генерирани ad-hoc.
- В админ панела CRUD за въпросите.

### F.4 Отложено действие (т. 9)
- Добавяме секция в банката с правила за "deferred effect" договори (предварителни, обещание за продажба, условни сделки).
- При генериране AI получава rule: "Ако казусът включва бъдещо/условно действие, добави клаузи за: срокове на действие, прекратително условие, гаранции при неизпълнение в периода до влизане в сила, последици от отказ."

---

## Технически детайли

### Нови файлове
```text
Frontend:
- src/components/LegalDisclaimer.tsx
- src/components/wizard/ArbitrationSelector.tsx
- src/data/arbitrationCourts.ts
- src/pages/admin/AITraining.tsx          (3 sub-tab компонента)
- src/components/admin/PromptEditor.tsx
- src/components/admin/TrainingExamples.tsx
- src/components/admin/QuestionBank.tsx
- src/lib/anonymize.ts                    (regex маскиране helper)

Edge functions:
- admin-redact-payload          (PII масировка преди показване в админ)
- suggest-followup-questions    (Lovable AI избор от банката)
- ai-prompt-loader              (shared util, не функция: чете активни prompts)

Migrations:
- ai_prompts, ai_training_examples, ai_rules, contract_question_bank tables (всички staff-only RLS)
- admin_blanks_safe, admin_articles_safe views
```

### Едитвани файлове
```text
- src/components/wizard/SignatureBlock.tsx     (disclaimer т.2)
- src/pages/Wizard.tsx                          (disclaimer т.4, ArbitrationSelector)
- src/pages/Account.tsx                         (delete confirm т.7)
- src/components/UploadContractDialog.tsx       (PDF disclaimer т.11)
- src/components/wizard/LiveDraft.tsx           (ЕГН/ЕИК динамично т.10)
- src/pages/BuildContract.tsx                   (ЕГН/ЕИК динамично т.10)
- src/components/AdminBlanksPanel.tsx           (анонимизация т.6)
- src/components/AdminUserArticlesPanel.tsx     (анонимизация т.6)
- src/pages/legal/Privacy.tsx                   (раздел за достъп на модератори)
- supabase/functions/generate-contract/index.ts (Контакти т.12, arbitration, prompt loader, few-shot, rules)
- supabase/functions/analyze-contract/index.ts  (prompt loader)
- supabase/functions/assistant-chat/index.ts    (prompt loader)
- supabase/functions/apply-corrections/index.ts (prompt loader)
- supabase/functions/build-custom-contract/index.ts (prompt loader, динамични въпроси)
- src/pages/Admin.tsx                           (link към /admin/ai-training)
```

### Сигурност
- Всички нови таблици: RLS service_role ALL + `is_staff(auth.uid())` SELECT/INSERT/UPDATE.
- `admin-redact-payload` верифицира `is_staff()` преди да върне маскирани данни.
- Hash на user_id: `encode(digest(user_id::text || '<salt>', 'sha256'), 'hex')` — salt от secret `ADMIN_ANON_SALT` (нов).

### Фаза 2 (отделно): КЕП интеграция
- Research БГ доставчици (B-Trust, Evrotrust, InfoNotary) — REST APIs, цени, sandbox достъп.
- Връщам в чата с opciite + примерна архитектура; чакам твоя избор преди да градя.

---

## Очаквани въпроси
- **Изтриване на стари hardcoded prompts**: запазваме като v1 в `ai_prompts`, никога не правим breaking change.
- **Performance на динамични въпроси**: добавя 1 AI извикване (~500ms) — кешираме по hash(sector+contract_type+answers).
- **Анонимизация на стари записи**: само напред — старите `submitted_by` остават в БД, но UI ги скрива.