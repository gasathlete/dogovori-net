# Стъпка 5 — платежен и клиентски път (source-only), 14.10.2026

Основа: Step 4 commit `42a95dec`. Нищо не е публикувано, deploy-нато, приложено в базата,
изпратено като имейл или платено. `PRODUCT_TRUSTED_SOURCE_BRIDGE` остава `available: false`.
Цените (2,99 / 3,99 / 7,99 € с ДДС), плановете и top-up пакетите не са променяни.

## DONE

| Област | Какво | Файлове | Доказателство |
|---|---|---|---|
| Доверен източник в платения път | Единна граница `bindTrustedProductSource`: ред по id със service role → собственик → вътрешна съгласуваност → сваляне от `user-contracts` под префикса на собственика → сървърно DOCX извличане → изискване текст/хеш/брой/ревизия да съвпадат; при обработка/уточнение и точно съвпадение с платеното право (собственик, документ, хеш, ревизия, среда). Без резервен текст от браузъра: `modelText` е само сървърно извлеченият текст. | `supabase/functions/_shared/product-source-binding.ts` | Deno тестове по-долу |
| Checkout | Документът вече се чете само през границата; несъответствие → 409/404 преди Stripe цена/сесия/запис. Кранът `productPrepaymentBlockers` остава ПРЕДИ границата. | `create-product-checkout/index.ts` | `product-gates.handler.test.ts` (ред: кран → граница → Stripe → запис) |
| Обработка | Повторно обвързване с `expected: ent`; при разлика → `source_changed`. | `fulfill-product/index.ts` | `product-paid-replay.handler.test.ts`, `productFulfillmentShell.test.ts` |
| Уточнение | Повторно обвързване със средата на правото и `access.binding`; ако сървърният текст се различава от записания → отказ. | `refine-product/index.ts` | refine handler тестове |
| Изключен мост | При OFF границата НЕ сваля файла и връща `modelText: null`; функциите спират на `trusted_source_unavailable` преди задача/доставчик/Stripe. Наличните готови резултати остават достъпни (replay пътят е непроменен). | `product-source-binding.ts` | тест „bridge OFF: no download, no model text“ |
| Staging таблица | `product_source_attestations`: само хешове, брой, ревизия, digest, среда; без текст; service_role only, RLS без политики; rollback и validation заявки. | `docs/migrations/staging_product_source_attestations_2026_10_14.sql` | НЕ приложена |
| Синтетични fixtures | DOCX builder изнесен в общ тестов помощник, без клиентски данни. | `_shared/test-docx-fixture.ts` | — |

Нови тестове (`product-source-binding.test.ts`, 8): мостът е OFF; приема само сървърно извлечен текст и сваля точния път; чужд потребител без сваляне; подправен текст от браузъра със съгласуван хеш → `source_mismatch`; частичен текст; липсващ файл / PDF / чужд път; revision race, подправен хеш, грешна среда, грешен потребител → `source_changed`; разписката не съдържа текст.

Вече налично и потвърдено от съществуващите тестове (не е преписвано): webhook като единствено доказателство за плащане при точен продукт/цена/EUR/количество/потребител/intake/източник/среда; replay/out-of-order; refund/dispute отнема бъдещ достъп без изтриване; return без webhook не дава право; продуктова покупка не става top-up/ops; отделни непредварително отметнати съгласия с версии (`payments-webhook/product.test.ts`, `handlers.test.ts`, `gate3-exact-once.test.ts`, `product-paid-access`, `checkoutDescriptor.test.ts`, `productCheckoutBlocked.test.tsx`).

## Проверки (тази сесия)

- Deno (от корена на проекта): **1341 passed, 0 failed**.
- Vitest: **2042 passed, 4 skipped** (1 остарял source-string тест обновен към новата граница).
- Typecheck (`tsc -p tsconfig.app.json`): OK. Vite build: OK.
- `deno check --no-config` на трите функции: единствената грешка е предшестваща (`_shared/stripe.ts` `init?.headers` при no-config lib), не е от тази промяна.

## NOT RUN

- Реален Stripe TEST checkout/webhook/refund през gateway (изисква включени кранове и staging).
- Сваляне от реалното хранилище в Edge runtime; браузърен E2E на пътя шаблон → преглед → вход → checkout → резултат на телефон/desktop (UI не е променян).
- Прилагане на staging миграцията (няма отделна staging база).

## BLOCKED

| Блокер | Защо | Нужно |
|---|---|---|
| Отделна staging база | Единствената среда обслужва production | Нов изолиран проект/клон |
| 0047 (saved_documents/document_versions) | Не е приложена | Прилагане в staging, после в production с одобрение |
| PDF източник | Няма доказан безопасен сървърен extractor | PDF остава `source_kind_not_attestable` |
| Включване на моста | Изисква staging E2E доказателство | Промяна на `product-trusted-source.ts` + нови тестове |
| CSP/anti-framing | Hosting не позволява headers | Proxy/hosting решение |
| Правно разграничение на отказа | Не е измисляно | Текст от юрист |
| Provider/data residency за AI | Не е потвърдено | Решение на собственика + договор |

## Staging последователност (когато има staging)

1. Snapshot; приложи 0047; провери 0047 validation.
2. Приложи `staging_product_source_attestations_2026_10_14.sql`; изпълни validation заявките в края му.
3. Добави запис на `attestationReceiptRow(...)` в checkout след успешно обвързване (service role).
4. В staging: включи моста само в копие на кода; Stripe TEST: paid / failed / pending / return-без-webhook / refund / replay / cross-user / revision race с карти 4242…, 4000…0002.
5. Rollback: `DROP TABLE public.product_source_attestations;` и връщане на моста на OFF.
6. Production: отделно одобрение за всяка стъпка; активирането на плащания/AI е отделен gate.

## Основа за Стъпка 6 (DTrust/B-Trust)

Не е започната. Входни точки: `signer-action`, `sign-shared-document`, `qes-signatures` bucket, OTP HMAC от security sprint. Нужни: договор и sandbox достъп от доставчика.
