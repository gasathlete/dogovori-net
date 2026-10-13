# Техническо приключване — 13.10.2026 (Стъпка 2)

Обхват: проверка на живото състояние + P0 матрица. Без production DDL/данни, без промени на тайни, без Stripe, без публикуване.

## 1. Среди (проверено 13.10.2026 08:25–08:35 UTC)

| Среда | Състояние | Доказателство |
|---|---|---|
| Source | HEAD след 4483cc57; авто-commit 79b1158f беше понижил `bun.lock` до lockfileVersion 1 — възстановен на v3 от 4483cc57 | `git show` |
| GitHub CI | NOT VERIFIED — няма достъп до GitHub статуси оттук | — |
| Production | dogovori.net 200, `x-deployment-id psr2.33ea924a-…`, скрипт `/assets/index-D8h_aXBN.js` | curl |
| Тъждественост prod = HEAD | NOT VERIFIED. Локалният build дава `index-grMBTmaS.js` (различен хеш; може да е от различна среда на build) | vite build |
| Staging | Няма отделна staging база: една инстанция обслужва preview и production | конфигурация на проекта |

## 2. Живи данни (агрегирано, без лични данни)

- document_blanks: 588; legal_sources: 21; `static_catalog_assets`: не съществува (sandbox SQL не е приложен).
- product_entitlements: 18 = 3 paid, 6 ready, 9 failed. Всички 18: `environment=sandbox`, Stripe сесия `cs_test_*`, 0 live, **1 потребител**, създадени на една дата (14.09.2026), сума 77,82 € тестови.
  Извод: синтетични тестови записи. Няма реално платен клиентски случай.
- product_fulfillment_jobs: 15 = 6 completed, 9 failed (същите тестови права).

## 3. P0 матрица

| # | Област | Живо състояние | Статус |
|---|---|---|---|
| 1 | saved_documents / uploaded_contracts: идентичност и път | Тригер `trg_document_client_identity` (S15) е жив: user_id при insert = auth.uid(), непроменим, storage път с префикс на собственика, без `..`/`%2e` | DONE |
| 2 | Съдържание на saved_documents от клиента (0047) | Клиентът все още има INSERT/UPDATE на payload; затваряне само в клиентски код (`CLIENT_RAW_TEXT_WRITE_ALLOWED=false`) | STILL BLOCKED — нужен е production DDL (0047), не е приложен |
| 3 | document_versions | authenticated има INSERT; политиката проверява само user_id, не собствеността на документа. review-document изисква версия и документ с един и същ собственик → чужд документ не може да се подмени. Собственикът може да запише произволна версия на свой документ | STILL BLOCKED (за платени продукти) — същото като 2; не дава достъп до чужди данни |
| 4 | Произход на източника (trusted-source attestation) | `PRODUCT_TRUSTED_SOURCE_BRIDGE.available=false` в код; плащане/обработка/уточнение затворени независимо от флагове | STILL BLOCKED — няма сървърно извличане/атестация; не е изграден в този спринт |
| 5 | Регистри „вече таксувано“, signers, entitlements, intakes | anon/authenticated: без INSERT/UPDATE (проверено с has_table_privilege) | DONE |
| 6 | shared_links | `trg_shared_links_client_write_guard` жив | DONE |
| 7 | Хранилище | Размерни лимити на всички клиентски кофи; MIME списък на partner-logos, user-articles, user-contracts и pending кофите; branding/team-assets/home-testimonials/qes-signatures без MIME списък на ниво кофа | DONE (частично: MIME на 4 кофи се налага само в код) |
| 8 | Плащания / AI гейтове | Код: затворени по подразбиране, плюс trusted-source блокер; стойността на тайните не е четена | DONE за затварянето; NEEDS PROVIDER за live Stripe |
| 9 | HTTP заглавки | Сигурносният скрипт: 6 грешки — без CSP/anti-framing в заглавката; няма Permissions-Policy. Хостингът игнорира `public/_headers` | NEEDS PROVIDER (хостинг/прокси) |
| 10 | Миграции 0044–0048 | Нямам достъп до `supabase_migrations` (permission denied). Живото състояние се доказва от обекти: S15 жив, 0047 не | NOT VERIFIED по номер на версия |
| 11 | Лични данни в entitlements | Тестов потребител; не са изнасяни | DONE |
| 12 | Дата 01.11.2026 | Без промяна | — |

## 4. Проверки

- vitest: 160 файла, 2035 passed, 4 skipped, 0 failed.
- Typecheck (tsconfig.app): 0 грешки.
- vite build: OK.
- Deno (`_shared/*.test.ts` + payments-webhook): 1010 passed, 0 failed.
- Сигурносен скрипт за заглавки: ready=false, 6 грешки (виж т.9).
- NOT RUN: GitHub CI, проверка на frozen install с Bun 1.4.2 (в sandbox има само 1.3.3), staging rehearsal (няма staging), проверка на телефон/компютър (UI не е променян).

## 5. Промени в кода

- `bun.lock` е възстановен на lockfileVersion 3 (обръща понижаването в 79b1158f).
- Този отчет.
- Код на приложението/функциите: без промени. Не беше открит P0, който да се поправи безопасно само в кода: оставащите P0 изискват production DDL (0047 / document_versions), нова сървърна атестация или промяна при хостинга.

## 6. Следващи действия (Стъпка 3)

1. Root: прегледайте и приложете `docs/migrations/0047_saved_documents_client_payload_gate.sql`, плюс guard за document_versions (`saved_document_id` трябва да е на същия собственик; INSERT само от service role). Първо в отделна staging/branch база (такава сега няма).
2. Решете отделна staging среда (Lovable draft/branch), за да се правят rehearsal и rollback.
3. Изградете сървърна атестация на източника: сървърът извлича текста от качения файл и записва SHA-256 → едва тогава `available=true`, с тестове.
4. Заглавки CSP/X-Frame-Options/Permissions-Policy: функция на хостинга или прокси (Cloudflare).
5. Live Stripe: само след 1–3 и end-to-end тест в sandbox.
6. Тестовите 18 права: могат да се маркират/архивират като синтетични. Това е промяна на данни и иска отделно одобрение.
