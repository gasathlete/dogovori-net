## Цел

Въвеждаме потребителски профили (Lovable Cloud auth) и обвързваме сваляне на договори/бланки с вход. Профилът е лек CRM по модела на Invoice.pro — контрагенти, папки по клиенти, „Любими". Всеки нов потребител получава **1 безплатен договор** и **1 безплатна бланка**. Добавяме защита срещу копиране/сваляне без вход и Stripe upgrade flow за платен план.

---

## Решения по уточняващите въпроси

1. ✅ Google OAuth + Email/парола от старта.
2. ✅ Stripe (Lovable built-in payments) за upgrade към Pro план.
3. ✅ Контрагенти — само български формат (физ. лица: ЕГН/имена/адрес; юр. лица: ЕИК/ДДС №/седалище/МОЛ).
4. По подразбиране: **повторно сваляне на вече запазен документ е безплатно** (не намалява лимита).

---

## 1. Автентикация

- Lovable Cloud: **Email + парола** и **Google** (`lovable.auth.signInWithOAuth("google")`).
- Страници: `/auth` (Login + Sign up tabs), `/reset-password`.
- `useAuth()` hook + `<ProtectedRoute>` wrapper.
- Hydration: `onAuthStateChange` (синхронно) + `getSession()`.
- Header: „Вход / Регистрация" → аватар-меню (Профил, Документи, Изход).
- HIBP password protection включена.

## 2. База данни (Lovable Cloud)

Всички таблици с RLS `user_id = auth.uid()`. Trigger `handle_new_user` създава profile + папка „Любими" + ред в quota.

- **profiles** — `display_name`, `company`, `vat_number`, `avatar_url`.
- **contacts** (контрагенти) — `name`, `type` ('individual'|'legal'), `egn`, `eik`, `vat_number`, `address`, `mol`, `email`, `phone`, `notes`.
- **folders** — `name`, `color`, `is_favorites`. „Любими" е защитена от изтриване.
- **saved_documents** — `folder_id`, `contact_id`, `kind` ('contract'|'template'), `title`, `payload jsonb`, `source_id`.
- **download_quota** — `user_id PK`, `contracts_used int`, `templates_used int`, `plan` ('free'|'pro'), `pro_until timestamptz`.
- **subscriptions** — `stripe_customer_id`, `stripe_subscription_id`, `status`, `current_period_end`.

## 3. Лимити и сваляне

- Free: 1 договор + 1 бланка (общо за акаунта). Pro: неограничено.
- **Първо сваляне** на нов документ → проверка лимит → инкремент.
- **Повторно сваляне** от „Документи" → безплатно (засича се по `saved_document_id`).
- Edge function `download-document`:
  - Валидира JWT (`getClaims`).
  - Чете `download_quota` + проверява `plan='pro' OR pro_until > now() OR used < 1`.
  - Връща `{ token, payload }` (или 402 при изчерпан лимит).
  - Записва ред в `saved_documents`, инкрементира брояча атомарно.
- Клиентът държи jsPDF/docx генерацията (по-лек код), но я задейства само след валиден token.

## 4. Stripe upgrade flow

- `enable_stripe_payments` (Lovable built-in).
- Tax handling: **option 2** (calculation only) — подходящо за български legal-tech, без MOR.
- Един продукт: **Pro план** — месечен абонамент (предлагам 19 лв/мес, финална цена от теб).
- Edge functions: `create-checkout`, `customer-portal`, `stripe-webhook` (slot за upgrade на `download_quota.plan` при `checkout.session.completed` и downgrade при `customer.subscription.deleted`).
- UI: екран „Изчерпан лимит" → бутон „Премини на Pro" → Stripe Checkout (нов таб) → след връщане polling за статус.

## 5. Защита на текста

За **неавтентикирани** потребители в `LiveDraft` (wizard preview) и `CompanionChip` modal:
- CSS: `user-select: none`, `-webkit-user-select: none`.
- JS handlers: `onCopy`/`onCut`/`onContextMenu` → `preventDefault()` + toast „Влезте, за да копирате текста".
- Полупрозрачен воден знак „dogovori.net · preview" зад съдържанието.
- За автентикирани — нормална селекция и копиране.
- Disclaimer: пълна защита срещу copy е невъзможна (DevTools), но мерките спират масовото копиране.

## 6. UI на профила (`/account`)

Layout със shadcn `Sidebar`:

- **Табло** — карти: брояч на лимити (1/1 договори, 1/1 бланки), badge „Free / Pro", CTA „Премини на Pro", последни 5 свалени.
- **Контрагенти** — таблица CRUD, форма с табове „Физическо / Юридическо лице", валидация на ЕГН/ЕИК.
- **Папки** — sidebar списък. „Любими" пинната най-горе. Drag-and-drop за местене на документи.
- **Документи** — grid по папка, филтър по контрагент/тип, действия: Преглед / Свали отново (безплатно) / Премести / Изтрий.
- **Абонамент** — текущ план, дата на подновяване, бутон „Управление в Stripe Portal".
- **Настройки** — профил, парола, изход.

## 7. Интеграция с wizard и каталог

- `Wizard.tsx`:
  - Преди „Анализирай и създай" → ако няма user → redirect `/auth?redirect=/wizard/...`.
  - „Избери контрагент" dropdown в първите въпроси, попълва автоматично страните.
  - „Свали PDF/DOCX" викат `download-document` edge function.
  - След генериране → автоматично записване в „Любими" (toast „Запазен в Документи").
- `CompanionChip` modal: същата auth + лимит логика за бланки.
- `Catalog.tsx`: бутон „Запази" на всеки ред (само за logged-in).

## 8. Стъпки на изпълнение

1. **Migration**: всички таблици + RLS + trigger `handle_new_user`.
2. **Auth**: `configure_social_auth(["google"])`, HIBP, `/auth`, `/reset-password`, `useAuth`, `ProtectedRoute`, Header user menu.
3. **Edge function** `download-document` (JWT + quota + token).
4. **Refactor exporters** → приемат token, гейтват се през edge function.
5. **Защита selection/copy** за гости в `LiveDraft` + `CompanionChip`.
6. **/account shell** със Sidebar + табове.
7. **CRUD**: contacts, folders, saved_documents.
8. **Wizard integration**: contact picker + auto-save след генериране.
9. **Stripe**: `enable_stripe_payments`, Pro продукт, checkout/portal/webhook функции, екран „Изчерпан лимит".
10. **QA**: лимит 1+1, безплатно re-download, RLS изолация, mobile, Stripe test mode.

---

## Технически бележки

- Всички български текстове остават на български.
- Запазваме съществуващия golden/navy design system — никакви нови цветове в компоненти, само semantic tokens.
- Edge functions използват `verify_jwt = false` + ръчен `getClaims` (Lovable стандарт).
- Stripe webhook signature verification задължителна.
- ЕГН/ЕИК валидация: формат + checksum (стандартни български алгоритми).
