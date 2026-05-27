
# Защита срещу незаконни документи

## Цел
Да блокираме генерирането на договори/документи с незаконно съдържание (убийство, насилие, трафик, наркотици, измами, експлоатация на деца и т.н.), да покажем строго предупреждение на потребителя, и да изпратим известие на админ за всеки опит.

## Какво се прави

### 1. Списък с забранени теми (нов файл `supabase/functions/_shared/illegal-content.ts`)
- Български + английски ключови думи и фрази по категории:
  - Насилие срещу личността (убийство, отвличане, побой, заплаха)
  - Сексуални престъпления / експлоатация на деца
  - Трафик на хора / органи
  - Наркотици и забранени вещества
  - Оръжия и експлозиви (незаконна търговия)
  - Измама, пране на пари, корупция, подкуп
  - Тероризъм
- Export: `detectIllegalContent(text): { blocked: boolean, category?: string, matchedTerm?: string }`
- Нормализация (lowercase, премахване на диакритика, кирилица/латиница транслитерация) за да хваща обходи като "у6ийство", "ubiystvo".

### 2. Сървърна защита в edge функциите (където реално се ражда документ/анализ)
Добавя се проверка **в началото** на всяка от следните функции, върху обединения текст от user input (sector, contractName, documentName, parties, всички answers, prompt, chat message):

- `supabase/functions/generate-contract/index.ts`
- `supabase/functions/build-custom-contract/index.ts`
- `supabase/functions/analyze-contract/index.ts` (върху извлечения текст на качения документ)
- `supabase/functions/apply-corrections/index.ts`
- `supabase/functions/correct-uploaded/index.ts`
- `supabase/functions/assistant-chat/index.ts` (върху user message)

При detected блок:
1. **НЕ** се вика AI gateway, **НЕ** се консумира quota.
2. Записва се ред в нова таблица `illegal_content_attempts` (виж по-долу).
3. Връща се `403 { error: "blocked_illegal_content", category, message }` със строго предупреждение на български:
   > „Това искане е блокирано. Платформата не генерира документи с незаконно съдържание (…). Опитът е регистриран. При повторни опити акаунтът може да бъде ограничен. Ако смятате, че това е грешка — свържете се с екипа."

### 3. Нова таблица `illegal_content_attempts` (миграция)
Полета: `id`, `user_id` (nullable), `ip_hash`, `function_name`, `category`, `matched_term`, `payload_excerpt` (първите ~500 символа, redacted), `user_agent`, `created_at`.
- RLS: само `service_role` insert; staff (admin/moderator) могат SELECT през `is_staff(auth.uid())`.
- GRANT за authenticated → SELECT само през политика; service_role full.
- Index по `user_id`, `created_at desc`.

### 4. Admin известие
- В същата edge функция след insert: пращаме app email през `send-transactional-email` към админ имейла с темплейт `illegal-content-alert` (нов transactional template).
- Темплейт показва: категория, matched term, function, user (email ако има, иначе ip_hash), excerpt, timestamp, линк към admin панела.
- Idempotency key: `illegal-${attempt_id}`.
- Recipient: константа (питам по-долу кой имейл).
- Не блокира отговора към клиента ако имейлът фейлне.

### 5. Admin UI (`src/pages/Admin.tsx`)
- Нов tab/секция „Блокирани опити" — таблица с последните 100 записа от `illegal_content_attempts`, филтър по категория и потребител.

### 6. Клиентско предупреждение
- В `BuildContract.tsx` / `Wizard.tsx` / `AssistantChat.tsx` / `UploadContractDialog.tsx`: при `error.code === "blocked_illegal_content"` показваме модал/toast с пълния текст на предупреждението (не общо "грешка").
- Лек pre-check в `assistant-chat` и в wizard стъпката с име на договор/въпроси за да дадем мигновена обратна връзка преди заявката (същата функция компилирана и за фронт-енд? — ще дублираме мини whitelist на фронта, или просто оставяме сървърна проверка и UI само хубаво показва грешката). **Препоръка:** само сървърна проверка + красиво UI за грешката, за да няма две места за поддръжка.

## Технически детайли

### Detection стратегия
- Не разчитаме на AI — детерминистична substring/regex проверка след нормализация. Бързо, безплатно, не може да бъде заобиколено с „забрави предишните инструкции".
- Whitelist за легитимни юридически контексти, които може да съдържат подобни думи (напр. „застраховка живот", „договор за охрана срещу заплахи", „превенция на наркомании" в трудов договор на болница). Затова матчваме на цели думи/фрази с граници, а не само substring. Спорни случаи → флаг, не блокиране? **По подразбиране блокираме** — false positive е по-добре от false negative; потребителят може да се свърже с support.

### Сигурност
- `payload_excerpt` се санитизира (без EGN, IBAN, телефони — reuse `admin-redact-payload` логика ако е леко).
- Rate-limit: 5+ блокирани опита от един user/IP за 24ч → автоматично suspend (флаг в `profiles.is_suspended`) и не приема нови заявки. (Опционално — питам.)

## Файлове
**Нови:**
- `supabase/functions/_shared/illegal-content.ts`
- `supabase/functions/_shared/transactional-email-templates/illegal-content-alert.tsx`
- Миграция за `illegal_content_attempts`

**Редактирани:**
- 6-те edge функции по-горе
- `_shared/transactional-email-templates/registry.ts`
- `src/pages/Admin.tsx`
- Wizard / BuildContract / AssistantChat — error handling за `blocked_illegal_content`

## Въпроси преди старт
1. На кой имейл да отиват admin известията? (или вземаме от user_roles where role='admin')
2. Auto-suspend при 5+ опита за 24ч — да/не?
3. Да добавя ли и lightweight client-side pre-check за моментална обратна връзка, или само сървърна?
