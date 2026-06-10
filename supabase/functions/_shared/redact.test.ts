// Round-trip тестове за PII редакция.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { redactForAI, unredact } from "./redact.ts";

Deno.test("redact: ЕГН се заменя с placeholder", () => {
  const r = redactForAI("Иван Петров с ЕГН 7501010001.");
  assert(r.redacted.includes("<EGN_1>"));
  assert(!r.redacted.includes("7501010001"));
});

Deno.test("redact: round-trip връща оригинала", () => {
  const original = "Email: ivan@example.com, IBAN BG80BNBG96611020345678, тел. 0888123456.";
  const r = redactForAI(original);
  assert(r.redacted !== original);
  const restored = unredact(r.redacted, r.mapping);
  assertEquals(restored, original);
});

Deno.test("redact: повтарящ се ЕГН ползва един placeholder", () => {
  const r = redactForAI("ЕГН 7501010001 и пак 7501010001.");
  // Един и същи ЕГН → един placeholder, без EGN_2
  assert(r.redacted.includes("<EGN_1>"));
  assert(!r.redacted.includes("<EGN_2>"));
});

Deno.test("redact: mapping does not include stopwords like Sofia", () => {
  const r = redactForAI("Договор между страните в София.");
  // Името София е стопворд → не трябва да се замени с NAME placeholder
  const placeholders = Object.keys(r.mapping);
  assert(!placeholders.some((p) => r.mapping[p] === "София"));
});

Deno.test("redact: stats отразяват броя", () => {
  const r = redactForAI(
    "ЕГН 7501010001, IBAN BG80BNBG96611020345678, email a@b.com",
  );
  assert((r.stats.egn ?? 0) >= 1);
  assert((r.stats.iban ?? 0) >= 1);
  assert((r.stats.email ?? 0) >= 1);
});

Deno.test("redact: EGN започващ с 0 (родени 2000+) не се хваща от phone regex", () => {
  // Регресия: EGN "0102030001" преди се хващаше от PHONE regex (започва с 0).
  const r = redactForAI("ЕГН 0102030001 на лицето.");
  assert(r.redacted.includes("<EGN_1>"), "трябва да има EGN placeholder");
  assert(!r.redacted.includes("<PHONE_1>"), "не трябва да има PHONE placeholder");
  assertEquals(r.mapping["<EGN_1>"], "0102030001");
});

Deno.test("redact: празен вход връща празен изход", () => {
  const r = redactForAI("");
  assertEquals(r.redacted, "");
  assertEquals(Object.keys(r.mapping).length, 0);
});
