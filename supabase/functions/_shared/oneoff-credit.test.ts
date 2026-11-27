import { assertEquals, assertThrows } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  CHECKOUT_LOOKUP_KEYS,
  ENTRY_PACK_AMOUNT_CENTS,
  ENTRY_PACK_LOOKUP_KEY,
  EntryPriceError,
  isAllowedCheckoutLookupKey,
  planOneOffCredit,
  requireEntryPackPrice,
} from "./oneoff-credit.ts";

const OK_PRICE = {
  id: "price_1",
  active: true,
  currency: "EUR",
  unit_amount: 290,
  type: "one_time",
  lookup_key: ENTRY_PACK_LOOKUP_KEY,
};

Deno.test("входният пакет е 290 евроцента (над Stripe минимума 50)", () => {
  assertEquals(ENTRY_PACK_AMOUNT_CENTS, 290);
  assertEquals(ENTRY_PACK_LOOKUP_KEY, "five_operations");
});

Deno.test("requireEntryPackPrice приема точна активна EUR one_time цена от 290", () => {
  assertEquals(requireEntryPackPrice([OK_PRICE]).id, "price_1");
  // Пропуска неактивните и взема активната.
  assertEquals(
    requireEntryPackPrice([{ ...OK_PRICE, id: "old", active: false }, OK_PRICE]).id,
    "price_1",
  );
});

Deno.test("requireEntryPackPrice изисква точен lookup key и one_time тип", () => {
  assertEquals(
    assertThrows(
      () => requireEntryPackPrice([{ ...OK_PRICE, lookup_key: "topup_5" }]),
      EntryPriceError,
    ).reason,
    "price_mismatch",
  );
  assertEquals(
    assertThrows(
      () => requireEntryPackPrice([{ ...OK_PRICE, lookup_key: undefined }]),
      EntryPriceError,
    ).reason,
    "price_mismatch",
  );
  assertEquals(
    assertThrows(
      () => requireEntryPackPrice([{ ...OK_PRICE, type: "recurring" }]),
      EntryPriceError,
    ).reason,
    "price_mismatch",
  );
  assertEquals(
    assertThrows(
      () => requireEntryPackPrice([{ ...OK_PRICE, type: undefined }]),
      EntryPriceError,
    ).reason,
    "price_mismatch",
  );
});

Deno.test("allowlist за create-checkout приема само познати ключове", () => {
  for (const key of ["professional_monthly", "entrepreneur_yearly", ENTRY_PACK_LOOKUP_KEY, "topup_50"]) {
    assertEquals(isAllowedCheckoutLookupKey(key), true);
  }
  // Екипните места минават през create-team, не през create-checkout.
  for (const bad of ["team_seat_yearly", "team_yearly", "team_monthly", "", "TOPUP_50", "topup_50 ", null, 5]) {
    assertEquals(isAllowedCheckoutLookupKey(bad), false);
  }
  assertEquals(new Set(CHECKOUT_LOOKUP_KEYS).size, CHECKOUT_LOOKUP_KEYS.length);
});

Deno.test("requireEntryPackPrice отказва липсваща, чужда валута, друга сума и абонамент", () => {
  assertEquals(
    assertThrows(() => requireEntryPackPrice([]), EntryPriceError).reason,
    "price_not_found",
  );
  assertEquals(
    assertThrows(() => requireEntryPackPrice([{ ...OK_PRICE, active: false }]), EntryPriceError).reason,
    "price_not_found",
  );
  assertEquals(
    assertThrows(() => requireEntryPackPrice([{ ...OK_PRICE, active: undefined }]), EntryPriceError).reason,
    "price_not_found",
  );
  assertEquals(
    assertThrows(() => requireEntryPackPrice([{ ...OK_PRICE, currency: "usd" }]), EntryPriceError).reason,
    "price_mismatch",
  );
  assertEquals(
    assertThrows(() => requireEntryPackPrice([{ ...OK_PRICE, unit_amount: 40 }]), EntryPriceError).reason,
    "price_mismatch",
  );
  assertEquals(
    assertThrows(
      () => requireEntryPackPrice([{ ...OK_PRICE, recurring: { interval: "month" } }]),
      EntryPriceError,
    ).reason,
    "price_mismatch",
  );
});

Deno.test("planOneOffCredit сумира операциите за сесията", () => {
  assertEquals(
    planOneOffCredit([
      { quantity: 1, amount_total: 290, price: { lookup_key: "five_operations" } },
    ]),
    { priceId: "five_operations", ops: 5, amountEur: 2.9 },
  );
  assertEquals(
    planOneOffCredit([
      { quantity: 2, amount_total: 580, price: { lookup_key: "five_operations" } },
    ]),
    { priceId: "five_operations", ops: 10, amountEur: 5.8 },
  );
  assertEquals(
    planOneOffCredit([
      { quantity: 1, amount_total: 1290, price: { metadata: { lovable_external_id: "topup_50" } } },
    ]),
    { priceId: "topup_50", ops: 50, amountEur: 12.9 },
  );
  assertEquals(
    planOneOffCredit([{ quantity: 3, price: { lookup_key: "single_contract" } }]),
    { priceId: "single_contract", ops: 3, amountEur: null },
  );
});

Deno.test("planOneOffCredit игнорира абонаменти и непознати ключове", () => {
  assertEquals(planOneOffCredit([]), null);
  assertEquals(planOneOffCredit(null), null);
  assertEquals(
    planOneOffCredit([
      { quantity: 1, price: { lookup_key: "professional_monthly" } },
      { quantity: 1, price: null },
    ]),
    null,
  );
});

Deno.test("една агрегирана заявка за смесена сесия — един session id, едно кредитиране", () => {
  const credit = planOneOffCredit([
    { quantity: 1, amount_total: 290, price: { lookup_key: "five_operations" } },
    { quantity: 1, amount_total: 100, price: { lookup_key: "single_contract" } },
  ]);
  assertEquals(credit, { priceId: "five_operations", ops: 6, amountEur: 3.9 });
});
