import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  findRestrictedIdentifierKinds,
  findRestrictedIdentifierKindsDeep,
  isPlausibleEgnDigits,
  RESTRICTED_IDENTIFIER_BLOCKED_CODE,
  restrictedIdentifierBlock,
  restrictedIdentifierBlockedResponse,
  restrictedIdentifierLogFields,
} from "./text-identifier-gate.ts";

// Тестовите стойности са СИНТЕТИЧНИ: нито един реален потребителски документ.
const EGN_BAD_CHECKSUM = "8012129999"; // достоверна дата, ГРЕШНА контролна сума
const IBAN = "BG80BNBG96611020345678";

Deno.test("достоверно ЕГН се засича и при грешна контролна сума", () => {
  assert(isPlausibleEgnDigits(EGN_BAD_CHECKSUM));
  assertEquals(findRestrictedIdentifierKinds(`Продавач ${EGN_BAD_CHECKSUM}`), ["egn"]);
});

Deno.test("невъзможна дата не е ЕГН (телефон не блокира)", () => {
  assertEquals(isPlausibleEgnDigits("0888881234"), false);
  assertEquals(findRestrictedIdentifierKinds("тел. 0888881234"), []);
});

Deno.test("обозначено ЕГН без пълни 10 цифри също се засича", () => {
  assertEquals(findRestrictedIdentifierKinds("ЕГН: 801212"), ["egn"]);
});

Deno.test("IBAN и обозначена банкова сметка се засичат", () => {
  assertEquals(findRestrictedIdentifierKinds(`IBAN ${IBAN}`), ["iban"]);
  assertEquals(
    findRestrictedIdentifierKinds("банкова сметка: 1020345678"),
    ["bank_account"],
  );
});

Deno.test("номер на лична карта се засича", () => {
  assertEquals(findRestrictedIdentifierKinds("лична карта № 641234567"), ["id_document"]);
});

Deno.test("заместители и празни полета НЕ се засичат — бланките остават достъпни", () => {
  assertEquals(findRestrictedIdentifierKinds("ЕГН: [ЕГН]"), []);
  assertEquals(findRestrictedIdentifierKinds("IBAN: ____________"), []);
  assertEquals(findRestrictedIdentifierKinds("ЕГН: ХХХХХХХХХХ"), []);
  assertEquals(findRestrictedIdentifierKinds(""), []);
  assertEquals(findRestrictedIdentifierKinds(null), []);
});

Deno.test("обхождането стига до вложени отговори и списъци", () => {
  const kinds = findRestrictedIdentifierKindsDeep({
    answers: { parties: [{ note: `ЕГН ${EGN_BAD_CHECKSUM}` }] },
    iban: IBAN,
  });
  assertEquals(kinds.sort(), ["egn", "iban"]);
});

Deno.test("отговорът е 422 със стабилен код и БЕЗ стойността", async () => {
  const res = restrictedIdentifierBlockedResponse({}, ["egn", "iban"]);
  assertEquals(res.status, 422);
  const body = await res.text();
  assertEquals(JSON.parse(body).code, RESTRICTED_IDENTIFIER_BLOCKED_CODE);
  assert(!body.includes(EGN_BAD_CHECKSUM));
  assert(!body.includes(IBAN));
  assert(body.includes("ЕГН"));
});

Deno.test("журналните полета съдържат само вид, никога стойност", () => {
  const fields = restrictedIdentifierLogFields(["egn"]);
  assertEquals(fields, {
    code: RESTRICTED_IDENTIFIER_BLOCKED_CODE,
    restricted_kinds: ["egn"],
  });
  assert(!JSON.stringify(fields).includes(EGN_BAD_CHECKSUM));
});

Deno.test("чист текст минава без отговор — обработката продължава", () => {
  assertEquals(restrictedIdentifierBlock({ text: "Договор за наем на офис." }, {}), null);
});

Deno.test("замърсен текст връща готов отговор преди всякаква обработка", async () => {
  const res = restrictedIdentifierBlock({ text: `ЕГН ${EGN_BAD_CHECKSUM}` }, {});
  assert(res instanceof Response);
  assertEquals(res!.status, 422);
  assertEquals(JSON.parse(await res!.text()).restricted_kinds, ["egn"]);
});
