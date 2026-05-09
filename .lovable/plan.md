# Качване и риск-анализ на собствени договори

Регистрираните потребители получават бутон **„Добави договор“** в профила си. Качват свой документ (PDF, DOCX или поставен текст), системата прави AI риск-анализ и договорът остава в библиотеката им — с папки, контрагент, повторен анализ, сваляне и споделяне за подпис.

## Потребителски поток

1. В таб **„Документи“** се появява бутон **„Добави договор“** (+ голяма празна-state карта, ако няма качени).
2. Отваря се диалог с 3 таба: **PDF**, **DOCX**, **Поставен текст**.
3. Потребителят избира папка + (по избор) контрагент + заглавие.
4. След качването → автоматичен AI анализ → редирект към **`/document/:id`** в режим „Риск-анализ“.
5. На страницата:
   - Score 1–10 + цветова значка
   - Класификация (тип договор) + кратко резюме
   - Списък **проблемни клаузи** (цитат + риск + обяснение)
   - **Липсващи стандартни клаузи**
   - **Предложения за корекции** (нов текст за copy)
   - Бутони: *Повторен анализ*, *Свали оригинал*, *Свали риск-доклад (PDF)*, *Сподели за подпис*, *Премести в папка*, *Изтрий*.

## Лимити

- **Free**: 1 безплатен анализ общо (наред с текущите квоти за договори/бланки).
- **Pro**: неограничено.
- При лимит → upsell диалог към съществуващия checkout.

## Технически план

### 1. База данни (миграция)

- Нов enum `'uploaded'` към `document_kind` (или нова стойност в `kind` колоната на `saved_documents`).
- Нова таблица **`uploaded_contracts`**:
  - `id`, `user_id`, `folder_id`, `contact_id`
  - `title`, `source` (`pdf` | `docx` | `paste`), `original_filename`
  - `storage_path` (към bucket `user-contracts`), `mime_type`, `size_bytes`
  - `extracted_text` (text), `text_hash` (за откриване на промени)
  - `created_at`, `updated_at`
  - RLS: `user_id = auth.uid()` за всички операции.
- Нова таблица **`risk_analyses`**:
  - `id`, `uploaded_contract_id` (FK), `user_id`
  - `model` (e.g. `google/gemini-2.5-flash`)
  - `score` (int 1–10), `contract_type`, `summary`
  - `issues` (jsonb: `[{clause, severity, explanation, suggestion}]`)
  - `missing_clauses` (jsonb: `[{name, why}]`)
  - `text_hash` (за да се вижда коя версия е анализирана)
  - `created_at`
  - RLS: same.
- Нов **storage bucket** `user-contracts` (private) + RLS политики: пътищата започват с `auth.uid()/...`.
- Колона `analyses_used` (int, default 0) в `download_quota` за лимит.

### 2. Edge функции

- **`upload-contract`** (POST):
  - Приема `{source, title, folderId?, contactId?, file (base64) | text}`.
  - Качва файла в bucket; за PDF извлича текст (pdf-parse), за DOCX (mammoth), за `paste` директно.
  - Създава запис в `uploaded_contracts`. Връща `{id}`.
- **`analyze-contract`** (POST `{uploadedContractId}`):
  - Проверява квота (free → max 1, ако не е Pro).
  - Чете `extracted_text`, вика **Lovable AI Gateway** (`google/gemini-2.5-flash`) с structured-output схема (score, type, summary, issues[], missing_clauses[]).
  - Записва в `risk_analyses` + увеличава `analyses_used`.
  - Връща пълния анализ.
- **`download-risk-report`** (POST `{analysisId}`): сглобява PDF (`pdf-lib`) с branding на сайта.

### 3. Frontend

- **`Account.tsx` → таб „Документи“**: бутон „Добави договор“ + секция „Качени договори“ (карти със score badge, тип, дата, контрагент).
- **`UploadContractDialog.tsx`** (нов): тaбове PDF/DOCX/Текст, drag&drop, валидация (≤ 10 MB, .pdf/.docx), spinner.
- **`UploadedContractCard.tsx`** (нов): резюме + действия.
- **`RiskAnalysisView.tsx`** (нов): красива страница за визуализация на анализа (gold/navy дизайн, score circle, color-coded severity).
- **Маршрут** `/document/uploaded/:id`: зарежда договор + последен анализ; бутон „Анализирай отново“ (видим само ако `text_hash` се различава или винаги при Pro).
- Навигация от карта в Account → нов маршрут.
- Reuse `ShareForSignDialog` за качените договори (трябва да поддържа `kind = 'uploaded'`).

### 4. Дизайн

- Същата navy + gold естетика, hairline разделители, score badge с gradient (зелено 8–10, жълто 5–7, червено 1–4).
- Празно състояние: илюстрация + текст „Качете първия си договор за безплатен AI риск-анализ“.

## Извън обхвата (за по-късно)

- OCR за сканирани PDF и снимки (JPG/PNG)
- Версии/история на анализи извън `text_hash`
- Авто-генериране на коригиран DOCX с tracked changes

---

След одобрение ще започна с миграцията (за потвърждение от Ваша страна) и след това ще имплементирам edge функциите и UI-а.