# План: GDPR/AI Act съответствие за Dogovori.net

Този план приема адвокатския одит и го превежда в конкретни кодови промени, политики и операционни процеси. Изпълняваме на 3 вълни (P0 → P1 → P2). За всяка вълна посочвам кои файлове да създадем/променим, какво ще съдържат и кой риск адресират.

## Текущо състояние (от ревюто на кода)

Налично:
- `src/lib/anonymize.ts` — има regex редактиране за EGN/EIK/IBAN/email/телефон/имена (само за админ преглед, **не се ползва преди AI повиквания**).
- `supabase/functions/_shared/illegal-content.ts` — блокировка на незаконно съдържание.
- Edge функции `analyze-contract`, `correct-uploaded`, `apply-corrections`, `ocr-contract`, `generate-contract`, `build-custom-contract` — викат Lovable AI Gateway, **без класификация или redaction слой**.
- Логват сурови частични отговори в `console.log`/`console.error` (видими в edge logs).
- `analyze-contract` има автоматичен fallback flash-lite → flash → pro **без policy проверка**.
- Правни страници: `Privacy.tsx`, `Terms.tsx`, `DPA.tsx`, `Cookies.tsx`, `ProviderInfo.tsx`, `Refund.tsx`, `WithdrawalForm.tsx`.
- В `src/pages/Account.tsx` има `Delete account` функционалност (edge function `delete-account`).

Липсва: класификация преди AI, automatic redaction в продукцията, model routing policy, retention job, audit log без съдържание, export/erase на ниво документ, DPIA, политики (AI Processing, Retention, Subprocessor Register), security headers.

---

## ВЪЛНА P0 — Технически "stop the bleeding" (1 итерация)

Цел: спираме изтичането на лични данни към AI и в логовете, без да чупим съществуващата UX.

### 1. Shared PII/класификация слой за edge functions

Нови файлове:
- `supabase/functions/_shared/classify.ts`
  - `classifyDocumentBeforeAI(text): { risk_level, contains_personal_data, contains_special_category_data, redaction_required, user_confirmation_required, allowed_models[], reasons[] }`
  - Открива: EGN/ЛНЧ (10 цифри с checksum), номер лична карта, IBAN, телефон, email, имена (българска и латиница heuristic), адреси (улица/гр./бул.), подпис ("/п/", "(подпис)").
  - Special category keywords (BG/EN): "ТЕЛК", "НЕЛК", "болничен лист", "диагноза", "ХИВ", "инвалидност", "синдикат", "вероизповедание", "етнос", "сексуална ориентация", "биометрични", "ДНК", имена на деца под 18.
  - Връща `allowed_models` според риска: low → all, medium → flash-lite/flash, high → flash-lite only (след redaction), blocked → [].
- `supabase/functions/_shared/redact.ts`
  - `redactForAI(text): { redacted, mapping, stats }` — портира `src/lib/anonymize.ts` в Deno, плюс placeholders `<NAME_1>`, `<EGN_1>`, `<EMAIL_1>`, `<IBAN_1>`, `<PHONE_1>`, `<ADDRESS_1>`, `<ID_CARD_1>`.
  - Mapping се връща САМО на caller (in-memory) — не се пише никъде.
  - `unredact(text, mapping)` — за връщане на финалния документ към потребителя.
- `supabase/functions/_shared/model-router.ts`
  - `routeModel(operation, classification, opts): { model, allowFallback, fallbackChain[], requireConfirmation }`
  - Имплементира таблицата от ревюто (analyze → flash-lite след redaction; correct-uploaded/pro → blocked при special category; и т.н.).
- `supabase/functions/_shared/ai-call.ts`
  - Единна обвивка около fetch към `ai.gateway.lovable.dev`. Записва audit log БЕЗ съдържание.
  - Преди request: ако `redaction_required` и payload не е redacted → throw.
  - Fallback: винаги използва същия redacted payload; не извиква друг модел без `allowFallback`.

### 2. Audit log без съдържание

Нова миграция: таблица `public.ai_audit_log` с колони:
`id, user_id, team_id, operation_id, operation, model, fallback_used, fallback_model, risk_level, redaction_applied, contains_personal_data, contains_special_category_data, tokens_in, tokens_out, status, error_code, created_at`.

RLS: потребителят чете само своите записи; service_role пълен достъп.

GRANTs за `authenticated` (SELECT собствените) и `service_role` (ALL).

### 3. Интеграция в съществуващите edge functions

