import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { canonicalTurnBinding, decideTurnMode, platformHelpAnswer, sanitizeChatPath } from "./turn-binding.ts";
import { buildVerifiedIndex, noVerifiedAnswerText, validateAnswerCitations } from "./citation-integrity.ts";

const SRC = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const CLIENT = await Deno.readTextFile(
  new URL("../../../src/components/AssistantChat.tsx", import.meta.url),
);

const base = {
  userId: "11111111-1111-4111-8111-111111111111",
  requestedThreadId: null,
  actualThreadId: null,
  message: "Какъв е срокът за отказ по чл. 79 ЗЗД?",
  contextKind: null,
  contextEntityId: null,
  contextVersion: null,
  priorTurnRevision: 0,
  mode: "legal_strict" as const,
  path: "/assistant",
};

Deno.test("обвързването е стабилно и чувствително към всяка съставка", async () => {
  const a = await canonicalTurnBinding(base);
  const b = await canonicalTurnBinding({ ...base });
  assertEquals(a, b, "същата заявка дава същото обвързване");
  assertEquals(a.length, 64);

  for (const patch of [
    { userId: "22222222-2222-4222-8222-222222222222" },
    { message: `${base.message} ` },
    { priorTurnRevision: 1 },
    { contextKind: "saved_document" },
    { contextVersion: "v2" },
    { path: "/console/analysis" },
    { mode: "platform_help" as const },
  ]) {
    const changed = await canonicalTurnBinding({ ...base, ...patch });
    assert(changed !== a, `промяна в ${JSON.stringify(patch)} трябва да смени обвързването`);
  }
});

Deno.test("пътят се изчиства: без query, без hash, без пълен адрес", () => {
  assertEquals(sanitizeChatPath("/catalog?q=наем#top"), "/catalog");
  // Пълен адрес не е път: отхвърля се напълно.
  assertEquals(sanitizeChatPath("https://dogovori.net/kits?ref=x"), "");
  assertEquals(sanitizeChatPath(null), "");
  assertEquals(sanitizeChatPath(42), "");
});

Deno.test("режимът е fail-closed: правните и документните въпроси не минават като помощ", () => {
  assertEquals(decideTurnMode("Здравейте", false).mode, "platform_help");
  assertEquals(decideTurnMode("Как да кача документ?", false).mode, "platform_help");
  assertEquals(decideTurnMode("Какви планове имате?", false).mode, "platform_help");
  // Наличен документен контекст НИКОГА не минава като помощ за платформата.
  assertEquals(decideTurnMode("Как да кача документ?", true).mode, "legal_strict");

  for (
    const q of [
      "Какъв е срокът по чл. 79 ЗЗД?",
      "Прегледай тази клауза за неустойка",
      "Изготви ми договор за наем",
      "Законно ли е това условие?",
      "нещо неясно",
    ]
  ) {
    assertEquals(decideTurnMode(q, false).mode, "legal_strict", q);
  }
});

Deno.test("детерминистичният отговор за платформата не прави правно твърдение", () => {
  const answer = platformHelpAnswer("Как да кача документ?");
  assert(answer.length > 0);
  assert(!/чл\.|ЗЗД|закон/i.test(answer), "няма правно твърдение в помощния отговор");
});

Deno.test("измислен и извънобхватен цитат се отхвърля", () => {
  const citations = [{ index: 1, short_code: "ЗЗД", article_no: "79", citation_label: "[ЗЗД, чл. 79]" }];
  const idx = buildVerifiedIndex(citations as never);
  assert(idx !== null && typeof idx === "object");

  assertEquals(validateAnswerCitations("Отговор [ЗЗД, чл. 79] е верен.", citations as never, {}).ok, true);
  assertEquals(validateAnswerCitations("Отговор [S1].", citations as never, {}).ok, false);
  assertEquals(validateAnswerCitations("Отговор [S7].", citations as never, {}).ok, false);
  assertEquals(
    validateAnswerCitations("Отговор [приложим общ режим по ЗЗД].", citations as never, {}).ok,
    false,
  );
  assertEquals(validateAnswerCitations("Отговор по чл. 143 ЗЗП.", citations as never, {}).ok, false);
});

Deno.test("безопасният отговор без проверена норма не издава чернова", () => {
  const text = noVerifiedAnswerText();
  assert(text.length > 0);
  assert(!/чл\./.test(text));
});

Deno.test("източникът: търсенето е само-четящо и предхожда правната база и резервацията", () => {
  const lookup = SRC.indexOf("await lookupTurn(");
  const legal = SRC.indexOf("await retrieveLegalContext(");
  const reserve = SRC.indexOf("await reserveTurn(");
  const start = SRC.indexOf("await markTurnModelStarted(");
  // Детерминистичният ход също потвърждава, затова проверяваме ПОСЛЕДНОТО
  // потвърждаване — това след стартирания модел.
  const commit = SRC.lastIndexOf("await commitTurn(");
  for (const [name, at] of Object.entries({ lookup, legal, reserve, start, commit })) {
    assert(at > 0, `липсва ${name}`);
  }
  assert(lookup < legal, "търсенето трябва да е преди правната база");
  assert(lookup < reserve, "търсенето трябва да е преди резервацията");
  assert(reserve < start, "резервацията трябва да е преди стартирането на модела");
  assert(start < commit, "потвърждаването е след стартирания модел");
});

Deno.test("източникът: operation_id е задължителен и няма доверие в клиентски препис", () => {
  assert(/operationId/.test(SRC));
  assert(/operation_id_required/.test(SRC), "липсва задължителен идентификатор на операцията");
  assert(!/body\?\.messages/.test(SRC), "клиентският препис не се приема");
  assert(/loadThreadHistory\(/.test(SRC), "историята се чете от сървъра");
});

Deno.test("източникът: несигурност след стартиран модел е изравняване, без отмяна", () => {
  const start = SRC.indexOf("await markTurnModelStarted(");
  const after = SRC.slice(start);
  assert(!/await cancelTurn\(/.test(after), "няма отмяна след стартиран модел");
  assert(/ledgerStateResponse\("reconciliation"\)/.test(after));
});

Deno.test("източникът: таванът на заявките към доставчика е 9 и е наложен", () => {
  assert(/MAX_CHAT_REQUESTS_PER_OPERATION = 9/.test(SRC));
  assert(/providerRequests >= MAX_CHAT_REQUESTS_PER_OPERATION/.test(SRC));
  assert(/MAX_TOOL_ITERATIONS = 8/.test(SRC));
});

Deno.test("източникът: няма наследени квотни повиквания в асистента", () => {
  for (const rpc of ["consume_ai_message", "consume_team_quota", "refund_quota", "consume_quota_session"]) {
    assert(!SRC.includes(`"${rpc}"`), `все още се използва ${rpc}`);
  }
});

Deno.test("клиентът: устойчив ключ на хода с обхват по потребител", () => {
  assert(/getOrCreateTurnOperationId\(/.test(CLIENT));
  assert(/turnScopeHash\(/.test(CLIENT));
  assert(/operationId: turnOperationId/.test(CLIENT));
  assert(/message: finalText/.test(CLIENT));
  assert(!/messages: newMessages\.map/.test(CLIENT), "клиентът не праща целия препис");
  assert(/assistant_turn_in_progress/.test(CLIENT));
  assert(/assistant_turn_reconciliation/.test(CLIENT));
  assert(/clearTurnOperation\(/.test(CLIENT));
});
