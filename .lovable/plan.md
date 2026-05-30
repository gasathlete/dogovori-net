# Pre-launch QA — Batch 2

Продължаваме с останалите задачи от пълния одит.

## 1. Responsive QA (393px + 1280px)
- Browser tool обход на ключови маршрути: `/`, `/catalog`, `/template/:slug`, `/build`, `/auth`, `/account`, `/checkout`, `/blog`, `/blog/:slug`.
- Screenshot на двата viewport-а, fix на overflow / clipping / touch target < 44px.

## 2. BG localization sweep
- `rg` за hardcoded английски стрингове в `src/` (UI копи, toast-ове, error states, email шаблони, edge функции с user-facing текст).
- Fix всичко user-facing на български. App UI остава English ↔ изключение: продуктът е BG.
- Проверка за остатъци от "BGN/лв/lev" (паметта казва само EUR).

## 3. Anti-spam за публични форми
- Идентифициране на публичните форми (contact, newsletter, signup).
- Honeypot поле + проста rate-limit проверка в edge функции (IP-based, 5/min).
- Cloud captcha само ако вече има инфраструктура — иначе honeypot е достатъчен за launch.

## 4. Stripe sandbox end-to-end
- `supabase--curl_edge_functions` на `create-checkout` с тестов price.
- Проверка на `payments-webhook` логове за `customer.subscription.created` / `checkout.session.completed`.
- `consume_quota` / `consume_team_quota` smoke test през read_query.
- `/checkout/return` рендира коректно session_id.

## 5. Email queue верификация
- `supabase--read_query` на `email_send_log` за последни 50 записа — status разпределение.
- `process-email-queue` logs за грешки.
- Trigger тестов signal (signup → welcome) и проверка че попада в queue + изпраща се.

## 6. Performance baseline
- Bundle size check (`du -sh dist/assets/*` след build).
- Lazy-load на тежки routes (Wizard, Template) ако още не са.
- Lighthouse-style ръчна проверка: LCP element, CLS на hero, font-display.

## Извън scope
- Промени в бизнес логика, нови features, design redirection.
- Live Stripe тестове (само sandbox).

## Ред на изпълнение
Batch-ите ще се изпълняват последователно, със спиране при blocker findings. Очаквам 2-3 итерации с конкретни фиксове + QA evidence (screenshots/log изводи).
