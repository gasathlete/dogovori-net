# Стъпка 3 — Следваща вълна преди официалното пускане

Приоритет 1 (Stripe customer, watermark, rate-limit, audit_log, CORS allowlist) и фиксът за изчезващ договор след плащане вече са в продукция. Следващата вълна добавя реална стойност за платените потребители и подготвя сайта за мащаб.

## Какво ще направим

### 1. DOCX експорт (Pro feature)
Сега имаме само PDF. Юристи и счетоводители искат редактируем `.docx`, за да го финализират в Word.
- Нова библиотека `docx` (npm) на клиента — генерира `.docx` от същия `ContractPayload`, който храни PDF-а.
- Бутон „Изтегли DOCX" в `Account → Договори` и в края на wizard-а — само за Pro / при наличен `bonus_contracts`.
- Watermark логиката от PDF се пренася и тук (footer „ПРЕГЛЕД – не за подпис" за free).
- Edge функция `download-document` връща нов flag `format: 'pdf' | 'docx'` и брои и двата формата в quota-та.

### 2. „Сподели за подпис" — публичен линк с изтичане
Контрагентът не трябва да създава акаунт, за да види договора.
- Нова таблица `shared_links(id, document_id, owner_id, token, expires_at, viewed_at, signed_at)`.
- Edge функция `create-share-link` (Pro only) — генерира 32-байтов token, default 7 дни валидност.
- Публичен route `/share/:token` — показва договора само за четене + бутон „Подпиши електронно" (рисуване на подпис в canvas, запазва се като base64 в `shared_links.signed_signature`).
- Email към собственика при отваряне и при подпис (използваме Resend през edge).
- Audit log запис при всяко отваряне и подпис.

### 3. Sentry за грешки + базов GA4
- Sentry SDK на frontend (`@sentry/react`) и в edge функциите (`@sentry/deno`).
- DSN се пази като secret `SENTRY_DSN`; ще го поискаме от потребителя.
- GA4 measurement ID също като secret — лек wrapper в `src/lib/analytics.ts` с `trackEvent('contract_generated', …)`, `'checkout_started'`, `'pro_subscribed'`.
- Cookie banner вече има секция „Аналитични" → респектираме съгласието.

### 4. Resend за транзакционни емейли
- Welcome email след регистрация.
- Email при успешно плащане (с фактура от Stripe като линк).
- Email при изтичане на Pro (7 дни преди и в деня на изтичане) — cron edge функция.
- Изисква `RESEND_API_KEY` (ще го поискаме) + верифициран домейн `dogovori.net`.

### 5. Минимален smoke-test пакет
- Vitest + React Testing Library: 5 критични теста (auth flow, wizard happy path, free→Pro upgrade, download quota, share link).
- Playwright (опционално в CI): един end-to-end сценарий „регистрация → договор → плащане (test mode) → изтегляне".

## Технически детайли

```text
Файлове:
  + src/lib/docxExporter.ts              (генератор)
  + src/components/ShareForSignDialog.tsx
  + src/pages/SharedDocument.tsx         (route /share/:token)
  + src/lib/analytics.ts
  + src/lib/sentry.ts
  + supabase/functions/create-share-link/index.ts
  + supabase/functions/sign-shared-document/index.ts
  + supabase/functions/send-transactional-email/index.ts
  + supabase/functions/expire-pro-notify/index.ts   (cron)
  + tests/*.test.tsx                     (5 smoke теста)
  ~ supabase/functions/download-document/index.ts   (format: pdf|docx)
  ~ src/pages/Account.tsx                (DOCX бутон + Share)
  ~ src/pages/Wizard.tsx                 (DOCX бутон)
  ~ src/App.tsx                          (route /share/:token, Sentry init)

Миграция:
  CREATE TABLE shared_links (
    id uuid pk, document_id uuid, owner_id uuid,
    token text unique, expires_at timestamptz,
    viewed_at timestamptz, signed_at timestamptz,
    signed_signature text, signer_name text, signer_ip_hash text
  )
  + RLS: owner вижда своите; публично четене САМО през edge (service role).
  + INDEX ON (token), (owner_id, created_at DESC).

Secrets за поискване:
  - RESEND_API_KEY        (за емейли)
  - SENTRY_DSN            (frontend + edge)
  - VITE_GA4_MEASUREMENT_ID  (по избор)
```

## Какво НЕ влиза тук

- Електронен подпис със сертификат (КЕП) — отделна интеграция с Borica/Evrotrust, изисква договор.
- Multi-tenant (агенции с под-акаунти) — Фаза 3, след първите 100 платени потребителя.
- AI чат с договора („попитай юриста") — отделен sprint, изисква vector store.
- Mobile app — PWA първо, native по-късно.

## Ред на изпълнение
1. DOCX експорт (най-бърза стойност за Pro).
2. Share-for-sign (най-голям WOW ефект, виралност).
3. Resend емейли (намалява churn).
4. Sentry + GA4 (нужни ни данни преди реклама).
5. Smoke тестове (преди първия публичен release).

Одобри ли плана, започвам с **точка 1 (DOCX експорт)** и продължавам надолу. Ако искаш различен ред или да изключим нещо — кажи.
