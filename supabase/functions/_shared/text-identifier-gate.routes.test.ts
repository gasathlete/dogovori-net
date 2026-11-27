/**
 * Поведенчески тест върху ДЕЙСТВИТЕЛНИТЕ форми на телата на заявките, които
 * новите маршрути подават на преградата. Проверява се, че:
 *   - замърсено тяло дава 422 със стабилен код и БЕЗ стойността;
 *   - тяло само със заместители минава, т.е. бланките остават достъпни.
 *
 * Тестовите стойности са СИНТЕТИЧНИ. Мрежа не се използва.
 */
import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  findRestrictedIdentifierKindsDeep,
  RESTRICTED_IDENTIFIER_BLOCKED_CODE,
  restrictedIdentifierBlock,
} from "./text-identifier-gate.ts";

const EGN = "8012129999"; // достоверна дата, ГРЕШНА контролна сума
const IBAN = "BG80BNBG96611020345678";

/** Форма → тяло, което съответният маршрут подава на преградата. */
const DIRTY_BODIES: Record<string, unknown> = {
  "apply-corrections": {
    contract: { clauses: [{ body: `Продавач с ЕГН ${EGN}` }] },
    selectedIssues: [{ id: "1", quote: "чл. 3" }],
    selectedRecommendations: [],
    answers: { payout: `IBAN ${IBAN}` },
    operation_id: "11111111-1111-4111-8111-111111111111",
  },
  "refine-contract": {
    contract: { clauses: [{ body: "Наем на офис" }] },
    feedback: `Добавете ЕГН ${EGN} на наемателя`,
    operation_id: "11111111-1111-4111-8111-111111111111",
  },
  "build-custom-contract": {
    name: "Договор за изработка",
    customFields: [{ label: "Сметка", value: IBAN }],
    parentContext: { clauses: [] },
  },
  "generate-linked-document": {
    kind: "annex",
    parent_contract: { title: "Договор", clauses: [{ body: `ЕГН: ${EGN}` }] },
    notes: "без промени",
  },
  "review-document": {
    document: { title: "Договор", body: `лична карта № 641234567` },
    operation_id: "11111111-1111-4111-8111-111111111111",
  },
  "assistant-chat-anon": [
    { role: "user", content: `Може ли да сложа ЕГН ${EGN} тук?` },
  ],
  "assistant-chat": {
    message: "Прегледайте документа",
    history: [{ role: "assistant", content: "Добре." }],
    context: { title: "Договор", body: `банкова сметка: 1020345678` },
  },
  "draft-sync": {
    payload: { answers: { seller_id: EGN } },
    doc_key: "dogovor-za-naem",
  },
  "draft-claim": {
    payload: { result: { clauses: [{ body: `IBAN ${IBAN}` }] } },
    doc_key: "dogovor-za-naem",
  },
  "assistant-edit": `Наемателят ЕГН ${EGN} се задължава...`,
  "admin-generate-article": {
    topic: "Наем",
    category: "imoti",
    mandatoryText: `Пример: ЕГН ${EGN} се попълва от страните на място.`,
  },
  "simulation-run": {
    scenario: `Клиент иска договор и дава ЕГН ${EGN}`,
    maxTurns: 3,
  },
};

/** Същите форми, но само със ЗАМЕСТИТЕЛИ — трябва да минат без пречка. */
const CLEAN_BODIES: Record<string, unknown> = {
  "apply-corrections": {
    contract: { clauses: [{ body: "Продавач с ЕГН [ЕГН]" }] },
    answers: { payout: "IBAN: ____________" },
  },
  "refine-contract": { contract: {}, feedback: "Съкратете чл. 5" },
  "build-custom-contract": { customFields: [{ label: "Сметка", value: "[IBAN]" }] },
  "generate-linked-document": { parent_contract: { clauses: [{ body: "ЕГН: ХХХХХХХХХХ" }] } },
  "review-document": { document: { body: "лична карта № ________" } },
  "assistant-chat-anon": [{ role: "user", content: "Какво е неустойка?" }],
  "assistant-chat": { message: "Обобщи документа", context: { title: "Договор", body: "ЕГН: [ЕГН]" } },
  "draft-sync": { payload: { answers: { seller_id: "" } }, doc_key: "dogovor-za-naem" },
  "draft-claim": { payload: { result: { clauses: [{ body: "IBAN [IBAN]" }] } } },
  "assistant-edit": "Наемателят [ЕГН] се задължава...",
  "admin-generate-article": {
    topic: "Наем",
    category: "imoti",
    mandatoryText: "Данните се попълват на място от страните.",
  },
  "simulation-run": { scenario: "Клиент иска договор за наем", maxTurns: 3 },
};

for (const [route, body] of Object.entries(DIRTY_BODIES)) {
  Deno.test(`${route}: замърсеното тяло се спира с 422 и без стойността`, async () => {
    const kinds = findRestrictedIdentifierKindsDeep(body);
    assert(kinds.length > 0, `${route}: преградата не засича нищо`);

    const res = restrictedIdentifierBlock(body, {});
    assert(res instanceof Response, `${route}: няма готов отговор`);
    assertEquals(res!.status, 422);
    const text = await res!.text();
    const parsed = JSON.parse(text);
    assertEquals(parsed.code, RESTRICTED_IDENTIFIER_BLOCKED_CODE);
    assert(Array.isArray(parsed.restricted_kinds) && parsed.restricted_kinds.length > 0);
    // Никаква стойност не напуска сървъра.
    assert(!text.includes(EGN), `${route}: ЕГН в отговора`);
    assert(!text.includes(IBAN), `${route}: IBAN в отговора`);
    assert(!text.includes("641234567"), `${route}: номер на документ в отговора`);
    assert(!text.includes("1020345678"), `${route}: номер на сметка в отговора`);
  });
}

for (const [route, body] of Object.entries(CLEAN_BODIES)) {
  Deno.test(`${route}: тяло само със заместители продължава без пречка`, () => {
    assertEquals(findRestrictedIdentifierKindsDeep(body), []);
    assertEquals(restrictedIdentifierBlock(body, {}), null);
  });
}
