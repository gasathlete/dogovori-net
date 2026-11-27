# Стъпка 4 — AI продукти и доверен източник (13.10.2026)

Основа: commit 786417981f44 (Стъпка 3). Само source; без deploy, миграции, secrets, Stripe, имейли. `PRODUCT_TRUSTED_SOURCE_BRIDGE.available` остава `false`.

## Gap матрица (продуктови пътища)

| Път | Състояние преди | Сега |
|---|---|---|
| create-product-checkout | `verifyStoredProductSource` (само съгласуваност на браузърни данни) + затворен мост | непроменен, затворен |
| fulfill-product | същото; доказателства по span (`product-evidence.ts`), budget, idempotency | непроменен, затворен |
| refine-product | read-only replay, еднократно уточнение | непроменен, затворен |
| product-result-state / payments-webhook | entitlement само от проверен paid webhook | непроменен |
| Произход на източника | НЯМА сървърно извличане | **ДОБАВЕНО: `_shared/product-source-attestation.ts`** |

## Резултат

| Статус | Елемент | Доказателство |
|---|---|---|
| DONE | Сървърна атестация: байтове от server-owned storage → собствено ZIP/DOCX извличане (без нова зависимост), нормализация, SHA-256 на файл и текст, owner/път/ревизия/среда, каноничен digest | `supabase/functions/_shared/product-source-attestation.ts` |
| DONE | Браузърният `text_hash` е само за съпоставка; разлика → `source_mismatch` | тест „spoofing“ |
| DONE | Отказ при: друг потребител, чужд/traversal път, подменен файл, отрязан ZIP, криптиран, лъжлив размер (непълно извличане), zip bomb лимит 8 MiB, файл >10 MiB, <80/>60 000 знака, липсваща ревизия, altChunk | 9 теста в `product-source-attestation.test.ts` |
| DONE | Stale/replay: `attestationMatchesEntitlement` сравнява owner/документ/хеш/ревизия/среда; паралелни атестации детерминистични | тестове |
| DONE | Тестовете за затворения мост остават зелени | `product-trusted-source.test.ts` |
| BLOCKED | PDF: няма доказан сървърен извличач без нова зависимост → изричен `source_kind_not_attestable`. Платените продукти могат да се отворят само за DOCX или след добавен/проверен PDF извличач | — |
| BLOCKED | Свързване на атестацията в checkout/fulfill/refine и отваряне на моста — нужни staging DB + E2E (сървърно сваляне на обекта, запис на атестацията в server-only колона/таблица) | отделна staging среда липсва |
| BLOCKED | 0047 (client payload writes за saved_documents/document_versions) — не е приложена; нужна staging репетиция | `docs/migrations/0047_*.sql` |
| NOT VERIFIED | Качество на реалните резултати на трите продукта (без live AI) | AI gates затворени |
| NOT VERIFIED | Stripe sandbox E2E, refund/dispute след готов резултат на живо | Стъпка 5 |

## Тестове
- Deno (от корена на проекта): **1333 passed, 0 failed** (вкл. 9 нови). Пуснати от `supabase/functions/` 12 source-проверки падат само заради относителни пътища — не са регресии.
- Vitest/typecheck/build: NOT RUN в тази стъпка — приложният код не е променян (Стъпка 3: 2042 passed).

## Следващи действия (Стъпка 5)
1. Staging DB: колона/таблица `product_source_attestations` (service-role only), запис при checkout; fulfill/refine повторно атестират и сравняват digest.
2. В checkout/fulfill: сваляне на обекта с service role по `uploaded_contracts.storage_path` → `attestProductSource` → само `attestation.text` към модела.
3. Решение за PDF (сървърен извличач) или публично „само DOCX“ за платените продукти.
4. Приложи 0047 в staging, после E2E sandbox плащане → резултат → refund → без достъп; едва след това промяна на моста с преглед.
