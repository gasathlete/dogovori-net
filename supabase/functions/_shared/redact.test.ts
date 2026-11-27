// Round-trip тестове за PII редакция.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { redactForAI, unredact } from "./redact.ts";

Deno.test("redact: ЕГН се заменя с placeholder", () => {
  const r = redactForAI("Иван Петров с ЕГН 7501010001.", "salt1");
  assert(r.redacted.includes("<EGN_1_salt1>"));
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
  const r = redactForAI("ЕГН 7501010001 и пак 7501010001.", "salt1");
  // Един и същи ЕГН → един placeholder, без EGN_2
  assert(r.redacted.includes("<EGN_1_salt1>"));
  assert(!r.redacted.includes("<EGN_2_salt1>"));
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
  const r = redactForAI("ЕГН 0102030001 на лицето.", "salt1");
  assert(r.redacted.includes("<EGN_1_salt1>"), "трябва да има EGN placeholder");
  assert(!r.redacted.includes("<PHONE_1_salt1>"), "не трябва да има PHONE placeholder");
  assertEquals(r.mapping["<EGN_1_salt1>"], "0102030001");
});

Deno.test("redact: празен вход връща празен изход", () => {
  const r = redactForAI("");
  assertEquals(r.redacted, "");
  assertEquals(Object.keys(r.mapping).length, 0);
});

// ── Устойчивост на колизии (токен със сол за всяко извикване) ───────────────

Deno.test("redact: буквален placeholder във входа не получава чужда стойност", () => {
  const input = "Текст с <EMAIL_1> и истински имейл ivan@example.com.";
  const r = redactForAI(input);
  const restored = unredact(r.redacted, r.mapping);
  assertEquals(restored, input);
  // Буквалният `<EMAIL_1>` остава непокътнат и не е ключ в картата.
  assert(!Object.keys(r.mapping).includes("<EMAIL_1>"));
});

Deno.test("redact: две извиквания дават различни токени", () => {
  const a = redactForAI("ivan@example.com");
  const b = redactForAI("ivan@example.com");
  assert(Object.keys(a.mapping)[0] !== Object.keys(b.mapping)[0]);
});

Deno.test("redact: повтаряща се стойност ползва един и същ токен", () => {
  const r = redactForAI("ivan@example.com и пак ivan@example.com", "salt2");
  assertEquals(Object.keys(r.mapping).length, 1);
  assertEquals(r.redacted.split("<EMAIL_1_salt2>").length - 1, 2);
});

Deno.test("redact: цифрова сол не се прередактира като телефон/ЕГН", () => {
  const input = "Имейл ivan@example.com и още ana@example.org.";
  for (const salt of ["0857851130", "1234567890", "0d08578511"]) {
    const r = redactForAI(input, salt);
    assertEquals(unredact(r.redacted, r.mapping), input);
  }
});

Deno.test("redact: стотици случайни соли винаги връщат оригинала", () => {
  const input = "Текст с <EMAIL_1>, имейл ivan@example.com, тел. 0888123456 и ЕГН 0123456789.";
  for (let i = 0; i < 300; i++) {
    const r = redactForAI(input);
    assertEquals(unredact(r.redacted, r.mapping), input);
  }
});
