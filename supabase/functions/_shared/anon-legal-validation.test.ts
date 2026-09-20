import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  allowedCitationKeys,
  validateGroundedReply,
} from "./anon-legal-validation.ts";

const CITATIONS = [
  { short_code: "ЗЗД", citation_label: "[ЗЗД, чл. 79]", version: "2026-01" },
  { short_code: "КТ", citation_label: "[КТ, чл. 328]", version: "2026-01" },
];

Deno.test("допустимите обозначения идват само от извлечените източници", () => {
  const keys = allowedCitationKeys(CITATIONS);
  assert(keys.some((k) => k.includes("ззд")));
  assertEquals(keys.some((k) => k.includes("зут")), false);
});

Deno.test("отговор с цитат от извлечен източник е валиден", () => {
  const r = validateGroundedReply("Съгласно [ЗЗД, чл. 79] дължите обезщетение.", CITATIONS);
  assertEquals(r.ok, true);
});

Deno.test("измислен общ режим се отхвърля", () => {
  const r = validateGroundedReply("Приложимо е [приложим общ режим по ЗЗДН].", CITATIONS);
  assertEquals(r.ok, false);
  assert(r.reasons.includes("fabricated_general_regime_marker"));
});

Deno.test("цитат извън извлечения набор се отхвърля", () => {
  const r = validateGroundedReply("Вижте [ЗУТ, чл. 137].", CITATIONS);
  assertEquals(r.ok, false);
  assert(r.reasons.some((x) => x.startsWith("citation_not_retrieved")));
});

Deno.test("празен отговор се отхвърля", () => {
  assertEquals(validateGroundedReply("   ", CITATIONS).ok, false);
});

Deno.test("вътрешните маркери [S1] не се броят за правно твърдение", () => {
  assertEquals(validateGroundedReply("Текст [S1] с бележка.", CITATIONS).ok, true);
});

// ── Регресии: CTA връзки, диапазон на [Sn], липса на цитат ──────────────────

Deno.test("CTA Markdown връзка не се брои и не отхвърля отговора", () => {
  const citations = [{ short_code: "ЗЗД чл. 20" }];
  const reply = "Виж [ЗЗД чл. 20]. 💡 [Регистрирайте се](/auth) за пълен достъп.";
  const v = validateGroundedReply(reply, citations);
  assertEquals(v.ok, true);
  assertEquals(v.validCitations, 1);
});

Deno.test("документен линк в отговора не е правен цитат", () => {
  const citations = [{ short_code: "ЗЗД чл. 20" }];
  const reply = "[ЗЗД чл. 20] е приложим. [Разгледайте каталога](/catalog) или [изгответе документ](/build).";
  assertEquals(validateGroundedReply(reply, citations).ok, true);
});

Deno.test("правен отговор без нито един реален цитат се отхвърля", () => {
  const reply = "Съгласно закона имате право на обезщетение. [Регистрирайте се](/auth)";
  const v = validateGroundedReply(reply, [{ short_code: "ЗЗД чл. 20" }]);
  assertEquals(v.ok, false);
  assertEquals(v.reasons.includes("no_retrieved_citation"), true);
});

Deno.test("[S1] е валиден само в диапазона на извлечените източници", () => {
  const citations = [{ short_code: "ЗЗД чл. 20" }];
  assertEquals(validateGroundedReply("Виж [S1].", citations).ok, true);
  const out = validateGroundedReply("Виж [S3].", citations);
  assertEquals(out.ok, false);
  assertEquals(out.reasons.some((r) => r.startsWith("source_ref_out_of_range")), true);
});

Deno.test("обозначението трябва да съвпада точно, а не частично", () => {
  const citations = [{ short_code: "ЗЗД чл. 20" }];
  const v = validateGroundedReply("Виж [ЗЗД чл. 20а, ал. 3].", citations);
  assertEquals(v.ok, false);
});

Deno.test("валидацията се прилага и след добавяне на CTA (post-sanitize)", () => {
  const citations = [{ short_code: "ЗЗД чл. 20" }];
  const sanitized = "[ЗЗД чл. 20] урежда тълкуването.\n\n💡 [Регистрирайте се](/auth) за достъп.\n\n👉 [Каталог](/catalog).";
  assertEquals(validateGroundedReply(sanitized, citations).ok, true);
  const tampered = `${sanitized}\n\n[КТ чл. 328]`;
  assertEquals(validateGroundedReply(tampered, citations).ok, false);
});
