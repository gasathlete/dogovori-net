import { assert, assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  ProductContextError,
  canonicalContextJson,
  requireStoredProductContext,
  sameProductContext,
  validateProductContext,
} from "./product-intake-context.ts";

const CHECK_CONTEXT = { role: "Наемодател" };
const IMPROVE_CONTEXT = {
  role: "Изпълнител",
  objective: "Да ограничим отговорността си",
  preferred_position: "balanced",
};
const PREMIUM_CONTEXT = { ...IMPROVE_CONTEXT, counterparty_context: "Голям корпоративен клиент" };

Deno.test("всеки продукт изисква точно своите полета", () => {
  assertEquals(validateProductContext(CHECK_CONTEXT, "contract_check"), { role: "Наемодател" });
  assertEquals(
    validateProductContext(IMPROVE_CONTEXT, "contract_improve").preferred_position,
    "balanced",
  );
  assertEquals(
    validateProductContext(PREMIUM_CONTEXT, "negotiation_package").counterparty_context,
    "Голям корпоративен клиент",
  );
});

Deno.test("липсващо задължително поле е отказ, не подразбиране", () => {
  const cases: [unknown, Parameters<typeof validateProductContext>[1], string][] = [
    [{}, "contract_check", "role_required"],
    [CHECK_CONTEXT, "contract_improve", "objective_required"],
    [{ role: "Изпълнител", objective: "Цел" }, "contract_improve", "position_required"],
    [IMPROVE_CONTEXT, "negotiation_package", "counterparty_required"],
  ];
  for (const [raw, product, reason] of cases) {
    const err = assertThrows(() => validateProductContext(raw, product), ProductContextError);
    assertEquals((err as ProductContextError).reason, reason);
  }
});

Deno.test("непознато поле, дълга или невалидна стойност се отказват", () => {
  assertThrows(
    () => validateProductContext({ ...CHECK_CONTEXT, notes: "х" }, "contract_check"),
    ProductContextError,
  );
  assertThrows(
    () => validateProductContext({ role: "х".repeat(121) }, "contract_check"),
    ProductContextError,
  );
  assertThrows(() => validateProductContext({ role: "х" }, "contract_check"), ProductContextError);
  assertThrows(
    () => validateProductContext({ ...IMPROVE_CONTEXT, preferred_position: "агресивен" }, "contract_improve"),
    ProductContextError,
  );
  assertThrows(() => validateProductContext("роля", "contract_check"), ProductContextError);
  assertThrows(() => validateProductContext([], "contract_check"), ProductContextError);
});

Deno.test("записаният контекст минава СЪЩАТА проверка", () => {
  assertThrows(() => requireStoredProductContext(null, "contract_check"), ProductContextError);
  assertThrows(() => requireStoredProductContext(CHECK_CONTEXT, "negotiation_package"), ProductContextError);
  assertEquals(requireStoredProductContext(PREMIUM_CONTEXT, "negotiation_package").role, "Изпълнител");
});

Deno.test("сравнението е по канонично съдържание, не по ред на ключовете", () => {
  assert(
    sameProductContext(
      { role: "Изпълнител", objective: "Цел на страната", preferred_position: "balanced" },
      { preferred_position: "balanced", objective: "Цел на страната", role: "Изпълнител" },
    ),
  );
  assert(!sameProductContext(CHECK_CONTEXT, { role: "Наемател" }));
  assertEquals(canonicalContextJson(null), "{}");
});

Deno.test("ограничени идентификатори в роля/цел/контрагент се отказват преди покупка", () => {
  for (const [raw, product] of [
    [{ role: "ЕГН: 1234567890" }, "contract_check"],
    [{ ...IMPROVE_CONTEXT, objective: "ЕГН: 1234567890" }, "contract_improve"],
    [{ ...PREMIUM_CONTEXT, counterparty_context: "ЕГН: 1234567890" }, "negotiation_package"],
  ] as const) {
    const err = assertThrows(() => validateProductContext(raw, product), ProductContextError);
    assertEquals((err as ProductContextError).reason, "restricted_identifier_blocked");
  }
});
