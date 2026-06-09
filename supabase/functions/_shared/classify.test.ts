// Unit tests за GDPR/AI Act класификационния слой.
// Изпълняват се с: deno test --allow-net --allow-env supabase/functions/_shared/classify.test.ts

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyDocumentBeforeAI } from "./classify.ts";

Deno.test("classify: празен текст → low risk, no PII", () => {
  const r = classifyDocumentBeforeAI("");
  assertEquals(r.risk_level, "low");
  assertEquals(r.contains_personal_data, false);
  assertEquals(r.contains_special_category_data, false);
  assertEquals(r.redaction_required, false);
});

Deno.test("classify: само генеричен текст → low", () => {
  const r = classifyDocumentBeforeAI(
    "Настоящият договор се сключва между двете страни на основание чл. 9 ЗЗД.",
  );
  assertEquals(r.risk_level, "low");
  assertEquals(r.contains_personal_data, false);
});

Deno.test("classify: ЕГН → high risk + изисква потвърждение", () => {
  const r = classifyDocumentBeforeAI(
    "Иван Петров с ЕГН 7501010001 сключва договор.",
  );
  assertEquals(r.risk_level, "high");
  assert(r.contains_personal_data);
  assert(r.redaction_required);
  assert(r.user_confirmation_required);
  assert(r.pii_counts.egn >= 1);
});

Deno.test("classify: български IBAN → high", () => {
  const r = classifyDocumentBeforeAI(
    "Плащане по IBAN BG80BNBG96611020345678.",
  );
  assertEquals(r.risk_level, "high");
  assert(r.pii_counts.iban >= 1);
});

Deno.test("classify: email + телефон → medium", () => {
  const r = classifyDocumentBeforeAI(
    "За контакт: ivan@example.com, тел. +359 888 123 456",
  );
  assertEquals(r.risk_level, "medium");
  assert(r.contains_personal_data);
  assert(r.redaction_required);
  assertEquals(r.user_confirmation_required, false);
});

Deno.test("classify: медицински документ → blocked / high + special category", () => {
  const r = classifyDocumentBeforeAI(
    "Болничен лист, диагноза МКБ-10, ТЕЛК решение.",
  );
  assert(r.contains_special_category_data);
  assertEquals(r.risk_level, "high");
  assert(r.reasons.some((x) => x.startsWith("special:")));
});

Deno.test("classify: HIV → special category", () => {
  const r = classifyDocumentBeforeAI("Пациентът е с ХИВ позитивен статус.");
  assert(r.contains_special_category_data);
});

Deno.test("classify: три имена → high", () => {
  const r = classifyDocumentBeforeAI(
    "Иван Георгиев Петров, Мария Иванова Стоянова, Петър Димитров Колев",
  );
  assertEquals(r.risk_level, "high");
});

Deno.test("classify: allowed_models по риск", () => {
  const low = classifyDocumentBeforeAI("Стандартен договор за услуга.");
  assertEquals(low.allowed_models.length, 3);
  const medium = classifyDocumentBeforeAI("Email: test@x.com");
  assertEquals(medium.allowed_models.length, 2);
  const high = classifyDocumentBeforeAI("ЕГН: 7501010001");
  assertEquals(high.allowed_models.length, 1);
});
