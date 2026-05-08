# Стъпка 2 — Приоритет 1 след пускането

След като затворихме критичните блокери (легални страници, ДДС, SEO, rate-limit на `generate-contract`, soft-delete на контрагенти, HIBP, localStorage), минаваме към следващата вълна подобрения за стабилност, мащабиране и съответствие.

## Какво ще направим в тази итерация

### 1. Stripe — `resolveOrCreateCustomer` в `create-checkout`
Сега при всяко плащане Stripe създава нов customer (или използва само email). Това чупи Customer Portal (refund/смяна на карта) при потребители с няколко покупки.
- Нова помощна функция `resolveOrCreateCustomer(stripe, { userId, email })` в `_shared/stripe.ts`.
- Търси по `metadata.userId`; ако няма — създава с `metadata: { userId }` и записва `stripe_customer_id` в `profiles`.
- Чекаут сесията получава `customer: <id>` вместо `customer_email`.

### 2. Watermark върху безплатните PDF-ове
В `download-document` (free план или PREVIEW) добавяме:
- Воден знак „ПРЕГЛЕД – не за подпис" по диагонал на всяка страница.
- Footer с `user_id` (първи 8 символа) + timestamp — стеганографска следа срещу разпространение.
- Pro потребители получават чисти PDF-ове.

### 3. Rate-limit за `apply-corrections`
Pro guard вече съществува, но без брояч → един Pro акаунт може да източи всички AI кредити.
- Лимит: **50 корекции / Pro потребител / 24h**.
- Логване в съществуващата `ai_usage` таблица с `function = 'apply-corrections'`.
- Връщаме 429 с ясно съобщение на български при превишение.

### 4. Нова таблица `audit_log` (за GDPR/съответствие)
```text
audit_log(
  id uuid pk,
  user_id uuid,
  action text,         -- 'login','download','delete_contact','subscription_change',...
  target_type text,    -- 'document','contact','subscription'
  target_id uuid,
  metadata jsonb,
  ip_hash text,
  created_at timestamptz
)
```
- RLS: потребителят вижда само своите редове; service role пише.
- Edge функциите (`download-document`, `payments-webhook`, soft-delete trigger) вкарват записи.
- Подготовка за GDPR „право на достъп / преносимост" (бъдещ експорт).

### 5. CORS allowlist в продукция
В `_shared/cors.ts` (нов файл) — функция `corsHeaders(origin)` с whitelist:
`https://dogovori.net`, `https://www.dogovori.net`, `*.lovable.app` (preview).
Всички 6 edge функции преминават през него вместо `*`.

## Технически детайли

```text
Файлове:
  + supabase/functions/_shared/cors.ts          (нов)
  + supabase/functions/_shared/customer.ts      (resolveOrCreateCustomer)
  ~ supabase/functions/create-checkout/index.ts
  ~ supabase/functions/download-document/index.ts   (watermark + audit log)
  ~ supabase/functions/apply-corrections/index.ts   (rate limit + audit log)
  ~ supabase/functions/payments-webhook/index.ts    (audit log)
  ~ supabase/functions/generate-contract/index.ts   (cors allowlist)
  ~ supabase/functions/customer-portal/index.ts     (cors allowlist)

Миграция:
  - CREATE TABLE public.audit_log (...)
  - RLS policies (select own, service role insert)
  - INDEX ON (user_id, created_at DESC)
  - ALTER profiles ADD COLUMN stripe_customer_id text  (ако липсва)
```

PDF watermark — използваме съществуващия PDF generator (pdf-lib) и добавяме `drawText` с opacity 0.15, ротация -45°, font size 60.

## Какво НЕ влиза тук (оставяме за по-късно)
- Експорт на DOCX (B7) — отделна задача.
- „Сподели за подпис" линкове (B8) — Фаза 2.
- Sentry/GA4 (B3, B4) — изискват акаунти от потребителя.
- Brand-shaped emails (B5) — по-добре със собствен SMTP/домейн.
- Тестове (B9) — отделна сесия.

Одобри ли го, минавам към имплементацията.
