import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  analysisIntentOf,
  canonicalTurnBinding,
  decideTurnMode,
  needsLegalClarification,
  platformHelpAnswer,
  sanitizeChatPath,
} from "./turn-binding.ts";
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
  // РЕАЛЕН източник в обхвата се приема — точно това е форматът в подсказката.
  assertEquals(validateAnswerCitations("Отговор [S1].", citations as never, {}).ok, true);
  // Извън обхвата няма какво да бъде проверено: отхвърля се.
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

// ---------------------------------------------------------------------------
// P0-E2 corrective pass — детерминистично уточняване, ред на проверките,
// доказуемо изравняване, точност на SQL и заличаване.
// ---------------------------------------------------------------------------

const SQL = await Deno.readTextFile(
  new URL("../../../drizzle/migrations/0039_assistant_turn_exact_once.sql", import.meta.url),
);
const SQL_PAIR = await Deno.readTextFile(
  new URL("../../migrations/20260920233000_assistant_turn_exact_once.sql", import.meta.url),
);
const TURN_KEY = await Deno.readTextFile(
  new URL("../../../src/lib/assistantTurnKey.ts", import.meta.url),
);
const DELETE_ACCOUNT = await Deno.readTextFile(
  new URL("../delete-account/index.ts", import.meta.url),
);

Deno.test("уточняващият въпрос е детерминистичен и се разпознава преди резервацията", () => {
  const ask = "Наемателят не плаща наема три месеца, какво да правя?";
  assertEquals(needsLegalClarification({ message: ask, history: [] }), true);

  // Вече уточнено от потребителя — втори път не питаме.
  assertEquals(
    needsLegalClarification({
      message: ask,
      history: [{ role: "assistant", content: "За да отговоря точно, уточнете следното:" }],
    }),
    false,
  );
  // Заявка за изготвяне или за анализ на текст не е уточняване.
  assertEquals(needsLegalClarification({ message: "Изготви ми договор за наем", history: [] }), false);
  assert(analysisIntentOf("Прегледай тази клауза за неустойка"));
});

Deno.test("източникът: ключът на доставчика и правата се четат СЛЕД само-четящото търсене", () => {
  const lookup = SRC.indexOf("await lookupTurn(");
  const key = SRC.indexOf('Deno.env.get("LOVABLE_API_KEY")');
  const quota = SRC.indexOf('.from("download_quota")');
  assert(lookup > 0 && key > 0 && quota > 0);
  assert(lookup < key, "ключът на доставчика не бива да блокира възпроизвеждане");
  assert(lookup < quota, "правата не бива да блокират възпроизвеждане");
  // Режимът „уточняване“ участва в обвързването и НЕ таксува.
  assert(/turnMode === "clarification"/.test(SRC) || /clarificationTurn/.test(SRC));
  assert(/charge = turnMode === "legal_strict"/.test(SRC), "само строгият правен ход таксува");
});