Промени в:
- `supabase/functions/analyze-contract/index.ts`
- `supabase/functions/correct-uploaded/index.ts`
- `supabase/functions/apply-corrections/index.ts`
- `supabase/functions/ocr-contract/index.ts`
- `supabase/functions/build-custom-contract/index.ts`
- `supabase/functions/generate-contract/index.ts`

Във всяка:
1. Преди AI call: `const cls = classifyDocumentBeforeAI(text)`.
2. Ако `cls.risk_level === "blocked"` → 422 с код `blocked_special_category`, текст за потребителя.
3. Ако `cls.redaction_required` → `const { redacted, mapping } = redactForAI(text)`, изпращаме `redacted` към AI.
4. `routeModel(operation, cls)` определя модел и fallback правилата.
5. Викаме AI през `ai-call.ts` обвивката.
6. След отговор: `unredact(aiOutput, mapping)` ако е нужно за крайния продукт.
7. Записваме `ai_audit_log` ред (без съдържание).
8. Премахваме всички `console.log` с части от prompts/documents — оставяме само status/error code.

### 4. Frontend confirmation modal

Нов компонент: `src/components/ai/SensitiveDataWarning.tsx` — диалог преди upload/OCR/pro действие:
- Списък забранени документи (лични карти, медицински, документи за деца, биометрика и т.н.).
- Checkbox "Декларирам, че имам основание".
- Запис в `user_consents` (вече съществуващ таблица).

Интеграция в:
- `src/components/UploadContract.tsx` (или където е upload UI).
- `src/pages/BuildContract.tsx` преди pro операции.

### 5. Retention job

Нова edge функция `supabase/functions/retention-sweeper/index.ts` + cron (pg_cron) на всеки час:
- Изтрива `uploaded_contracts` където `created_at < now() - 24h` И няма свързан `saved_documents`/`risk_analyses` И няма `folder_id`.
- Trim-ва `extracted_text` от `uploaded_contracts` след 24h ако не са запазени.
- Изтрива `ai_audit_log` записи > 12 месеца.
- Изтрива storage обекти от bucket-а за upload, не свързани с активен ред.

### 6. Премахване на raw логване

- Глобално търсене и премахване на `console.log(...prompt...)`, `console.log(...output...)`, `console.error(text)` в edge functions. Запазваме само статус код и съкратен error message.

---

## ВЪЛНА P1 — Политики, прозрачност и потребителски права

### 7. User self-service

Нова страница `src/pages/account/Privacy.tsx` (таб в `Account.tsx`):
- "Изтегли моите данни" → нова edge function `export-user-data` връща ZIP/JSON с: профил, saved_documents, uploaded_contracts (текст), risk_analyses, ai_audit_log (без съдържание).
- "Изтрий качен документ" / "Изтрий запазен документ" с потвърждение.
- "История на AI операции" — таблица от `ai_audit_log`.
- "Оттегли съгласие" (linked към `user_consents`).

### 8. Обновени правни документи

Промени в съществуващите MDX/TSX страници:
- `src/pages/Privacy.tsx` — детайлно описание на:
  - категории AI операции;
  - Lovable AI Gateway като processor;
  - fallback модели;
  - regions (EU/global);
  - retention срокове;
  - права на субекта;
  - забранени категории документи.
- `src/pages/Terms.tsx` — добавя раздел "Забранено съдържание" + AI Act ограничения (no automated hiring/credit decisions).
- `src/pages/DPA.tsx` — обновяваме с минималните клаузи (subject, duration, types, instructions, confidentiality, no training, no human review, zero retention, subprocessors, SCCs, deletion).

Нови страници:
- `src/pages/legal/AIProcessingPolicy.tsx`
- `src/pages/legal/RetentionPolicy.tsx`
- `src/pages/legal/SubprocessorRegister.tsx` (списък: Lovable AI Gateway, Google Gemini, Supabase, Stripe, Resend; страна/регион; категории данни).
- `src/pages/legal/ModelRoutingPolicy.tsx` (публикуване на таблицата operation×model).
- `src/pages/legal/IncidentResponse.tsx` (контакти, SLA за уведомяване).

Добавяме routes в `src/App.tsx`.

### 9. Security headers и web hardening

- `index.html` / Vite preview headers + продакшън през Cloudflare/host:
  - CSP (script-src self + Lovable домейни + Stripe);
  - X-Frame-Options: DENY;
  - X-Content-Type-Options: nosniff;
  - Referrer-Policy: strict-origin-when-cross-origin;
  - Permissions-Policy.
