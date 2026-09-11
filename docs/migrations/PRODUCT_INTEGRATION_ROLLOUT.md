# Operator runbook: еднократни продукти

Source contract: `contract_check` 2,99 €, `contract_improve` 3,99 €,
`negotiation_package` 7,99 € — еднократни, EUR, с включен ДДС.

Този документ не е разрешение за изпълнение. Той не съдържа secret стойности.
Машинните декларации са `product-rollout-manifest.json` и
`config/product-rollout-contract.json`. Преди всяко действие:

```text
bun run product-rollout:preflight
```

Командата е network-silent и трябва да завърши с exit code 0. Тя доказва само
source parity; не доказва състоянието на среда, база, Stripe или доставчик.

## 1. Отделни човешки одобрения

Нужни са отделни, записани одобрения за всяка граница:

1. maintenance window, backup и write freeze;
2. изпълнение на миграциите;
3. deploy на Edge функциите;
4. frontend publish с flags OFF;
5. sandbox smoke без реално таксуване;
6. включване на sandbox flags;
7. включване на live flags.

Одобрение на една стъпка не разрешава следващата. Никога не копирайте secret
стойности в лог, ticket, commit или preflight output.

## 2. Backup и read-only проверки

- Потвърдете точното окръжение и отговорните оператори.
- Направете и проверете възстановим backup чрез одобрения платформен процес.
- Активирайте write freeze за product intake, entitlement, job, artifact,
  selection и refinement пътищата. Checkout и fulfillment flags остават OFF.
- Проверете read-only, че базовата миграция не е частично приложена.
- Проверете нулевите preapply условия от manifest-а: без legacy/празна policy
  версия; без fulfillment редове преди 0020 и 0022–0024; без `ready`
  entitlement преди 0025.
- Проверете ownership-а на новите таблици и SECURITY DEFINER функциите. SQL
  задава grants/revokes и `search_path=''`, но owner-ът е platform-dependent.
- Проверете, че 0017–0025 не са в Drizzle journal. Това е декларирана ръчна
  patch chain; не смесвайте автоматичния Drizzle runner с този ред.

Ако някое условие не е вярно: STOP. Не попълвайте данни и не заобикаляйте gate.
Подгответе отделен forward-fix след преглед.

## 3. Миграции — точен ред

```text
20260910090000_product_checkout_entitlements
→ 0018 → 0019 → 0020 → 0021 → 0022 → 0023 → 0024 → 0025
```

Използвайте само файловете и SHA-256 стойностите от manifest-а. Всички осем
drizzle/docs двойки трябва да са byte-identical. Всеки файл има transaction
boundary, но 0021, 0022 и 0025 не са произволно retry-safe след неизвестно
частично приложение. При прекъсване не пускайте отново на сляпо: запазете
грешката, проверете transaction outcome read-only и изберете forward-fix.

Очаквана последна миграция:
`0025_product_result_selections`. Няма автоматични down migrations.
Не се измисля rollback за immutable receipts, artifacts, selections или
refinements; данните се пазят, а корекциите са expand/contract или forward-fix.

## 4. Read-only проверка след миграциите

- Проверете очакваните таблици, колони, constraints, индекси, функции,
  triggers, policies, grants и revokes от manifest-а.
- Проверете FORCE RLS и owner-read/service-mutate границата.
- Извикайте read-only `load_product_result_state` с несъществуващи UUID и
  64-символен нулев digest. Точният очакван резултат е
  `{ "ok": false, "reason": "not_found" }`. Грешка или друг резултат държи
  `migration_ready=false` и checkout затворен.
- Потвърдете, че данните от преди прозореца не са променени.

## 5. Конфигурационни имена и разделяне на средите

Allowlist само на имената:

```text
APP_BASE_URL
LOVABLE_API_KEY
PAYMENTS_LIVE_WEBHOOK_SECRET
PAYMENTS_SANDBOX_WEBHOOK_SECRET
PRODUCT_AI_FULFILLMENT_ENABLED
PRODUCT_AI_ZERO_RETENTION_VERIFIED
PRODUCT_CHECKOUT_ENABLED
STRIPE_LIVE_API_KEY
STRIPE_SANDBOX_API_KEY
SUPABASE_ANON_KEY
SUPABASE_SERVICE_ROLE_KEY
SUPABASE_URL
```

Sandbox и live ключове/webhook secrets не се разменят. Sandbox checkout е само
за доказан staff потребител; липсващ/грешен staff RPC отказва. Всеки продуктов
флаг е включен само при точен низ `true`; липса, `1`, `TRUE`, грешна среда или
грешка означава OFF.

Stripe mapping за всяка среда трябва да има точно една активна цена:

| Product ID | lookup_key | Amount | Currency | Type | Tax |
| --- | --- | ---: | --- | --- | --- |
| `contract_check` | `contract_check_299` | 299 | `eur` | `one_time` | `inclusive` |
| `contract_improve` | `contract_improve_399` | 399 | `eur` | `one_time` | `inclusive` |
| `negotiation_package` | `negotiation_package_799` | 799 | `eur` | `one_time` | `inclusive` |

ID, lookup key, amount, currency, type, tax behavior и livemode се сверяват
сървърно. Несъответствие или повече от една цена е отказ, не fallback.

## 6. Functions и frontend — flags OFF

След отделно одобрение deploy-нете съвместимите функции. Проверете подписа и
timestamp-а на webhook-а, event/session idempotency и атомарния
`record_product_purchase`. После публикувайте frontend само с checkout,
fulfillment и zero-retention flags OFF.

Webhook endpoint-ът приема подписаните `checkout.session.completed` и
`checkout.session.async_payment_succeeded`; всяко друго или непроверено събитие
не създава продуктово право.

Checkout не трябва да достига Stripe преди всички gates: database binding,
точен Stripe mapping и webhook, fulfillment, gateway, доказано zero retention,
готови правни източници, privacy/residency и schema capability. Public demo или
fixture никога не е fallback за paid result.

## 7. Sandbox no-charge smoke

С отделно одобрение и тестови Stripe ресурси:

- валиден DOCX/PDF с пълен текст и валидни съгласия достига sandbox checkout;
- грешен ID/цена/валута/tax/livemode, непълен schema capability, липсващ flag,
  неподготвен legal source или забранен residency спира преди Stripe session;
- webhook duplicate не създава второ entitlement;
- fulfillment duplicate не създава втори резултат;
- fulfillment OFF спира нови покупки/обработка, но не обезсилва вече платен
  готов entitlement;
- променен source след плащане отказва резултата;
- сканиран PDF без текстов слой остава недопустим.

Не използвайте live key, live webhook или реална charge в тази стъпка.

## 8. Контролирано включване и наблюдение

Включете само след ново човешко одобрение, първо sandbox, после live. Редът е:
zero-retention доказателство → fulfillment → checkout. Следете checkout
blocker codes, webhook signature/retry/duplicate errors, intake-entitlement
parity, job leases/permanent failures, budget gates и резултати със source или
policy mismatch. Не логвайте документ, резултат или secret.

## 9. STOP, Връщане назад и forward-fix

При mismatch, partial schema, необясним duplicate, webhook failure, provider
retention uncertainty или source/policy binding failure:

1. `PRODUCT_CHECKOUT_ENABLED=false` — спира новите покупки;
2. `PRODUCT_AI_FULFILLMENT_ENABLED=false` — спира новата обработка;
3. `PRODUCT_AI_ZERO_RETENTION_VERIFIED=false` — спира provider calls;
4. запазете платените entitlements и immutable evidence;
5. не drop-вайте таблици и не редактирайте история;
6. възстановете функция само от одобрен предишен artifact или приложете нова
   additive forward-fix миграция след отделен review.

Fulfillment OFF не отменя плащане и не отнема достъп до вече готов резултат.