Deno.test("източникът: всяка несигурност след стартиран модел минава през доказуем преход", () => {
  assert(/markTurnReconciliation\(/.test(SRC));
  const calls = SRC.match(/markTurnReconciliation\(/g) ?? [];
  assert(calls.length >= 3, `очаквани поне 3 извиквания, намерени ${calls.length}`);
});

Deno.test("SQL: двата екземпляра на 0039 са байт-идентични", () => {
  assertEquals(SQL, SQL_PAIR);
});

Deno.test("SQL: отказът не оставя празен разговор, нито изразходвано право", () => {
  const reserve = SQL.slice(
    SQL.indexOf("FUNCTION public.assistant_turn_reserve"),
    SQL.indexOf("FUNCTION public.assistant_turn_mark_model_started"),
  );
  const firstDenied = reserve.indexOf("'status', 'denied'");
  const threadInsert = reserve.indexOf("INSERT INTO public.assistant_threads");
  assert(firstDenied > 0 && threadInsert > 0);
  assert(firstDenied < threadInsert, "разговор се създава само след потвърдено право");
  assert(!/DELETE FROM public\.assistant_turn_operations/.test(reserve), "отмененият ред остава");
  assert(/_reuse := true;/.test(reserve), "повторният опит преизползва същата операция");
  assert(/p_binding !~ '\^\[0-9a-f\]\{64\}\$'/.test(reserve), "строга проверка на обвързването");
  assert(/'platform_help', 'legal_strict', 'clarification'/.test(reserve));
  assert(/allocation_without_charge/.test(reserve));
  assert(/'prior', _prior/.test(reserve), "произходът на превъртения прозорец се записва");
});

Deno.test("SQL: отмяната възстановява точно и не маскира недостиг", () => {
  const cancelStart = SQL.indexOf("FUNCTION public.assistant_turn_cancel");
  const cancel = SQL.slice(
    cancelStart,
    SQL.indexOf("CREATE OR REPLACE FUNCTION", cancelStart + 60),
  );
  assert(cancel.length > 500);
  assert(!/GREATEST\(/.test(cancel), "няма маскиране на недостиг");
  assert(/window_changed/.test(cancel), "различен прозорец => изравняване");
  assert(/provenance_missing/.test(cancel));
  assert(/monthly_reset_at = \(_prior->>'monthly_reset_at'\)::timestamptz/.test(cancel));
});

Deno.test("SQL: частичните индекси имат предикат в целта на конфликта", () => {
  assert(!/ON CONFLICT \(operation_id, role\) DO NOTHING/.test(SQL));
  assert(!/ON CONFLICT \(operation_id\) DO NOTHING/.test(SQL));
  const guarded = SQL.match(/ON CONFLICT \([^)]*operation_id[^)]*\) WHERE operation_id IS NOT NULL/g) ?? [];
  assert(guarded.length >= 3, `очаквани поне 3 защитени цели, намерени ${guarded.length}`);
});

Deno.test("SQL: таблицата не е достъпна за анонимни и удостоверени роли", () => {
  assert(/REVOKE ALL ON TABLE public\.assistant_turn_operations FROM anon;/.test(SQL));
  assert(/REVOKE ALL ON TABLE public\.assistant_turn_operations FROM authenticated;/.test(SQL));
});

Deno.test("SQL: изтекъл лизинг не стартира модел, а отива за изравняване", () => {
  const mark = SQL.slice(
    SQL.indexOf("FUNCTION public.assistant_turn_mark_model_started"),
    SQL.indexOf("FUNCTION public.assistant_turn_mark_reconciliation"),
  );
  assert(/lease_expired_before_model/.test(mark));
  assert(/FUNCTION public\.assistant_turn_mark_reconciliation/.test(SQL));
  assert(
    /GRANT EXECUTE ON FUNCTION public\.assistant_turn_mark_reconciliation\(uuid, uuid, text\) TO service_role;/
      .test(SQL),
  );
});

Deno.test("SQL: записаният транскрипт носи реалния идентификатор на предложението", () => {
  assert(/jsonb_set\(t\.ev, '\{data,proposal,id\}', to_jsonb\(_proposal_id\)\)/.test(SQL));
  assert(/'events', _events/.test(SQL));
});

Deno.test("клиентът: без суров идентификатор на потребител и с чистене при смяна на профил", () => {
  assert(/assistant_turn_user_v1:/.test(TURN_KEY), "обхватът се хешира");
  assert(!/localStorage\.setItem\([^)]*userId/.test(TURN_KEY));
  assert(/clearTurnOperationsForOtherUsers\(/.test(CLIENT));
  assert(/sendingRef/.test(CLIENT), "синхронна защита срещу двойно изпращане");
});

Deno.test("заличаването е fail-closed: без изчистен транскрипт няма изтрит профил", () => {
  assert(/purge_assistant_turn_payloads/.test(DELETE_ACCOUNT));
  const purge = DELETE_ACCOUNT.indexOf("purge_assistant_turn_payloads");
  const erasure = DELETE_ACCOUNT.indexOf("erasure_incomplete");
  assert(purge > 0 && erasure > purge);
});

/* -------------------------------------------------------------------------
 * P0-E2 финален корректив: точност по ПОСОЧЕНИЯ източник, точна идентичност на
 * заявката и устойчив ключ при възстановяване на сесията.
 * ------------------------------------------------------------------------- */

const ZZD_79 = {
  short_code: "ЗЗД",
  article_no: "79",
  paragraph_no: null,
  citation_label: "[ЗЗД, чл. 79]",
  content: "Чл. 79. Ако длъжникът не изпълни точно задължението си…",
};
const ZZP_143 = {
  short_code: "ЗЗП",
  article_no: "143",
  paragraph_no: "1",
  citation_label: "[ЗЗП, чл. 143, ал. 1]",
  content: "Чл. 143, ал. 1. Неравноправна е клауза…",
};

Deno.test("цитатът се проверява срещу ПОСОЧЕНАТА извадка, не срещу целия набор", () => {
  const sources = [ZZD_79, ZZP_143];
  // Твърдението е за ЗЗП чл. 143 — то се намира в S2, но е цитирано като S1.
  const wrong = validateAnswerCitations("Клаузата е неравноправна по чл. 143 ЗЗП [S1].", sources as never, {});
  assertEquals(wrong.ok, false, "чужд източник не подкрепя твърдението");
  if (!wrong.ok) assertEquals(wrong.reason, "source_claim_mismatch");

  // Същото твърдение с ТОЧНИЯ източник минава.
  assertEquals(
    validateAnswerCitations("Клаузата е неравноправна по чл. 143 ЗЗП [S2].", sources as never, {}).ok,
    true,
  );
  assertEquals(
    validateAnswerCitations("Длъжникът отговаря по чл. 79 ЗЗД [S1].", sources as never, {}).ok,
    true,
  );
});

Deno.test("грешен член, грешна алинея и извън обхвата се отхвърлят", () => {
  const sources = [ZZD_79, ZZP_143];
  for (
    const text of [
      "Отговорността е по чл. 82 ЗЗД [S1].",
      "Клаузата е неравноправна по чл. 143, ал. 4 ЗЗП [S2].",
      "Отговорността е по чл. 79 ЗЗД [S3].",
      "Според ТР № 4/2013 ОСГТК ВКС [S1] е така.",
    ]
  ) {
    assertEquals(validateAnswerCitations(text, sources as never, {}).ok, false, text);
  }
  // Правилната алинея на правилния източник минава.
  assertEquals(
    validateAnswerCitations("По чл. 143, ал. 1 ЗЗП [S2] клаузата е неравноправна.", sources as never, {}).ok,
    true,
  );
});

Deno.test("обвързването носи изрично предназначение", async () => {
  assertEquals(TURN_BINDING_PURPOSE, "assistant_chat");
  const a = await canonicalTurnBinding(base);
  const b = await canonicalTurnBinding({ ...base, mode: "clarification" });
  assert(a !== b, "режимът уточняване има собствено обвързване");
});

Deno.test("източникът: идентичността на заявката е точна, без тихо отрязване", () => {
  assert(/message_too_long/.test(SRC), "прекалено дълго съобщение е типизирана грешка");
  assert(/invalid_thread_id/.test(SRC), "невалиден разговор е типизирана грешка");
  assert(
    !/rawMessage\.slice\(/.test(SRC),
    "суровото съобщение НЕ се отрязва преди обвързване и запис",
  );
  assert(
    /validateAnswerCitations\(cleaned, verifiedLegal\.chunks/.test(SRC),
    "проверката на цитатите получава подредените проверени извадки",
  );
});

Deno.test("клиентът: ключът на хода преживява възстановяването на сесията", () => {
  assert(/loading: authLoading/.test(CLIENT), "клиентът чете състоянието на зареждане");
  assert(/if \(authLoading\) return;/.test(CLIENT), "докато сесията се зарежда, нищо не се чисти");
  const effect = CLIENT.slice(CLIENT.indexOf("if (authLoading) return;"));
  assert(
    /\[authLoading, user\?\.id\]/.test(effect.slice(0, 600)),
    "изчистването зависи и от потвърденото състояние на сесията",
  );
  const inProgress = CLIENT.slice(CLIENT.indexOf('code === "assistant_turn_in_progress"'));
  assert(
    /setInput\(text\)/.test(inProgress.slice(0, 500)),
    "при вече течащ ход текстът се връща в полето за ръчен повторен опит",
  );
});