- Cookies: проверка че `supabase.auth` използва secure/SameSite (вече по default, но документираме).
- Rate limiting на edge functions: shared `_shared/rate-limit.ts` базиран на user_id + IP, пер endpoint (login, upload, analyze).

### 10. Upload pipeline hardening

Промяна в upload edge endpoint (или client `UploadContract.tsx`):
- MIME проверка whitelist: pdf/docx/odt/txt.
- File size cap (вече има, потвърждаваме 10MB).
- Magic-bytes check (не само extension).
- PDF sanitization step (вика `pdf-lib` flatten преди OCR).
- Hook за външен AV scan (готов interface, дори без активиран доставчик).
- След upload: `classifyDocumentBeforeAI(extracted_text)` → ако high/blocked → показваме warning + изискваме потвърждение.

### 11. DPIA документ

`/mnt/documents/dpia_dogovori_net.docx` (генерира се със `docx` skill) — пълно ОВЗД покритие за: AI анализ, OCR, upload, pro операции, fallback, prompt logging, document storage, special category handling, third-party processors. Включва risk matrix и митигации.

---

## ВЪЛНА P2 — Зрялост и enterprise

### 12. Advanced

- DLP engine: тестова матрица + auto-fail тестове, че logs не съдържат EGN/email/IBAN.
- Admin dashboard за privacy/security метрики (`/admin/privacy`): брой blocked операции, % с redaction, retention статистика.
- Configurable per-team retention (Team plan).
- EU-only AI region pinning (когато Lovable Gateway го позволи).
- SOC2/ISO 27001 readiness checklist (markdown в `docs/`).
- Periodic pen-test plan (документ, не код).
- Red-team prompt injection тест suite (`tests/security/prompt-injection.test.ts`).

### 13. Тестове (Deno + vitest)

- `supabase/functions/_shared/classify.test.ts` — unit за класификация (EGN, IBAN, medical, names).
- `supabase/functions/_shared/redact.test.ts` — round-trip redact/unredact.
- `supabase/functions/_shared/model-router.test.ts` — pro не се връща при special category.
- `tests/security/no-pii-in-logs.test.ts` — фейлва при намерен EGN/IBAN pattern в edge logs sample.
- Integration: analyze-contract с medical text → blocked отговор.

---

## Технически детайли

### Точки на интеграция

```text
Edge function (analyze/correct/apply/ocr/build/generate)
  ↓
classifyDocumentBeforeAI(text)
  ↓                    ↓ blocked
redactForAI(text) → 422 user-facing
  ↓
routeModel(op, cls)
  ↓
aiCall(redacted, model, allowFallback)
  ↓
unredact(output, mapping) → user
  ↓
ai_audit_log.insert({...metadata only...})
```

### Файлове, които ще се добавят (P0)
- `supabase/functions/_shared/classify.ts`
- `supabase/functions/_shared/redact.ts`
- `supabase/functions/_shared/model-router.ts`
- `supabase/functions/_shared/ai-call.ts`
- `supabase/functions/retention-sweeper/index.ts`
- `src/components/ai/SensitiveDataWarning.tsx`
- Миграция за `ai_audit_log` + pg_cron за retention sweeper.

### Файлове, които ще се променят (P0)
- Всички 6 AI edge functions (analyze/correct/apply/ocr/build/generate).
- `src/components/UploadContract.tsx` (или съответния upload компонент).
- `src/pages/BuildContract.tsx` (confirmation gate за pro).

### Граници (какво НЕ правим в този план)
- Не сменяме pricing/billing логиката.
- Не сменяме AI доставчика (оставаме на Lovable Gateway).
- Не пишем нови adversarial prompt injection защити в самия модел (оставяме за P2).
- Не добавяме външен AV (само hook).

---

## Препоръчителен ред на изпълнение

1. **Стъпка 1 (P0 ядро):** classify + redact + model-router + ai-call helpers + ai_audit_log таблица. Само shared слой, без интеграция още.
2. **Стъпка 2 (P0 интеграция):** вкарваме слоя в analyze-contract първо (най-голям риск), тестваме, после в останалите 5 функции.
3. **Стъпка 3 (P0 UX):** sensitive data warning + премахване на raw logs + retention sweeper.
4. **Стъпка 4 (P1):** правни страници + user self-service + security headers.
5. **Стъпка 5 (P2):** DPIA + тестове + admin metrics.

Готов съм да започна със Стъпка 1, ако одобрите плана. Ако предпочитате друг ред (напр. първо политиките/правните страници), кажете.
