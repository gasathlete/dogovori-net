// Policy тестове: моделният роутер не трябва да изпраща special-category
// данни до по-силни модели и не трябва да позволява fallback при висок риск.

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { classifyDocumentBeforeAI } from "./classify.ts";
import { routeModel } from "./model-router.ts";

Deno.test("router: correct-uploaded блокиран при medical document", () => {
  const cls = classifyDocumentBeforeAI("Болничен лист, диагноза");
  const decision = routeModel("correct-uploaded", cls, { userConfirmed: true });
  assertEquals(decision.allowed, false);
  assertEquals(decision.blockedReason, "special_category_data_blocked_for_operation");
});

Deno.test("router: ocr-contract блокиран при ТЕЛК", () => {
  const cls = classifyDocumentBeforeAI("ТЕЛК експертно решение");
  const decision = routeModel("ocr-contract", cls, { userConfirmed: true });
  assertEquals(decision.allowed, false);
});

Deno.test("router: analyze-contract при ЕГН → no Pro fallback", () => {
  const cls = classifyDocumentBeforeAI("ЕГН 7501010001 Иван Петров");
  const decision = routeModel("analyze-contract", cls);
  assert(decision.allowed);
  // Pro не трябва да е в fallback верига при high risk
  assert(!decision.fallbackChain.includes("google/gemini-2.5-pro"));
  assert(decision.redactionRequired);
});

Deno.test("router: low risk → Pro е достъпен във fallback", () => {
  const cls = classifyDocumentBeforeAI("Стандартен договор за услуга, без лични данни.");
  const decision = routeModel("analyze-contract", cls);
  assert(decision.allowed);
  assert(decision.fallbackChain.includes("google/gemini-2.5-pro"));
});

Deno.test("router: high risk изисква user confirmation", () => {
  const cls = classifyDocumentBeforeAI("ЕГН: 7501010001");
  const noConfirm = routeModel("build-custom-contract", cls);
  assert(noConfirm.requireConfirmation);
  const confirmed = routeModel("build-custom-contract", cls, { userConfirmed: true });
  assertEquals(confirmed.requireConfirmation, false);
});

Deno.test("router: redaction задължителна при PII", () => {
  const cls = classifyDocumentBeforeAI("email: test@x.com");
  const decision = routeModel("generate-contract", cls);
  assert(decision.redactionRequired);
});

Deno.test("router: low risk → no redaction required", () => {
  const cls = classifyDocumentBeforeAI("Договор между страните.");
  const decision = routeModel("generate-contract", cls);
  assertEquals(decision.redactionRequired, false);
});
