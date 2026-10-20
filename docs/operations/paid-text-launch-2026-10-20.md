# Платени продукти от поставен текст — 20.10.2026

База: GitHub MAIN 79c822cc. Commit SHA на тази работа: определя се от root при интеграция (sandbox не прави git commit).

## Какво е доказано
Разписката потвърждава само едно: пълният текст, който собственикът е поставил и сървърът `uploaded-text-intake` е приел, проверил за ЕГН/IBAN и нормализирал.
Не е доказателство за извличане от файл. Не се маркира като docx. Файловата DOCX атестация остава непроменена и затворена (мост = false).

## Приложено в MAIN (DEPLOYED)
- Миграция `drizzle/0026_owner_text_product_source` (огледало `supabase/migrations/20261020162000_owner_text_product_source.sql`):
  - добавя `owner_text` към 7 CHECK ограничения и към `record_product_purchase`;
  - нова таблица `product_text_attestations`, достъпна само за service role (anon/authenticated: REVOKE ALL, RLS без политики).
  - Проверка след прилагането: 7 ограничения, функцията е обновена.
- Функции: uploaded-text-intake, create-product-checkout, fulfill-product, refine-product, product-result-state, payments-webhook.

## Логика
- intake с `product_source:true`:
  - нормализира текста;
  - изисква 80..60000 кодови точки и отказва с 422, без отрязване;
  - записва `product_source_kind=owner_text`;
  - записва разписка (owner, doc, text SHA-256, брой знаци, ревизия `updated_at`, digest pta-v1).
  - Всяка редакция без флага изчиства продуктовите полета. Всяка промяна дава нова ревизия, а старата разписка вече не съвпада.
- `bindTrustedProductSource` (checkout/fulfill/refine):
  - за owner_text изисква разписка със същия собственик, хеш, брой знаци и ревизия, плюс верен digest;
  - за файлове спира затворено (`trusted_source_unavailable`);
  - сравнява точното обвързване (owner/doc/hash/revision/env).
- Глобалното `trusted_source_unavailable` в prepayment е премахнато. Произходът се проверява за всеки източник поотделно.
- ProductCheckout: поле за поставен текст, брояч, локална проверка за ЕГН/IBAN и указание за [ЕГН]/[IBAN]. Публично остава затворено (`ONE_TIME_PURCHASES_AVAILABLE=false`).

## Доказателства (MAIN, owner --self, синтетичен текст)
- create 201 → replay 200; разписки: 1.
- ЕГН → 422 restricted_identifier_blocked; 60 001+ знака → 422; подаден `product_source_kind` → 400.
- Клиентът не може да запише разписка (403) и не може да я прочете (403).
- Смяна на заглавие от клиента → нова ревизия. Старата разписка вече не обвързва (покрито от теста за остаряла ревизия).
- create-product-checkout без съгласие → 400 consent_required, без Stripe.
- Deno: 205/205 (product-*, intake). Vitest productCheckoutFlow: 6/6.

## ТОЧЕН оставащ блокер
Истинското платено TEST плащане не е изпълнено. Положителният checkout изисква явно съгласие с Условията за покупка. Няма поддържан синтетичен TEST fixture за съгласие или идентичност. Единствената налична сесия е на реален човек (собственика). Създаване на идентичности е забранено, а съгласие от името на реален човек не се приписва.
Нужно е едно от двете:
1. собственикът лично минава checkout в preview със Stripe тестова карта 4242;
2. одобрен синтетичен staff TEST акаунт.
След това остават webhook → fulfill → PDF/DOCX → replay → refund/stale.

Не са проверени: Stripe сесия, webhook, fulfillment, доставка, refund. Public commerce: ЗАТВОРЕН.
