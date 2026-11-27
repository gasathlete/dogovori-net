/**
 * Deno тестове за каноничната сървърна продуктова конфигурация.
 * Пуска се с: deno test supabase/functions/_shared/product-purchase.test.ts
 */
import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  PRODUCT_PURCHASES,
  PRODUCT_PURCHASE_IDS,
  ProductPurchaseError,
  isProductPurchaseId,
  productIdForLookupKey,
  readProductSessionMetadata,
  requireProductPrice,
  requireProductSpec,
  verifyProductLineItems,
  assertSessionAmount,
} from "./product-purchase.ts";
import { ONE_OFF_OPS_PER_UNIT } from "./oneoff-credit.ts";

const price = (over: Record<string, unknown> = {}) => ({
  id: "price_1",
  active: true,
  currency: "eur",
  unit_amount: 299,
  type: "one_time",
  lookup_key: "contract_check_299",
  tax_behavior: "inclusive",
  livemode: true,
  ...over,
});

const lineItem = (over: Record<string, unknown> = {}) => ({
  quantity: 1,
  amount_total: 299,
  currency: "eur",
  price: {
    id: "price_1",
    active: true,
    lookup_key: "contract_check_299",
    type: "one_time",
    unit_amount: 299,
    currency: "eur",
    tax_behavior: "inclusive",
    livemode: true,
  },
  ...over,
});

Deno.test("точното съпоставяне продукт → ключ → сума", () => {
  assertEquals(PRODUCT_PURCHASES.contract_check.lookupKey, "contract_check_299");
  assertEquals(PRODUCT_PURCHASES.contract_check.amountCents, 299);
  assertEquals(PRODUCT_PURCHASES.contract_improve.lookupKey, "contract_improve_399");
  assertEquals(PRODUCT_PURCHASES.contract_improve.amountCents, 399);
  assertEquals(PRODUCT_PURCHASES.negotiation_package.lookupKey, "negotiation_package_799");
  assertEquals(PRODUCT_PURCHASES.negotiation_package.amountCents, 799);
  for (const id of PRODUCT_PURCHASE_IDS) {
    assertEquals(PRODUCT_PURCHASES[id].currency, "eur");
    assertEquals(PRODUCT_PURCHASES[id].priceType, "one_time");
    assertEquals(productIdForLookupKey(PRODUCT_PURCHASES[id].lookupKey), id);
  }
  assertEquals(PRODUCT_PURCHASES.negotiation_package.refinementsIncluded, 1);
  assertEquals(PRODUCT_PURCHASES.contract_check.refinementsIncluded, 0);
  assertEquals(PRODUCT_PURCHASES.contract_improve.refinementsIncluded, 0);
});

Deno.test("непознат продукт е отказ", () => {
  assertEquals(isProductPurchaseId("business_contract_map"), false);
  assertThrows(() => requireProductSpec("business_contract_map"), ProductPurchaseError);
  assertThrows(() => requireProductSpec(undefined), ProductPurchaseError);
});

Deno.test("продуктите никога не носят операции", () => {
  for (const id of PRODUCT_PURCHASE_IDS) {
    assertEquals(id in ONE_OFF_OPS_PER_UNIT, false);
    assertEquals(PRODUCT_PURCHASES[id].lookupKey in ONE_OFF_OPS_PER_UNIT, false);
  }
});

Deno.test("цената се проверява строго", () => {
  // Две активни цени с еднакъв ключ са двусмислие, не избор на първата.
  assertThrows(
    () => requireProductPrice([price(), price({ id: "price_2" })], "contract_check", "live"),
    ProductPurchaseError,
  );
  assertThrows(() => requireProductPrice([price({ id: "" })], "contract_check", "live"));
  assertThrows(() => requireProductPrice([price({ tax_behavior: "exclusive" })], "contract_check", "live"));
  assertThrows(() => requireProductPrice([price({ livemode: false })], "contract_check", "live"));
  requireProductPrice([price()], "contract_check", "live");
  assertThrows(() => requireProductPrice([], "contract_check", "live"), ProductPurchaseError);
  assertThrows(() => requireProductPrice([price({ active: false })], "contract_check", "live"));
  assertThrows(() => requireProductPrice([price({ currency: "bgn" })], "contract_check", "live"));
  assertThrows(() => requireProductPrice([price({ unit_amount: 199 })], "contract_check", "live"));
  assertThrows(() => requireProductPrice([price({ type: "recurring" })], "contract_check", "live"));
  assertThrows(
    () => requireProductPrice([price({ recurring: { interval: "month" } })], "contract_check", "live"),
  );
  assertThrows(() => requireProductPrice([price({ lookup_key: "topup_10" })], "contract_check", "live"));
});

Deno.test("платената сесия трябва да носи точно един ред", () => {
  assertThrows(() => verifyProductLineItems([lineItem({ price: { ...lineItem().price, id: undefined } })], "contract_check", "live"));
  assertThrows(() => verifyProductLineItems([lineItem()], "contract_check", "sandbox"));
  assertThrows(() => verifyProductLineItems([lineItem()], "contract_check", "live", "price_other"));
  const ok = verifyProductLineItems([lineItem()], "contract_check", "live");
  assertEquals(ok.amountCents, 299);
  assertEquals(ok.productName, PRODUCT_PURCHASES.contract_check.name);
  assertThrows(() => verifyProductLineItems([], "contract_check", "live"), ProductPurchaseError);
  assertThrows(() => verifyProductLineItems([lineItem(), lineItem()], "contract_check", "live"));
  assertThrows(() => verifyProductLineItems([lineItem({ quantity: 2 })], "contract_check", "live"));
  assertThrows(() => verifyProductLineItems([lineItem({ amount_total: 199 })], "contract_check", "live"));
  assertThrows(() => verifyProductLineItems([lineItem({ currency: "usd" })], "contract_check", "live"));
  assertThrows(() => verifyProductLineItems([lineItem()], "contract_improve", "live"));
  assertThrows(() =>
    verifyProductLineItems([lineItem({ price: { lookup_key: "contract_check_299", recurring: { interval: "month" } } })], "contract_check", "live")
  );
});

Deno.test("общата сума на сесията също се сверява", () => {
  assertSessionAmount(799, "eur", "negotiation_package");
  assertThrows(() => assertSessionAmount(639, "eur", "negotiation_package"));
  assertThrows(() => assertSessionAmount(799, "bgn", "negotiation_package"));
});

Deno.test("метаданните не могат да си противоречат", () => {
  assertEquals(readProductSessionMetadata({ type: "topup" }), null);
  const ok = readProductSessionMetadata({
    purchase_kind: "product",
    productId: "contract_improve",
    userId: "u1",
    intakeId: "i-1",
    sourceDocumentId: "doc-1",
    environment: "sandbox",
  });
  assertEquals(ok?.productId, "contract_improve");
  assertEquals(ok?.intakeId, "i-1");
  // Липсващ непрозрачен идентификатор е отказ.
  assertThrows(() =>
    readProductSessionMetadata({
      purchase_kind: "product",
      productId: "contract_improve",
      userId: "u1",
      environment: "live",
    })
  );
  assertThrows(() =>
    readProductSessionMetadata({ type: "product", productId: "nope", intakeId: "i" })
  );
  assertThrows(() =>
    readProductSessionMetadata({
      type: "product",
      productId: "contract_check",
      userId: "u1",
      intakeId: "i",
      sourceDocumentId: "d",
      environment: "prod",
    })
  );
});
